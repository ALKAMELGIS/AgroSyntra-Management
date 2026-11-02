import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { autoClosePrevious, syncFieldCrop } from '../../utils/fieldCropSync';
import { assertFieldDateNotClosed, seasonIdForWritableField } from '../../services/seasons.service';
import { requireOrgId } from '../middleware/tenant';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { AppError, NotFoundError } from '../../utils/errors';
import { CROP_HISTORY_LIST_SQL } from '../../utils/cropHistoryListSql';
import { CROP_HISTORY_UPSERT_SQL } from '../../utils/cropHistoryForPlanting';
import { listCropHistoryAvailability } from '../../services/cropHistoryAvailability.service';

export const cropHistoryRouter = Router();
cropHistoryRouter.use(auth);
cropHistoryRouter.use(authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));

/** Managers watch the rotation; only workers and agronomists record it. */
function requireRotationEditor(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    assertCanOperateDataEntry(req.user!);
    next();
  } catch (err) {
    next(err);
  }
}

async function assertFieldsInOrg(fieldIds: string[], orgId: string): Promise<void> {
  const unique = [...new Set(fieldIds)];
  const result = await dbPool.query(
    `SELECT id FROM fields WHERE id = ANY($1::uuid[]) AND organization_id = $2 AND deleted_at IS NULL`,
    [unique, orgId]
  );
  if (result.rows.length !== unique.length) throw new NotFoundError('Field not found');
}

/** Crop history row scoped to the caller's organization (via its field). */
async function findRotationInOrg(
  id: string,
  orgId: string,
): Promise<{ id: string; field_id: string; start_date: string; season_id: string | null }> {
  const result = await dbPool.query(
    `SELECT ch.id, ch.field_id, to_char(ch.start_date, 'YYYY-MM-DD') AS start_date, ch.season_id
       FROM crop_history ch
       JOIN fields f ON f.id = ch.field_id
      WHERE ch.id = $1 AND f.organization_id = $2`,
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Not found');
  return result.rows[0];
}


cropHistoryRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;

  let query = CROP_HISTORY_LIST_SQL;
  const params: any[] = [];

  if (siteId) {
    query += ` WHERE s.id = $1`;
    params.push(siteId);
  }

  query += ` ORDER BY f.name ASC, ch.start_date DESC`;

  const result = await dbPool.query(query, params);
  res.json({ success: true, data: result.rows });
}));

// Gap warnings: find fields with date gaps between rotation entries
cropHistoryRouter.get('/gaps', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;

  let query = `
    WITH ordered AS (
      SELECT ch.field_id, f.name AS field_name,
             ch.start_date, ch.end_date,
             c.name AS crop_name,
             LAG(ch.end_date) OVER (PARTITION BY ch.field_id ORDER BY ch.start_date) AS prev_end
      FROM crop_history ch
      JOIN fields f ON f.id = ch.field_id
      JOIN crops c ON c.id = ch.crop_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
      JOIN sites s ON s.id = fa.site_id
      ${siteId ? 'WHERE s.id = $1' : ''}
    )
    SELECT field_id, field_name, crop_name, start_date, prev_end,
           (start_date::date - prev_end::date) AS gap_days
    FROM ordered
    WHERE prev_end IS NOT NULL AND (start_date::date - prev_end::date) > 1
    ORDER BY field_name, start_date
  `;

  const result = await dbPool.query(query, siteId ? [siteId] : []);
  res.json({ success: true, data: result.rows });
}));

cropHistoryRouter.get('/availability', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;
  if (!siteId) {
    return res.status(400).json({ success: false, error: { message: 'site_id is required' } });
  }
  const rows = await listCropHistoryAvailability(siteId);
  res.json({ success: true, data: rows });
}));

