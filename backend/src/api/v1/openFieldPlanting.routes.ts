import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { requireOrgId } from '../middleware/tenant';
import { requireDataEntryWriter } from '../middleware/dataEntryWrite';
import { createCropHistoryForPlanting } from '../../utils/cropHistoryForPlanting';
import {
  listActiveOccupancy,
  uprootPlanting,
  uprootSchema,
} from '../../services/plantingUproot.service';
import { AmbiguousSegmentSplitError } from '../../utils/plantingSegmentTokens';
import { AppError, NotFoundError } from '../../utils/errors';
import { preparePlantingInsert } from '../../services/seasons.service';
import { importPlantingCycles } from '../../services/plantingImportCycles.service';

export const openFieldPlantingRouter = Router();
openFieldPlantingRouter.use(auth);
openFieldPlantingRouter.use(authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
// Everyone above may read; only workers and agronomists record open field planting.
openFieldPlantingRouter.use(requireDataEntryWriter);

const recordSchema = z.object({
  seedingDate: z.string().min(1),
  fieldId: z.string().uuid().optional().nullable(),
  segment: z.string().optional().nullable(),
  totalArea: z.string().optional().nullable(),
  cropId: z.string().uuid().optional().nullable(),
  varietyId: z.string().uuid().optional().nullable(),
  cropType: z.string().optional().nullable(),
  breederId: z.string().uuid().optional().nullable(),
  lotBatchNo: z.string().optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional().nullable(),
  uom: z.string().optional().nullable(),
  authorizedBy: z.string().optional().nullable(),
});

openFieldPlantingRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;
  const orgId = requireOrgId(req);

  let query = `
    SELECT ofp.*,
           f.name AS field_name, c.name AS crop_name, cv.name AS variety_name,
           b.name AS breeder_name,
           fa.name AS farm_area_name, s.name AS site_name, s.id AS site_id
    FROM open_field_planting ofp
    LEFT JOIN fields f ON f.id = ofp.field_id
    LEFT JOIN crops c ON c.id = ofp.crop_id
    LEFT JOIN crop_varieties cv ON cv.id = ofp.variety_id
    LEFT JOIN breeders b ON b.id = ofp.breeder_id
    LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
    LEFT JOIN sites s ON s.id = fa.site_id
    WHERE COALESCE(ofp.organization_id, f.organization_id) = $1
  `;
  const params: any[] = [orgId];

  if (siteId) {
    query += ` AND (s.id = $2 OR ofp.field_id IS NULL)`;
    params.push(siteId);
  }

  query += ` ORDER BY ofp.seeding_date ASC, f.name ASC`;

  const result = await dbPool.query(query, params);
  res.json({ success: true, data: result.rows });
}));

openFieldPlantingRouter.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = recordSchema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    let cropHistoryId: string | null = null;
    if (data.fieldId && data.seedingDate && data.cropId) {
      cropHistoryId = await createCropHistoryForPlanting(
        data.fieldId, data.cropId, data.varietyId || null,
        data.seedingDate, client
      );
    }

    const { seasonId, cycleNumber } = await preparePlantingInsert(
      'open_field_planting',
      {
        fieldId: data.fieldId || null,
        segment: data.segment || null,
        cropId: data.cropId || null,
        occupancyDate: data.seedingDate,
      },
      client,
    );

    const result = await client.query(
      `INSERT INTO open_field_planting
       (organization_id, seeding_date, field_id, segment, total_area,
        crop_id, variety_id, crop_type, breeder_id,
        lot_batch_no, quantity, uom, authorized_by, crop_history_id,
        season_id, cycle_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        orgId, data.seedingDate, data.fieldId || null, data.segment || null, data.totalArea || null,
        data.cropId || null, data.varietyId || null, data.cropType || 'Annual',
        data.breederId || null, data.lotBatchNo || null,
        data.quantity ? Number(data.quantity) : null, data.uom || null,
        data.authorizedBy || null, cropHistoryId, seasonId, cycleNumber,
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

openFieldPlantingRouter.put('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = recordSchema.partial().parse(req.body);
  const id = req.params.id;

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const addSet = (col: string, val: any, cast = '') => {
    sets.push(`${col} = $${idx}${cast}`);
    params.push(val);
    idx++;
  };

  if (data.seedingDate !== undefined) addSet('seeding_date', data.seedingDate);
  if (data.fieldId !== undefined) addSet('field_id', data.fieldId || null, '::uuid');
  if (data.segment !== undefined) addSet('segment', data.segment || null);
  if (data.totalArea !== undefined) addSet('total_area', data.totalArea || null);
  if (data.cropId !== undefined) addSet('crop_id', data.cropId || null, '::uuid');
  if (data.varietyId !== undefined) addSet('variety_id', data.varietyId || null, '::uuid');
  if (data.cropType !== undefined) addSet('crop_type', data.cropType || null);
  if (data.breederId !== undefined) addSet('breeder_id', data.breederId || null, '::uuid');
  if (data.lotBatchNo !== undefined) addSet('lot_batch_no', data.lotBatchNo || null);
  if (data.quantity !== undefined) addSet('quantity', data.quantity ? Number(data.quantity) : null);
  if (data.uom !== undefined) addSet('uom', data.uom || null);
  if (data.authorizedBy !== undefined) addSet('authorized_by', data.authorizedBy || null);

  if (sets.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
  }

  sets.push('updated_at = NOW()');

  params.push(id, requireOrgId(req));
  const result = await dbPool.query(
    `UPDATE open_field_planting ofp SET ${sets.join(', ')}
     WHERE ofp.id = $${idx}::uuid
       AND COALESCE(ofp.organization_id, (SELECT f.organization_id FROM fields f WHERE f.id = ofp.field_id)) = $${idx + 1}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }

  res.json({ success: true, data: result.rows[0] });
}));

