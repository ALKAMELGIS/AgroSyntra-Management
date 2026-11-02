import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { AppError } from '../../utils/errors';
import { requireOrgId } from '../middleware/tenant';
import {
  DEFAULT_CONFIG,
  defaultPumpLabels,
  formatRow,
  normalizePumps,
  parsePumpsInput,
  pumpsToLegacyColumns,
  updatePumpAtIndex,
} from './pumpRoom.helpers';

export const pumpRoomRouter = Router();
pumpRoomRouter.use(auth);
pumpRoomRouter.use(authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));

/** Deleted-sheet recovery (list + restore): worker, agronomist, operations manager. CEO / farm manager excluded. */
export const SHEET_RESTORE_ROLES = ['worker', 'agronomist', 'operation_manager'];

function requireSheetRestorer(req: AuthRequest) {
  if (!SHEET_RESTORE_ROLES.includes(req.user!.role)) {
    throw new AppError('Forbidden', 'FORBIDDEN', 403);
  }
}

// Pump room data is entered by the data-entry worker only. Everyone else in the
// router's role list can view (and export client-side) but not write.
const assignmentRepo = new AssignmentRepository();

function requireWorker(req: AuthRequest) {
  if (req.user!.role !== 'worker') {
    throw new AppError('Only the data-entry worker can edit the pump room', 'FORBIDDEN', 403);
  }
}

async function requireWorkerForSite(req: AuthRequest, siteId: string | null | undefined) {
  requireWorker(req);
  if (!siteId) {
    throw new AppError('Select a site first', 'VALIDATION_ERROR', 400);
  }
  const allowed = await assignmentRepo.canUserAccessSite(
    req.user!.userId,
    req.user!.role,
    siteId,
    requireOrgId(req),
  );
  if (!allowed) {
    throw new AppError('You are not assigned to this site', 'FORBIDDEN', 403);
  }
}

async function requireWorkerForRow(req: AuthRequest, table: RecordTable, id: string) {
  requireWorker(req);
  const existing = await dbPool.query(`SELECT site_id FROM ${table} WHERE id = $1`, [id]);
  if (!existing.rows[0]) {
    throw new AppError('Not found', 'NOT_FOUND', 404);
  }
  const siteId = existing.rows[0].site_id as string | null;
  if (!siteId) {
    // Legacy rows with no site can't be tied to an assignment.
    throw new AppError('You are not assigned to this site', 'FORBIDDEN', 403);
  }
  await requireWorkerForSite(req, siteId);
}

const ACTIVE_FILTER = 'deleted_at IS NULL';

const pumpSchema = z.object({
  reading: z.number().optional().nullable(),
  usage: z.number().optional().nullable(),
});

const recordBodySchema = z.object({
  siteId: z.string().uuid().optional().nullable(),
  recordDate: z.string().min(1),
  meterId: z.string().optional().nullable(),
  usageArea: z.string().optional().nullable(),
  pumps: z.array(pumpSchema).optional(),
  reading1: z.number().optional().nullable(),
  usage1: z.number().optional().nullable(),
  reading2: z.number().optional().nullable(),
  usage2: z.number().optional().nullable(),
});

const recordPatchSchema = z.object({
  recordDate: z.string().optional(),
  meterId: z.string().optional().nullable(),
  usageArea: z.string().optional().nullable(),
  pumps: z.array(pumpSchema).optional(),
  pumpIndex: z.number().int().min(0).optional(),
  reading: z.number().optional().nullable(),
  reading1: z.number().optional().nullable(),
  usage1: z.number().optional().nullable(),
  reading2: z.number().optional().nullable(),
  usage2: z.number().optional().nullable(),
});

type RecordTable = 'pump_room_electricity' | 'pump_room_water' | 'pump_room_fogger';

function tableForDeletedSheetRecordType(recordType: string): RecordTable {
  if (recordType === 'water') return 'pump_room_water';
  if (recordType === 'fogger') return 'pump_room_fogger';
  return 'pump_room_electricity';
}

async function getConfigForSite(siteId: string | null) {
  if (!siteId) return { ...DEFAULT_CONFIG, site_id: null };
  const result = await dbPool.query(`SELECT * FROM site_pump_room_config WHERE site_id = $1`, [siteId]);
  if (!result.rows[0]) return { ...DEFAULT_CONFIG, site_id: siteId };
  return result.rows[0];
}

