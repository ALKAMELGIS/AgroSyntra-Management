import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorizeFieldStaffRead, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { requireOrgId } from '../middleware/tenant';
import { requireDataEntryWriter } from '../middleware/dataEntryWrite';
import { syncFieldCrop } from '../../utils/fieldCropSync';
import { createCropHistoryForPlanting, rotationStartDate } from '../../utils/cropHistoryForPlanting';
import {
  listActiveOccupancy,
  uprootPlanting,
  uprootSchema,
} from '../../services/plantingUproot.service';
import { AmbiguousSegmentSplitError } from '../../utils/plantingSegmentTokens';
import { AppError, NotFoundError } from '../../utils/errors';
import { preparePlantingInsert } from '../../services/seasons.service';
import { importPlantingCycles } from '../../services/plantingImportCycles.service';
import { coerceOpenFieldPlantingDates } from '../../utils/openFieldSowing';

export const plantingRecordRouter = Router();
plantingRecordRouter.use(auth);
plantingRecordRouter.use(authorizeFieldStaffRead);
// Everyone above may read; only workers and agronomists record planting.
plantingRecordRouter.use(requireDataEntryWriter);

const recordSchema = z.object({
  seedingDate: z.string().min(1),
  fieldId: z.string().uuid().optional().nullable(),
  segment: z.string().optional().nullable(),
  totalArea: z.string().optional().nullable(),
  cropId: z.string().uuid().optional().nullable(),
  varietyId: z.string().uuid().optional().nullable(),
  cropSubClass: z.string().optional().nullable(),
  cropType: z.string().optional().nullable(),
  breeder: z.string().optional().nullable(),
  breederId: z.string().uuid().optional().nullable(),
  lotBatchNo: z.string().optional().nullable(),
  pmQuantity: z.union([z.number(), z.string()]).optional().nullable(),
  uom: z.string().optional().nullable(),
  traysPerHec: z.string().optional().nullable(),
  ratePerHec: z.string().optional().nullable(),
  transplantDate: z.string().optional().nullable(),
  authorizedBy: z.string().optional().nullable(),
  sowingRecordId: z.string().uuid().optional().nullable(),
});

// List planting records (filterable by site)
plantingRecordRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;
  const orgId = requireOrgId(req);

  let query = `
    SELECT pr.*,
           f.name AS field_name, c.name AS crop_name, cv.name AS variety_name,
           b.name AS breeder_name,
           fa.name AS farm_area_name, s.name AS site_name, s.id AS site_id
    FROM planting_records pr
    LEFT JOIN fields f ON f.id = pr.field_id
    LEFT JOIN crops c ON c.id = pr.crop_id
    LEFT JOIN crop_varieties cv ON cv.id = pr.variety_id
    LEFT JOIN breeders b ON b.id = pr.breeder_id
    LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
    LEFT JOIN sites s ON s.id = fa.site_id
    WHERE COALESCE(pr.organization_id, f.organization_id) = $1
  `;
  const params: any[] = [orgId];

  if (siteId) {
    query += ` AND (s.id = $2 OR pr.field_id IS NULL)`;
    params.push(siteId);
  }

  query += ` ORDER BY pr.seeding_date ASC, pr.transplant_date ASC NULLS LAST, f.name ASC`;

  const result = await dbPool.query(query, params);
  res.json({ success: true, data: result.rows });
}));