openFieldPlantingRouter.post('/bulk', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    entries: z.array(recordSchema).min(1),
  });
  const { entries } = schema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;

  const client = await dbPool.connect();
  let created = 0;
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      let cropHistoryId: string | null = null;
      if (e.fieldId && e.seedingDate && e.cropId) {
        cropHistoryId = await createCropHistoryForPlanting(
          e.fieldId, e.cropId, e.varietyId || null,
          e.seedingDate, client
        );
      }

      const { seasonId, cycleNumber } = await preparePlantingInsert(
        'open_field_planting',
        {
          fieldId: e.fieldId || null,
          segment: e.segment || null,
          cropId: e.cropId || null,
          occupancyDate: e.seedingDate,
        },
        client,
      );

      await client.query(
        `INSERT INTO open_field_planting
         (organization_id, seeding_date, field_id, segment, total_area,
          crop_id, variety_id, crop_type, breeder_id,
          lot_batch_no, quantity, uom, authorized_by, crop_history_id,
          season_id, cycle_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          orgId, e.seedingDate, e.fieldId || null, e.segment || null, e.totalArea || null,
          e.cropId || null, e.varietyId || null, e.cropType || 'Annual',
          e.breederId || null, e.lotBatchNo || null,
          e.quantity ? Number(e.quantity) : null, e.uom || null,
          e.authorizedBy || null, cropHistoryId, seasonId, cycleNumber,
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

openFieldPlantingRouter.post('/import-cycles', asyncHandler(async (req: AuthRequest, res: Response) => {
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
        table: 'open_field_planting',
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

openFieldPlantingRouter.post('/sync-fields', asyncHandler(async (req: AuthRequest, res: Response) => {
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
    `SELECT ofp.field_id, ofp.crop_id, ofp.variety_id
     FROM open_field_planting ofp
     JOIN fields f ON f.id = ofp.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1 AND ofp.field_id IS NOT NULL AND ofp.crop_id IS NOT NULL`,
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
    const cropId = [...data.crops][0];
    const varietyId = data.varieties.size === 1 ? [...data.varieties][0] : null;
    await dbPool.query(
      `UPDATE fields SET current_crop_id = $1, variety_id = $2, updated_at = NOW() WHERE id = $3`,
      [cropId, varietyId, fieldId]
    );
    synced++;
  }

  res.json({ success: true, data: { fieldsSynced: synced } });
}));

/**
 * What is still growing on a field.
 *
 * Read-only, so the seeding screen can warn before someone plants onto
 * occupied ground and the uproot dialog can offer only segments that have
 * something in them. Writes also 409 when the chosen segments overlap
 * occupancy in the current season.
 */
openFieldPlantingRouter.get('/occupancy', asyncHandler(async (req: AuthRequest, res: Response) => {
  const fieldId = req.query.field_id as string | undefined;
  if (!fieldId) {
    return res.status(400).json({ success: false, error: { message: 'field_id is required' } });
  }

  const rows = await listActiveOccupancy('open_field_planting', fieldId);
  const occupied = [...new Set(rows.flatMap((row) => row.segmentTokens))];
  res.json({ success: true, data: { fieldId, occupied, rows } });
}));

/**
 * Free all or part of a field for the next cycle.
 *
 * Nothing is deleted: the finished cycle keeps its row, its harvests and its
 * spray history, and only stops counting as occupancy. Replanting the freed
 * segments on the same day is allowed.
 */
openFieldPlantingRouter.post(
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
          table: 'open_field_planting',
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

openFieldPlantingRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `DELETE FROM open_field_planting ofp
     WHERE ofp.id = $1::uuid
       AND COALESCE(ofp.organization_id, (SELECT f.organization_id FROM fields f WHERE f.id = ofp.field_id)) = $2`,
    [req.params.id, requireOrgId(req)]
  );
  if (!result.rowCount) throw new NotFoundError('Open field planting record not found');
  res.json({ success: true });
}));