function configResponse(row: any) {
  return {
    siteId: row.site_id,
    waterPumpCount: row.water_pump_count ?? DEFAULT_CONFIG.water_pump_count,
    electricityPumpCount: row.electricity_pump_count ?? DEFAULT_CONFIG.electricity_pump_count,
    foggerPumpCount: row.fogger_pump_count ?? DEFAULT_CONFIG.fogger_pump_count,
    waterPumpLabels: row.water_pump_labels ?? DEFAULT_CONFIG.water_pump_labels,
    electricityPumpLabels: row.electricity_pump_labels ?? DEFAULT_CONFIG.electricity_pump_labels,
    foggerPumpLabels: row.fogger_pump_labels ?? DEFAULT_CONFIG.fogger_pump_labels,
  };
}

async function insertRecord(table: RecordTable, data: z.infer<typeof recordBodySchema>) {
  const pumps = parsePumpsInput(data);
  const legacy = pumpsToLegacyColumns(pumps);
  const pumpsJson = JSON.stringify(pumps);

  const result = await dbPool.query(
    `INSERT INTO ${table} (site_id, record_date, meter_id, usage_area, pumps, reading_1, usage_1, reading_2, usage_2)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING *`,
    [
      data.siteId || null,
      data.recordDate,
      data.meterId || null,
      data.usageArea || null,
      pumpsJson,
      legacy.reading_1,
      legacy.usage_1,
      legacy.reading_2,
      legacy.usage_2,
    ]
  );
  return formatRow(result.rows[0]);
}

async function patchRecord(table: RecordTable, id: string, data: z.infer<typeof recordPatchSchema>) {
  const existing = await dbPool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!existing.rows[0]) return null;

  let pumps = data.pumps ? parsePumpsInput({ pumps: data.pumps }) : normalizePumps(existing.rows[0]);

  if (data.pumpIndex !== undefined && data.reading !== undefined) {
    pumps = updatePumpAtIndex(pumps, data.pumpIndex, data.reading);
  } else if (data.reading1 !== undefined || data.usage1 !== undefined || data.reading2 !== undefined || data.usage2 !== undefined) {
    pumps = parsePumpsInput({ ...data, pumps: undefined });
  }

  const legacy = pumpsToLegacyColumns(pumps);
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.recordDate !== undefined) { sets.push(`record_date = $${idx}`); params.push(data.recordDate); idx++; }
  if (data.meterId !== undefined) { sets.push(`meter_id = $${idx}`); params.push(data.meterId); idx++; }
  if (data.usageArea !== undefined) { sets.push(`usage_area = $${idx}`); params.push(data.usageArea); idx++; }

  if (data.pumps !== undefined || data.pumpIndex !== undefined || data.reading1 !== undefined || data.reading2 !== undefined) {
    sets.push(`pumps = $${idx}::jsonb`); params.push(JSON.stringify(pumps)); idx++;
    sets.push(`reading_1 = $${idx}`); params.push(legacy.reading_1); idx++;
    sets.push(`usage_1 = $${idx}`); params.push(legacy.usage_1); idx++;
    sets.push(`reading_2 = $${idx}`); params.push(legacy.reading_2); idx++;
    sets.push(`usage_2 = $${idx}`); params.push(legacy.usage_2); idx++;
  }

  if (sets.length === 0) {
    return formatRow(existing.rows[0]);
  }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await dbPool.query(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return formatRow(result.rows[0]);
}

function listHandler(table: RecordTable) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    const siteId = req.query.site_id as string | undefined;
    const month = req.query.month as string | undefined;

    let query = `SELECT * FROM ${table} WHERE ${ACTIVE_FILTER}`;
    const params: any[] = [];

    if (siteId) {
      params.push(siteId);
      query += ` AND site_id = $${params.length}`;
    }

    if (month) {
      params.push(month + '-01');
      query += ` AND record_date >= $${params.length}::date AND record_date < ($${params.length}::date + INTERVAL '1 month')`;
    }

    query += ` ORDER BY record_date ASC`;
    const result = await dbPool.query(query, params);
    res.json({ success: true, data: result.rows.map(formatRow) });
  });
}