// Create single record
plantingRecordRouter.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = recordSchema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const data = await coerceOpenFieldPlantingDates(parsed, null, client);

    let cropHistoryId: string | null = null;
    const rotationStart = rotationStartDate(data.transplantDate, data.seedingDate);
    if (data.fieldId && data.cropId && rotationStart) {
      cropHistoryId = await createCropHistoryForPlanting(
        data.fieldId, data.cropId, data.varietyId || null,
        rotationStart, client
      );
    }

    const occupancyDate = data.transplantDate || data.seedingDate;
    const { seasonId, cycleNumber } = await preparePlantingInsert(
      'planting_records',
      {
        fieldId: data.fieldId || null,
        segment: data.segment || null,
        cropId: data.cropId || null,
        occupancyDate,
      },
      client,
    );

    const result = await client.query(
      `INSERT INTO planting_records
       (organization_id, seeding_date, field_id, segment, total_area,
        crop_id, variety_id, crop_sub_class, crop_type, breeder, breeder_id,
        lot_batch_no, pm_quantity, uom, trays_per_hec, rate_per_hec,
        transplant_date, authorized_by, crop_history_id, sowing_record_id,
        season_id, cycle_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        orgId, data.seedingDate, data.fieldId || null, data.segment || null, data.totalArea || null,
        data.cropId || null, data.varietyId || null, data.cropSubClass || null, data.cropType || 'Annual',
        data.breeder || null, data.breederId || null, data.lotBatchNo || null,
        data.pmQuantity ? Number(data.pmQuantity) : null, data.uom || null,
        data.traysPerHec || null, data.ratePerHec || null,
        data.transplantDate || null, data.authorizedBy || null, cropHistoryId,
        data.sowingRecordId || null, seasonId, cycleNumber,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Update single record
plantingRecordRouter.put('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = recordSchema.partial().parse(req.body);
  const id = req.params.id;

  const existing = await dbPool.query(
    `SELECT pr.field_id, pr.seeding_date FROM planting_records pr
     WHERE pr.id = $1::uuid
       AND COALESCE(pr.organization_id, (SELECT f.organization_id FROM fields f WHERE f.id = pr.field_id)) = $2`,
    [id, requireOrgId(req)]
  );
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }
  const data = await coerceOpenFieldPlantingDates(parsed, existing.rows[0], dbPool);

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const addSet = (col: string, val: any, cast = '') => {
    sets.push(`${col} = $${idx}${cast}`);
    params.push(val ?? null);
    idx++;
  };

  if (data.seedingDate !== undefined) addSet('seeding_date', data.seedingDate);
  if (data.fieldId !== undefined) addSet('field_id', data.fieldId || null, '::uuid');
  if (data.segment !== undefined) addSet('segment', data.segment || null);
  if (data.totalArea !== undefined) addSet('total_area', data.totalArea || null);
  if (data.cropId !== undefined) addSet('crop_id', data.cropId || null, '::uuid');
  if (data.varietyId !== undefined) addSet('variety_id', data.varietyId || null, '::uuid');
  if (data.cropSubClass !== undefined) addSet('crop_sub_class', data.cropSubClass || null);
  if (data.cropType !== undefined) addSet('crop_type', data.cropType || null);
  if (data.breeder !== undefined) addSet('breeder', data.breeder || null);
  if (data.breederId !== undefined) addSet('breeder_id', data.breederId || null, '::uuid');
  if (data.lotBatchNo !== undefined) addSet('lot_batch_no', data.lotBatchNo || null);
  if (data.pmQuantity !== undefined) addSet('pm_quantity', data.pmQuantity ? Number(data.pmQuantity) : null);
  if (data.uom !== undefined) addSet('uom', data.uom || null);
  if (data.traysPerHec !== undefined) addSet('trays_per_hec', data.traysPerHec || null);
  if (data.ratePerHec !== undefined) addSet('rate_per_hec', data.ratePerHec || null);
  if (data.transplantDate !== undefined) addSet('transplant_date', data.transplantDate || null);
  if (data.authorizedBy !== undefined) addSet('authorized_by', data.authorizedBy || null);
  if (data.sowingRecordId !== undefined) addSet('sowing_record_id', data.sowingRecordId || null, '::uuid');

  if (sets.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
  }

  // Stamp without a bind param so placeholders stay contiguous ($1..$n, then id).
  sets.push('updated_at = NOW()');
  params.push(id);
  const result = await dbPool.query(
    `UPDATE planting_records SET ${sets.join(', ')} WHERE id = $${idx}::uuid RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }

  const row = result.rows[0];
  const rotationStart = rotationStartDate(row.transplant_date, row.seeding_date);
  if (row.field_id && row.crop_id && rotationStart) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      if (row.crop_history_id) {
        await client.query(
          `UPDATE crop_history SET crop_id = $1, variety_id = $2 WHERE id = $3`,
          [row.crop_id, row.variety_id || null, row.crop_history_id]
        );
        await syncFieldCrop(row.field_id, client);
      } else {
        const chId = await createCropHistoryForPlanting(
          row.field_id, row.crop_id, row.variety_id, rotationStart, client
        );
        if (chId) {
          await client.query('UPDATE planting_records SET crop_history_id = $1 WHERE id = $2', [chId, id]);
          row.crop_history_id = chId;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  res.json({ success: true, data: row });
}));

