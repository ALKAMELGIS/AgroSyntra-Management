import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { requireOrgId } from '../middleware/tenant';
import { requireDataEntryWriter } from '../middleware/dataEntryWrite';

export const germinationRecordRouter = Router();
germinationRecordRouter.use(auth);
// Everyone who can open Crop History reads; only workers and agronomists record.
germinationRecordRouter.use(authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
germinationRecordRouter.use(requireDataEntryWriter);

// ─── SECTIONS ────────────────────────────────────────────────────────────────

germinationRecordRouter.get('/sections', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = req.query.site_id as string | undefined;
  const orgId = requireOrgId(req);

  let query = `
    SELECT gs.*
    FROM germination_sections gs
    LEFT JOIN sites s ON s.id = gs.site_id
    WHERE COALESCE(gs.organization_id, s.organization_id) = $1
  `;
  const params: any[] = [orgId];

  if (siteId) {
    params.push(siteId);
    query += ` AND gs.site_id = $${params.length}`;
  }

  query += ` ORDER BY gs.sort_order ASC, gs.created_at ASC`;
  const result = await dbPool.query(query, params);
  res.json({ success: true, data: result.rows });
}));

germinationRecordRouter.post('/sections', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    siteId: z.string().optional().nullable(),
  });
  const { name, siteId } = schema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;

  const maxSort = await dbPool.query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM germination_sections WHERE site_id = $1`,
    [siteId || null]
  );

  const result = await dbPool.query(
    `INSERT INTO germination_sections (organization_id, site_id, name, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [orgId, siteId || null, name, maxSort.rows[0].next]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
}));

germinationRecordRouter.put('/sections/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({ name: z.string().min(1).max(100) });
  const { name } = schema.parse(req.body);

  const result = await dbPool.query(
    `UPDATE germination_sections SET name = $1 WHERE id = $2 RETURNING *`,
    [name, req.params.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { message: 'Section not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

germinationRecordRouter.delete('/sections/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  await dbPool.query(`DELETE FROM germination_sections WHERE id = $1`, [req.params.id]);
  res.json({ success: true, data: { deleted: true } });
}));

// ─── RECORDS ─────────────────────────────────────────────────────────────────

const countSchema = z.object({
  counting_number: z.number().int().min(1),
  date: z.string().optional().nullable(),
  seeds_total: z.number().int().min(0).optional().nullable(),
  seeds_no_germ: z.number().int().min(0).optional().nullable(),
});

const recordSchema = z.object({
  sectionId: z.string().uuid(),
  varietyId: z.string().uuid().optional().nullable(),
  varietyName: z.string().optional().nullable(),
  counts: z.array(countSchema).default([]),
});

germinationRecordRouter.get('/records', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sectionId = req.query.section_id as string | undefined;

  if (!sectionId) {
    return res.status(400).json({ success: false, error: { message: 'section_id is required' } });
  }

  const result = await dbPool.query(
    `SELECT gr.*, cv.name AS resolved_variety_name
     FROM germination_records gr
     LEFT JOIN crop_varieties cv ON cv.id = gr.variety_id
     WHERE gr.section_id = $1
     ORDER BY gr.sort_order ASC, gr.created_at ASC`,
    [sectionId]
  );

  res.json({ success: true, data: result.rows });
}));

germinationRecordRouter.post('/records', asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = recordSchema.parse(req.body);

  const maxSort = await dbPool.query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM germination_records WHERE section_id = $1`,
    [data.sectionId]
  );

  const result = await dbPool.query(
    `INSERT INTO germination_records (section_id, variety_id, variety_name, counts, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.sectionId, data.varietyId || null, data.varietyName || null, JSON.stringify(data.counts), maxSort.rows[0].next]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
}));

germinationRecordRouter.put('/records/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    varietyId: z.string().uuid().optional().nullable(),
    varietyName: z.string().optional().nullable(),
    counts: z.array(countSchema).optional(),
  });
  const data = schema.parse(req.body);

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.varietyId !== undefined) {
    sets.push(`variety_id = $${idx}::uuid`);
    params.push(data.varietyId || null);
    idx++;
  }
  if (data.varietyName !== undefined) {
    sets.push(`variety_name = $${idx}`);
    params.push(data.varietyName || null);
    idx++;
  }
  if (data.counts !== undefined) {
    sets.push(`counts = $${idx}::jsonb`);
    params.push(JSON.stringify(data.counts));
    idx++;
  }

  if (sets.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
  }

  sets.push('updated_at = NOW()');
  params.push(req.params.id);

  const result = await dbPool.query(
    `UPDATE germination_records SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { message: 'Record not found' } });
  }

  res.json({ success: true, data: result.rows[0] });
}));

germinationRecordRouter.delete('/records/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  await dbPool.query(`DELETE FROM germination_records WHERE id = $1`, [req.params.id]);
  res.json({ success: true, data: { deleted: true } });
}));

// ─── BULK IMPORT ─────────────────────────────────────────────────────────────

germinationRecordRouter.post('/bulk', asyncHandler(async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    siteId: z.string().optional().nullable(),
    sections: z.array(z.object({
      name: z.string().min(1),
      records: z.array(z.object({
        varietyName: z.string().optional().nullable(),
        counts: z.array(countSchema).default([]),
      })),
    })),
  });

  const { siteId, sections } = schema.parse(req.body);
  const orgId = (req as any).user?.organizationId || null;

  const client = await dbPool.connect();
  let totalRecords = 0;

  try {
    await client.query('BEGIN');

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const secResult = await client.query(
        `INSERT INTO germination_sections (organization_id, site_id, name, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [orgId, siteId || null, sec.name, si]
      );
      const sectionId = secResult.rows[0].id;

      for (let ri = 0; ri < sec.records.length; ri++) {
        const rec = sec.records[ri];
        await client.query(
          `INSERT INTO germination_records (section_id, variety_name, counts, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [sectionId, rec.varietyName || null, JSON.stringify(rec.counts), ri]
        );
        totalRecords++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ success: true, data: { sectionsCreated: sections.length, recordsCreated: totalRecords } });
}));