function bulkHandler(table: RecordTable) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    const schema = z.object({
      siteId: z.string().uuid().optional().nullable(),
      records: z.array(recordBodySchema),
    });
    requireWorker(req);
    const { siteId, records } = schema.parse(req.body);
    await requireWorkerForSite(req, siteId);
    const client = await dbPool.connect();
    let created = 0;

    try {
      await client.query('BEGIN');
      for (const rec of records) {
        const pumps = parsePumpsInput(rec);
        const legacy = pumpsToLegacyColumns(pumps);
        await client.query(
          `INSERT INTO ${table} (site_id, record_date, meter_id, usage_area, pumps, reading_1, usage_1, reading_2, usage_2)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
          [
            siteId || null,
            rec.recordDate,
            rec.meterId || null,
            rec.usageArea || null,
            JSON.stringify(pumps),
            legacy.reading_1,
            legacy.usage_1,
            legacy.reading_2,
            legacy.usage_2,
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

    res.json({ success: true, data: { created } });
  });
}

function deleteSheetHandler(recordType: 'electricity' | 'water' | 'fogger', table: RecordTable) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    requireWorker(req);
    const month = req.query.month as string;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: { message: 'month query required (YYYY-MM)' } });
    }
    const siteId = (req.query.site_id as string) || null;
    await requireWorkerForSite(req, siteId);
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const deletion = await client.query(
        `INSERT INTO pump_room_deleted_sheets (site_id, record_type, month_year, deleted_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [siteId, recordType, month, req.user!.userId]
      );
      const deletionId = deletion.rows[0].id;
      const updated = await client.query(
        `UPDATE ${table} SET deleted_at = NOW(), deletion_id = $1
         WHERE deleted_at IS NULL
           AND record_date >= $2::date AND record_date < ($2::date + INTERVAL '1 month')
           AND (($3::uuid IS NULL AND site_id IS NULL) OR site_id = $3)
         RETURNING id`,
        [deletionId, month + '-01', siteId]
      );
      await client.query(
        `UPDATE pump_room_deleted_sheets SET record_count = $1 WHERE id = $2`,
        [updated.rows.length, deletionId]
      );
      await client.query('COMMIT');
      res.json({ success: true, data: { deleted: updated.rows.length, deletionId } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

pumpRoomRouter.get('/config', asyncHandler(async (req: AuthRequest, res: Response) => {
  const siteId = (req.query.site_id as string) || null;
  if (!siteId) {
    return res.json({ success: true, data: configResponse({ ...DEFAULT_CONFIG, site_id: null }) });
  }
  const row = await getConfigForSite(siteId);
  res.json({ success: true, data: configResponse(row) });
}));

pumpRoomRouter.put('/config', asyncHandler(async (req: AuthRequest, res: Response) => {
  requireWorker(req);
  const schema = z.object({
    siteId: z.string().uuid(),
    waterPumpCount: z.number().int().min(1).max(10).optional(),
    electricityPumpCount: z.number().int().min(1).max(10).optional(),
    foggerPumpCount: z.number().int().min(1).max(10).optional(),
    waterPumpLabels: z.array(z.string()).optional(),
    electricityPumpLabels: z.array(z.string()).optional(),
    foggerPumpLabels: z.array(z.string()).optional(),
  });
  const data = schema.parse(req.body);
  await requireWorkerForSite(req, data.siteId);

  const existing = await getConfigForSite(data.siteId);

  const waterCount = data.waterPumpCount ?? existing.water_pump_count ?? 2;
  const elecCount = data.electricityPumpCount ?? existing.electricity_pump_count ?? 2;
  const foggerCount = data.foggerPumpCount ?? existing.fogger_pump_count ?? 2;
  const waterLabels = data.waterPumpLabels ?? existing.water_pump_labels ?? defaultPumpLabels(waterCount);
  const elecLabels = data.electricityPumpLabels ?? existing.electricity_pump_labels ?? defaultPumpLabels(elecCount);
  const foggerLabels = data.foggerPumpLabels ?? existing.fogger_pump_labels ?? defaultPumpLabels(foggerCount);

  const result = await dbPool.query(
    `INSERT INTO site_pump_room_config (
       site_id, water_pump_count, electricity_pump_count, fogger_pump_count,
       water_pump_labels, electricity_pump_labels, fogger_pump_labels, updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (site_id) DO UPDATE SET
       water_pump_count = EXCLUDED.water_pump_count,
       electricity_pump_count = EXCLUDED.electricity_pump_count,
       fogger_pump_count = EXCLUDED.fogger_pump_count,
       water_pump_labels = EXCLUDED.water_pump_labels,
       electricity_pump_labels = EXCLUDED.electricity_pump_labels,
       fogger_pump_labels = EXCLUDED.fogger_pump_labels,
       updated_at = NOW()
     RETURNING *`,
    [
      data.siteId,
      waterCount,
      elecCount,
      foggerCount,
      JSON.stringify(waterLabels),
      JSON.stringify(elecLabels),
      JSON.stringify(foggerLabels),
    ],
  );

  res.json({ success: true, data: configResponse(result.rows[0]) });
}));

// ─── RECORDS (electricity / water / fogger) ──────────────────────────────────
// Reads are open to every role on this router; every write is worker-only and
// scoped to a site the worker is assigned to.

function createHandler(table: RecordTable) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    requireWorker(req);
    const data = recordBodySchema.parse(req.body);
    await requireWorkerForSite(req, data.siteId);
    const row = await insertRecord(table, data);
    res.status(201).json({ success: true, data: row });
  });
}

function updateHandler(table: RecordTable) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    requireWorker(req);
    const data = recordPatchSchema.parse(req.body);
    await requireWorkerForRow(req, table, req.params.id);
    const row = await patchRecord(table, req.params.id, data);
    if (!row) return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true, data: row });
  });
}