// Bulk create (for Excel import and batch save)
plantingRecordRouter.post('/bulk', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    entries: z.array(recordSchema).min(1),
  });
  const { entries } = schema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;

  const client = await dbPool.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    for (const raw of entries) {
      const e = await coerceOpenFieldPlantingDates(raw, null, client);
      let cropHistoryId: string | null = null;
      const rotationStart = rotationStartDate(e.transplantDate, e.seedingDate);
      if (e.fieldId && e.cropId && rotationStart) {
        cropHistoryId = await createCropHistoryForPlanting(
          e.fieldId, e.cropId, e.varietyId || null,
          rotationStart, client
        );
      }

      const occupancyDate = e.transplantDate || e.seedingDate;
      const { seasonId, cycleNumber } = await preparePlantingInsert(
        'planting_records',
        {
          fieldId: e.fieldId || null,
          segment: e.segment || null,
          cropId: e.cropId || null,
          occupancyDate,
        },
        client,
      );

      await client.query(
        `INSERT INTO planting_records
         (organization_id, seeding_date, field_id, segment, total_area,
          crop_id, variety_id, crop_sub_class, crop_type, breeder, breeder_id,
          lot_batch_no, pm_quantity, uom, trays_per_hec, rate_per_hec,
          transplant_date, authorized_by, crop_history_id, sowing_record_id,
          season_id, cycle_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          orgId, e.seedingDate, e.fieldId || null, e.segment || null, e.totalArea || null,
          e.cropId || null, e.varietyId || null, e.cropSubClass || null, e.cropType || 'Annual',
          e.breeder || null, e.breederId || null, e.lotBatchNo || null,
          e.pmQuantity ? Number(e.pmQuantity) : null, e.uom || null,
          e.traysPerHec || null, e.ratePerHec || null,
          e.transplantDate || null, e.authorizedBy || null, cropHistoryId,
          e.sowingRecordId || null, seasonId, cycleNumber,
        ]
      );
      created++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ success: true, data: { created, total: entries.length } });
}));

plantingRecordRouter.post('/import-cycles', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    fieldId: z.string().uuid(),
    uproots: z.array(z.object({
      segments: z.union([z.literal('ALL'), z.array(z.string().min(1)).min(1)]),
      uprootDate: z.string().min(1),
      afterDate: z.string().optional().nullable(),
      beforeDate: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
    })).optional().default([]),
    entries: z.array(recordSchema.extend({
      existingId: z.string().uuid().optional().nullable(),
      skipOccupancy: z.boolean().optional(),
    })).min(1),
  });
  const data = schema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;
  const userId = (req as any).user?.id || null;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const summary = await importPlantingCycles(
      {
        table: 'planting_records',
        fieldId: data.fieldId,
        uproots: data.uproots,
        entries: data.entries,
        organizationId: orgId,
        userId,
      },
      client,
    );
    await client.query('COMMIT');
    res.json({ success: true, data: summary });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof AmbiguousSegmentSplitError) {
      throw new AppError(err.message, 'AMBIGUOUS_SEGMENTS', 400);
    }
    throw err;
  } finally {
    client.release();
  }
}));

// Sync field crops from planting records (set current_crop_id, variety_id if single variety)
plantingRecordRouter.post('/sync-fields', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;
  if (!siteId) {
    return res.status(400).json({ success: false, error: { message: 'site_id is required' } });
  }
  const site = await dbPool.query(
    `SELECT id FROM sites WHERE id = $1 AND organization_id = $2`,
    [siteId, requireOrgId(req)]
  );
  if (site.rows.length === 0) throw new NotFoundError('Site not found');

  const result = await dbPool.query(
    `SELECT pr.field_id, pr.crop_id, pr.variety_id
     FROM planting_records pr
     JOIN fields f ON f.id = pr.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1 AND pr.field_id IS NOT NULL AND pr.crop_id IS NOT NULL`,
    [siteId]
  );

  const fieldMap: Record<string, { crops: Set<string>; varieties: Set<string>; cropId: string; varietyId: string | null }> = {};
  for (const row of result.rows) {
    if (!fieldMap[row.field_id]) {
      fieldMap[row.field_id] = { crops: new Set(), varieties: new Set(), cropId: row.crop_id, varietyId: row.variety_id };
    }
    fieldMap[row.field_id].crops.add(row.crop_id);
    if (row.variety_id) fieldMap[row.field_id].varieties.add(row.variety_id);
  }

  let synced = 0;
  for (const [fieldId, data] of Object.entries(fieldMap)) {
    const cropId = data.crops.size === 1 ? [...data.crops][0] : [...data.crops][0];
    const varietyId = data.varieties.size === 1 ? [...data.varieties][0] : null;
    await dbPool.query(
      `UPDATE fields SET current_crop_id = $1, variety_id = $2, updated_at = NOW() WHERE id = $3`,
      [cropId, varietyId, fieldId]
    );
    synced++;
  }

  res.json({ success: true, data: { fieldsSynced: synced } });
}));

// Reset planting data for a site (bulk clear planting records, crop history, and field assignments)
/** What is still growing on a greenhouse/nethouse field. See open field notes. */
plantingRecordRouter.get('/occupancy', asyncHandler(async (req: AuthRequest, res: Response) => {
  const fieldId = req.query.field_id as string | undefined;
  if (!fieldId) {
    return res.status(400).json({ success: false, error: { message: 'field_id is required' } });
  }

  const rows = await listActiveOccupancy('planting_records', fieldId);
  const occupied = [...new Set(rows.flatMap((row) => row.segmentTokens))];
  res.json({ success: true, data: { fieldId, occupied, rows } });
}));

/**
 * Free all or part of a greenhouse/nethouse field for the next cycle.
 *
 * Same mechanics as open field. Occupancy here starts at the transplant date,
 * so a record still in trays is not holding the field and cannot be uprooted
 * from it.
 */
plantingRecordRouter.post(
  '/uproot',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = uprootSchema.parse(req.body);
    const orgId = (req as any).user?.organizationId || null;
    const userId = (req as any).user?.id || null;

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const summary = await uprootPlanting(
        {
          table: 'planting_records',
          fieldId: data.fieldId,
          segments: data.segments,
          uprootDate: data.uprootDate,
          reason: data.reason || null,
          userId,
          organizationId: orgId,
        },
        client,
      );
      await client.query('COMMIT');
      res.json({ success: true, data: summary });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof AmbiguousSegmentSplitError) {
        throw new AppError(err.message, 'AMBIGUOUS_SEGMENTS', 400);
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

// Bulk reassign variety on planting records (change old variety to new variety across a site)
plantingRecordRouter.post('/reassign-variety', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    siteId: z.string().uuid(),
    oldVarietyId: z.string().uuid(),
    newVarietyId: z.string().uuid(),
  });
  const { siteId, oldVarietyId, newVarietyId } = schema.parse(req.body);
  const orgId = requireOrgId(req);
  const site = await dbPool.query(
    `SELECT id FROM sites WHERE id = $1 AND organization_id = $2`,
    [siteId, orgId]
  );
  if (site.rows.length === 0) throw new NotFoundError('Site not found');

  const result = await dbPool.query(
    `UPDATE planting_records pr
     SET variety_id = $1, updated_at = NOW()
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE pr.field_id = f.id AND fa.site_id = $2 AND pr.variety_id = $3`,
    [newVarietyId, siteId, oldVarietyId]
  );

  res.json({ success: true, data: { updated: result.rowCount } });
}));

// Delete single record (must be AFTER /reset to avoid /:id matching 'reset')
plantingRecordRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const result = await dbPool.query(
    `DELETE FROM planting_records pr
     WHERE pr.id = $1::uuid
       AND COALESCE(pr.organization_id, (SELECT f.organization_id FROM fields f WHERE f.id = pr.field_id)) = $2`,
    [req.params.id, orgId]
  );
  if (!result.rowCount) throw new NotFoundError('Planting record not found');
  res.json({ success: true });
}));

// Toggle nursery flag on a field
plantingRecordRouter.patch('/nursery/:fieldId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { fieldId } = req.params;
  const { isNursery } = req.body;
  const orgId = requireOrgId(req);
  const result = await dbPool.query(
    `UPDATE fields SET is_nursery = $1, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
    [!!isNursery, fieldId, orgId]
  );
  if (!result.rowCount) throw new NotFoundError('Field not found');
  res.json({ success: true });
}));

// Get nursery fields for a site
plantingRecordRouter.get('/nurseries', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;
  let query = `
    SELECT f.id, f.name, fa.name AS farm_area_name, s.name AS site_name
    FROM fields f
    JOIN farm_areas fa ON fa.id = f.farm_area_id
    JOIN sites s ON s.id = fa.site_id
    WHERE f.is_nursery = true
  `;
  const params: any[] = [];
  if (siteId) {
    query += ` AND s.id = $1`;
    params.push(siteId);
  }
  query += ` ORDER BY f.name`;
  const result = await dbPool.query(query, params);
  res.json({ success: true, data: result.rows });
}));
