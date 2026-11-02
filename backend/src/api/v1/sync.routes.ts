import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { auth, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { dbPool } from '../../db/client';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { AppError } from '../../utils/errors';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { assertFieldDateWritable } from '../../services/seasons.service';

export const syncRouter = Router();
const assignmentRepo = new AssignmentRepository();

// All sync routes require authentication
syncRouter.use(auth);

// Schema for batch operations
const batchCreateSchema = z.object({
  harvests: z.array(z.object({
    localId: z.string(),
    field_id: z.string().uuid(),
    harvest_date: z.string(),
    quantity_kg: z.number().positive(),
    quality_grade: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  fertigations: z.array(z.object({
    localId: z.string(),
    field_id: z.string().uuid(),
    application_date: z.string(),
    water_amount: z.number().positive(),
    fertilizer_type: z.string().optional(),
    fertilizer_amount: z.number().optional(),
    notes: z.string().optional(),
  })).optional(),
  ecphEntries: z.array(z.object({
    localId: z.string(),
    field_id: z.string().uuid(),
    measurement_date: z.string(),
    ec_in: z.number().optional(),
    ec_out: z.number().optional(),
    ph_in: z.number().optional(),
    ph_out: z.number().optional(),
    drip_volume_ml: z.number().optional(),
    notes: z.string().optional(),
  })).optional(),
});

// Batch create endpoint for offline sync
syncRouter.post(
  '/batch',
  validate({ body: batchCreateSchema }),
  async (req: AuthRequest, res, next) => {
    const client = await dbPool.connect();
    const user = req.user!;

    try {
      // Offline sync writes harvest, fertigation and EC/pH rows, so it has the
      // same owners as those entry pages: the data-entry worker and the agronomist.
      assertCanOperateDataEntry(user);

      // Validate field access for non-CEO: workers can only sync data for their assigned fields
      if (user.role !== 'ceo') {
        const fieldIds = new Set<string>();
        for (const h of req.body.harvests ?? []) fieldIds.add(h.field_id);
        for (const f of req.body.fertigations ?? []) fieldIds.add(f.field_id);
        for (const e of req.body.ecphEntries ?? []) fieldIds.add(e.field_id);
        for (const fieldId of fieldIds) {
          const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, fieldId, requireOrgId(req));
          if (!canAccess) throw new AppError('You do not have access to one or more fields in this batch', 'FORBIDDEN', 403);
        }
      }

      // Every row must fall in a writable season, as with online harvest and
      // EC/pH entry: closed (or reopen-pending) seasons refuse new work.
      for (const h of req.body.harvests ?? []) await assertFieldDateWritable(h.field_id, h.harvest_date);
      for (const f of req.body.fertigations ?? []) await assertFieldDateWritable(f.field_id, f.application_date);
      for (const e of req.body.ecphEntries ?? []) await assertFieldDateWritable(e.field_id, e.measurement_date);

      await client.query('BEGIN');
      
      const results: {
        harvests: { localId: string; serverId: string }[];
        fertigations: { localId: string; serverId: string }[];
        ecphEntries: { localId: string; serverId: string }[];
      } = {
        harvests: [],
        fertigations: [],
        ecphEntries: [],
      };

      // Process harvests
      if (req.body.harvests?.length) {
        for (const harvest of req.body.harvests) {
          const result = await client.query(
            `INSERT INTO harvests (field_id, harvest_date, quantity_kg, quality_grade, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [harvest.field_id, harvest.harvest_date, harvest.quantity_kg, harvest.quality_grade, harvest.notes]
          );
          results.harvests.push({ localId: harvest.localId, serverId: result.rows[0].id });
        }
      }

      // Process fertigations
      if (req.body.fertigations?.length) {
        for (const fert of req.body.fertigations) {
          const result = await client.query(
            `INSERT INTO fertigation_entries (field_id, date, daily_water, fertilizers)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [fert.field_id, fert.application_date || fert.date, fert.water_amount || fert.daily_water, fert.fertilizers ? JSON.stringify(fert.fertilizers) : null]
          );
          results.fertigations.push({ localId: fert.localId, serverId: result.rows[0].id });
        }
      }

      // Process EC/PH entries
      if (req.body.ecphEntries?.length) {
        for (const entry of req.body.ecphEntries) {
          const entryResult = await client.query(
            `INSERT INTO ecph_entries (field_id, date, time, qty_of_water)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [entry.field_id, entry.measurement_date || entry.date, entry.time || null, entry.qty_of_water || null]
          );
          const ecphId = entryResult.rows[0].id;
          // Insert valve reading with EC/PH values
          if (entry.ec_in != null || entry.ph_in != null) {
            await client.query(
              `INSERT INTO ecph_valve_readings (ecph_entry_id, valve_number, ec_in, ec, ph_in, ph, drip_volume)
               VALUES ($1, 1, $2, $3, $4, $5, $6)`,
              [ecphId, entry.ec_in || null, entry.ec_out || null, entry.ph_in || null, entry.ph_out || null, entry.drip_volume_ml || null]
            );
          }
          results.ecphEntries.push({ localId: entry.localId, serverId: ecphId });
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
);

// Get changes since a timestamp
const changesQuerySchema = z.object({
  since: z.string().optional(), // ISO timestamp
});

syncRouter.get(
  '/changes',
  validate({ query: changesQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const since = req.query.since as string | undefined;
      const sinceDate = since ? new Date(since).toISOString() : new Date(0).toISOString();
      const user = req.user!;
      const orgId = requireOrgId(req);

      // Non-CEO users only get data for their assigned sites/farm areas/fields
      let allowedFieldIds: string[] | null = null;
      let allowedFarmAreaIds: string[] | null = null;
      let allowedSiteIds: string[] | null = null;
      if (user.role !== 'ceo') {
        [allowedSiteIds, allowedFarmAreaIds, allowedFieldIds] = await Promise.all([
          assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId),
          assignmentRepo.getUserAccessibleFarmAreaIds(user.userId, user.role, orgId),
          assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId),
        ]);
      }

      const buildFieldFilter = (fieldIdCol: string, paramIdx: number) =>
        allowedFieldIds === null ? '' : ` AND ${fieldIdCol} = ANY($${paramIdx}::uuid[])`;
      const orgFieldFilter = ' AND COALESCE({alias}.organization_id, f.organization_id) = $2';
      const harvestOrgFilter = orgFieldFilter.replace('{alias}', 'h');
      const fertOrgFilter = orgFieldFilter.replace('{alias}', 'fe');
      const ecphOrgFilter = orgFieldFilter.replace('{alias}', 'e');
      const harvestFieldFilter = buildFieldFilter('h.field_id', 3);
      const fertFieldFilter = buildFieldFilter('fe.field_id', 3);
      const ecphFieldFilter = buildFieldFilter('e.field_id', 3);
      const harvestParams = allowedFieldIds === null ? [sinceDate, orgId] : [sinceDate, orgId, allowedFieldIds];
      const fertParams = allowedFieldIds === null ? [sinceDate, orgId] : [sinceDate, orgId, allowedFieldIds];
      const ecphParams = allowedFieldIds === null ? [sinceDate, orgId] : [sinceDate, orgId, allowedFieldIds];

      const fieldsQuery = allowedFieldIds === null
        ? dbPool.query(
            'SELECT * FROM fields WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2',
            [sinceDate, orgId],
          )
        : dbPool.query(
            'SELECT * FROM fields WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2 AND id = ANY($3::uuid[])',
            [sinceDate, orgId, allowedFieldIds],
          );
      const farmAreasQuery = allowedFarmAreaIds === null
        ? dbPool.query(
            `SELECT fa.* FROM farm_areas fa
             JOIN sites s ON s.id = fa.site_id
             WHERE (fa.updated_at > $1 OR fa.created_at > $1) AND s.organization_id = $2`,
            [sinceDate, orgId],
          )
        : dbPool.query(
            'SELECT * FROM farm_areas WHERE (updated_at > $1 OR created_at > $1) AND id = ANY($3::uuid[])',
            [sinceDate, orgId, allowedFarmAreaIds],
          );
      const sitesQuery = allowedSiteIds === null
        ? dbPool.query(
            'SELECT * FROM sites WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2',
            [sinceDate, orgId],
          )
        : dbPool.query(
            'SELECT * FROM sites WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2 AND id = ANY($3::uuid[])',
            [sinceDate, orgId, allowedSiteIds],
          );

      const [harvests, fertigations, ecphEntries, fieldsResult, farmAreasResult, sitesResult, crops] = await Promise.all([
        dbPool.query(
          `SELECT h.*, f.name as field_name 
           FROM harvests h 
           LEFT JOIN fields f ON h.field_id = f.id 
           WHERE (h.updated_at > $1 OR h.created_at > $1)${harvestOrgFilter}${harvestFieldFilter}
           ORDER BY h.created_at DESC`,
          harvestParams
        ),
        dbPool.query(
          `SELECT fe.*, f.name as field_name 
           FROM fertigation_entries fe 
           LEFT JOIN fields f ON fe.field_id = f.id 
           WHERE (fe.updated_at > $1 OR fe.created_at > $1)${fertOrgFilter}${fertFieldFilter}
           ORDER BY fe.created_at DESC`,
          fertParams
        ),
        dbPool.query(
          `SELECT e.*, f.name as field_name 
           FROM ecph_entries e 
           LEFT JOIN fields f ON e.field_id = f.id 
           WHERE (e.updated_at > $1 OR e.created_at > $1)${ecphOrgFilter}${ecphFieldFilter}
           ORDER BY e.created_at DESC`,
          ecphParams
        ),
        fieldsQuery,
        farmAreasQuery,
        sitesQuery,
        dbPool.query('SELECT * FROM crops WHERE updated_at > $1 OR created_at > $1', [sinceDate]),
      ]);

      res.json({
        success: true,
        data: {
          harvests: harvests.rows,
          fertigations: fertigations.rows,
          ecphEntries: ecphEntries.rows,
          fields: fieldsResult.rows,
          farmAreas: farmAreasResult.rows,
          sites: sitesResult.rows,
          crops: crops.rows,
          syncTimestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