cropHistoryRouter.get('/:fieldId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `SELECT ch.*, c.name AS crop_name, cv.name AS variety_name
     FROM crop_history ch
     JOIN crops c ON c.id = ch.crop_id
     LEFT JOIN crop_varieties cv ON cv.id = ch.variety_id
     WHERE ch.field_id = $1
     ORDER BY ch.start_date DESC`,
    [req.params.fieldId]
  );
  res.json({ success: true, data: result.rows });
}));

const createSchema = z.object({
  fieldId: z.string().uuid(),
  cropId: z.string().uuid(),
  varietyId: z.string().uuid().optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
});

cropHistoryRouter.post('/', requireRotationEditor, asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createSchema.parse(req.body);
  await assertFieldsInOrg([data.fieldId], requireOrgId(req));
  await autoClosePrevious(data.fieldId, data.startDate);
  const seasonId = await seasonIdForWritableField(data.fieldId, data.startDate);
  const result = await dbPool.query(
    CROP_HISTORY_UPSERT_SQL,
    [data.fieldId, data.cropId, data.varietyId || null, data.startDate, data.endDate || null, seasonId]
  );
  if (!data.endDate) await syncFieldCrop(data.fieldId);
  res.status(201).json({ success: true, data: result.rows[0] });
}));

cropHistoryRouter.post('/bulk', requireRotationEditor, asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    entries: z.array(createSchema).min(1),
  });
  const { entries } = schema.parse(req.body);
  await assertFieldsInOrg(entries.map((e) => e.fieldId), requireOrgId(req));

  const client = await dbPool.connect();
  let created = 0;
  const fieldsToSync = new Set<string>();
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      await autoClosePrevious(e.fieldId, e.startDate, undefined, client);
      const seasonId = await seasonIdForWritableField(e.fieldId, e.startDate, client);
      const r = await client.query(
        CROP_HISTORY_UPSERT_SQL,
        [e.fieldId, e.cropId, e.varietyId || null, e.startDate, e.endDate || null, seasonId]
      );
      if (r.rowCount && r.rowCount > 0) {
        created++;
        if (!e.endDate) fieldsToSync.add(e.fieldId);
      }
    }
    for (const fId of fieldsToSync) {
      await syncFieldCrop(fId, client);
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

cropHistoryRouter.put('/:id', requireRotationEditor, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cropId, varietyId, startDate, endDate } = req.body;
  const existing = await findRotationInOrg(req.params.id, requireOrgId(req));
  // A closed season locks its rows, and a row cannot be moved into one.
  await assertFieldDateNotClosed(existing.field_id, existing.start_date);

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (cropId) { sets.push(`crop_id = $${idx}`); params.push(cropId); idx++; }
  if (varietyId !== undefined) { sets.push(`variety_id = $${idx}`); params.push(varietyId || null); idx++; }
  if (startDate) {
    // Each season keeps its own rotations: a row never moves to another season.
    // The new date must fall in the row's own (open) season; to record a rotation
    // in another season, add a new row there.
    if (String(startDate).slice(0, 10) !== existing.start_date) {
      const newSeasonId = await seasonIdForWritableField(existing.field_id, startDate);
      if ((newSeasonId ?? null) !== (existing.season_id ?? null)) {
        throw new AppError(
          'This start date belongs to a different season. Each season keeps its own rotations — add a new rotation in that season instead.',
          'VALIDATION_ERROR',
          400,
        );
      }
    }
    sets.push(`start_date = $${idx}`); params.push(startDate); idx++;
  }
  if (endDate !== undefined) { sets.push(`end_date = $${idx}`); params.push(endDate || null); idx++; }

  if (sets.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
  }

  params.push(existing.id);
  const result = await dbPool.query(
    `UPDATE crop_history SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { message: 'Not found' } });
  }
  const updated = result.rows[0];
  await syncFieldCrop(updated.field_id);
  res.json({ success: true, data: updated });
}));

cropHistoryRouter.delete('/:id', requireRotationEditor, asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await findRotationInOrg(req.params.id, requireOrgId(req));
  await assertFieldDateNotClosed(existing.field_id, existing.start_date);
  await dbPool.query('DELETE FROM crop_history WHERE id = $1', [existing.id]);
  res.json({ success: true });
}));

// Utility: resolve crop for a field on a specific date
cropHistoryRouter.get('/resolve/:fieldId/:date', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `SELECT ch.crop_id, ch.variety_id, c.name AS crop_name, cv.name AS variety_name
     FROM crop_history ch
     JOIN crops c ON c.id = ch.crop_id
     LEFT JOIN crop_varieties cv ON cv.id = ch.variety_id
     WHERE ch.field_id = $1 AND ch.start_date <= $2 AND (ch.end_date IS NULL OR ch.end_date >= $2)
     ORDER BY ch.start_date DESC LIMIT 1`,
    [req.params.fieldId, req.params.date]
  );
  res.json({ success: true, data: result.rows[0] || null });
}));