function deleteRowHandler(table: RecordTable) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    await requireWorkerForRow(req, table, req.params.id);
    await dbPool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
  });
}

const RECORD_KINDS: Array<['electricity' | 'water' | 'fogger', RecordTable]> = [
  ['electricity', 'pump_room_electricity'],
  ['water', 'pump_room_water'],
  ['fogger', 'pump_room_fogger'],
];

for (const [kind, table] of RECORD_KINDS) {
  pumpRoomRouter.get(`/${kind}`, listHandler(table));
  pumpRoomRouter.post(`/${kind}`, createHandler(table));
  pumpRoomRouter.put(`/${kind}/:id`, updateHandler(table));
  pumpRoomRouter.delete(`/${kind}/sheet`, deleteSheetHandler(kind, table));
  pumpRoomRouter.delete(`/${kind}/:id`, deleteRowHandler(table));
  pumpRoomRouter.post(`/${kind}/bulk`, bulkHandler(table));
}

// ─── DELETED SHEETS / RECOVERY ───────────────────────────────────────────────

pumpRoomRouter.get('/deleted-sheets', asyncHandler(async (req: AuthRequest, res: Response) => {
  requireSheetRestorer(req);
  const result = await dbPool.query(
    `SELECT d.*, s.name AS site_name, u.name AS deleted_by_name
     FROM pump_room_deleted_sheets d
     LEFT JOIN sites s ON s.id = d.site_id
     LEFT JOIN users u ON u.id = d.deleted_by
     WHERE d.restored_at IS NULL
     ORDER BY d.deleted_at DESC`
  );
  res.json({ success: true, data: result.rows });
}));

pumpRoomRouter.post('/deleted-sheets/:id/restore', asyncHandler(async (req: AuthRequest, res: Response) => {
  requireSheetRestorer(req);
  const deletionId = req.params.id;
  const sheet = await dbPool.query(
    `SELECT * FROM pump_room_deleted_sheets WHERE id = $1 AND restored_at IS NULL`,
    [deletionId]
  );
  if (!sheet.rows[0]) {
    return res.status(404).json({ success: false, error: { message: 'Deleted sheet not found' } });
  }
  const { record_type } = sheet.rows[0];
  const table = tableForDeletedSheetRecordType(record_type);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE ${table} SET deleted_at = NULL, deletion_id = NULL WHERE deletion_id = $1`,
      [deletionId]
    );
    await client.query(
      `UPDATE pump_room_deleted_sheets SET restored_at = NOW() WHERE id = $1`,
      [deletionId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ success: true, data: { restored: true } });
}));
