import { Router, Response } from 'express';
import multer from 'multer';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { parseCsvAsObjects } from '../../utils/csv';
import { logAuditEvent } from '../../services/auditLog.service';
import { resolveHarvestPlanting } from '../../utils/harvestPlantingLink';

type CropVarietyRow = { crop_id: string; crop_name: string; variety_id: string | null; variety_name: string | null };

async function loadCropsAndVarieties(): Promise<CropVarietyRow[]> {
  const result = await dbPool.query(
    `SELECT c.id AS crop_id, c.name AS crop_name,
            cv.id AS variety_id, cv.name AS variety_name
     FROM crops c
     LEFT JOIN crop_varieties cv ON cv.crop_id = c.id
     ORDER BY length(c.name) DESC`
  );
  return result.rows;
}

function parseCropVarietyName(
  combined: string,
  cropVarietyRows: CropVarietyRow[],
): { cropId: string | null; varietyId: string | null; cropName: string | null; varietyName: string | null } {
  const str = (combined || '').trim().toLowerCase();
  if (!str) return { cropId: null, varietyId: null, cropName: null, varietyName: null };

  const cropNames = new Map<string, string>();
  for (const row of cropVarietyRows) {
    if (!cropNames.has(row.crop_name.toLowerCase())) {
      cropNames.set(row.crop_name.toLowerCase(), row.crop_id);
    }
  }

  for (const [cName, cId] of cropNames) {
    if (!str.includes(cName)) continue;
    const remainder = str.replace(cName, '').trim();
    if (remainder) {
      const variety = cropVarietyRows.find(
        (r) => r.crop_id === cId && r.variety_name?.toLowerCase() === remainder
      );
      if (variety) {
        return { cropId: cId, varietyId: variety.variety_id, cropName: variety.crop_name, varietyName: variety.variety_name };
      }
    }
    return { cropId: cId, varietyId: null, cropName: cropVarietyRows.find((r) => r.crop_id === cId)?.crop_name || null, varietyName: null };
  }

  return { cropId: null, varietyId: null, cropName: null, varietyName: null };
}

type CropHistoryEntry = { field_id: string; crop_id: string; variety_id: string | null; start_date: string; end_date: string | null };

async function loadCropHistory(): Promise<CropHistoryEntry[]> {
  const result = await dbPool.query(
    `SELECT field_id, crop_id, variety_id, start_date::text, end_date::text FROM crop_history ORDER BY start_date`
  );
  return result.rows;
}

function resolveCropForEntry(
  fieldId: string,
  dateStr: string,
  cropHistoryEntries: CropHistoryEntry[],
): { cropId: string | null; varietyId: string | null } {
  const date = dateStr;
  for (const entry of cropHistoryEntries) {
    if (entry.field_id !== fieldId) continue;
    if (entry.start_date <= date && (!entry.end_date || entry.end_date >= date)) {
      return { cropId: entry.crop_id, varietyId: entry.variety_id };
    }
  }
  return { cropId: null, varietyId: null };
}

export const historicalImportRouter = Router();
historicalImportRouter.use(auth);
// Historical import writes harvest / EC / fertigation rows: the operation
// manager, the data-entry worker and the agronomist. CEO and farm manager watch.
historicalImportRouter.use(authorize('operation_manager', 'worker', 'agronomist'));

type FieldSpec = {
  key: string;
  label: string;
  required: boolean;
  type: 'date' | 'time' | 'text' | 'number' | 'int';
  description?: string;
};

type TargetSpec = {
  key: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  uniqueBy: string[];
  fieldIdResolution: 'byNameColumn';
};

const TARGETS: Record<string, TargetSpec> = {
  harvests: {
    key: 'harvests',
    label: 'Harvest entries',
    description:
      'One row = one harvest event for a single field on a single day. Crop is auto-resolved from Crop Rotation history if not provided.',
    fields: [
      { key: 'field_name',    label: 'Field name',          required: true,  type: 'text',
        description: 'Matched case-insensitively against your existing field names.' },
      { key: 'date',          label: 'Date',                required: true,  type: 'date',
        description: 'Any ISO-ish format (YYYY-MM-DD, DD/MM/YYYY, etc.)' },
      { key: 'total_quantity',label: 'Total quantity (kg)', required: true,  type: 'number' },
      { key: 'notes',         label: 'Notes',               required: false, type: 'text' },
      { key: 'crop_name',     label: 'Crop + Variety',      required: false, type: 'text',
        description: 'e.g. "Capsicum Red", "Plum Tomato". If blank, resolved from Crop Rotation history.' },
    ],
    uniqueBy: ['field_id', 'date'],
    fieldIdResolution: 'byNameColumn',
  },
  ecph: {
    key: 'ecph',
    label: 'EC & pH entries (basic)',
    description:
      'Valve-level readings are not supported by this target — only the per-event water volumes. Use "EC & pH with valve readings" for full import. Crop auto-resolved from Crop Rotation history.',
    fields: [
      { key: 'field_name',       label: 'Field name',         required: true,  type: 'text' },
      { key: 'date',             label: 'Date',               required: true,  type: 'date' },
      { key: 'time',             label: 'Time',               required: false, type: 'time' },
      { key: 'qty_of_water',     label: 'Qty of water (L)',   required: false, type: 'number' },
      { key: 'cycle',            label: 'Cycle number',       required: false, type: 'int' },
      { key: 'total_water_qty',  label: 'Total water qty (L)',required: false, type: 'number' },
      { key: 'crop_name',        label: 'Crop + Variety',     required: false, type: 'text',
        description: 'e.g. "Capsicum Red". If blank, resolved from Crop Rotation history.' },
    ],
    uniqueBy: ['field_id', 'date', 'time'],
    fieldIdResolution: 'byNameColumn',
  },
  ecph_full: {
    key: 'ecph_full',
    label: 'EC & pH with valve readings',
    description:
      'One row per valve. Rows with the same field + date + time are grouped into a single entry with multiple valve readings. Handles merged cells automatically.',
    fields: [
      { key: 'field_name',       label: 'Field name (NH LOCATION)',  required: true,  type: 'text',
        description: 'Matched with normalization: "NH 22" matches "NH-22".' },
      { key: 'date',             label: 'Date',                      required: true,  type: 'date' },
      { key: 'valve_number',     label: 'Valve number',              required: true,  type: 'int' },
      { key: 'time',             label: 'Time',                      required: false, type: 'time' },
      { key: 'ec_in',            label: 'EC In',                     required: false, type: 'number' },
      { key: 'ec_out',           label: 'EC Out',                    required: false, type: 'number' },
      { key: 'ph_in',            label: 'pH In',                     required: false, type: 'number' },
      { key: 'ph_out',           label: 'pH Out',                    required: false, type: 'number' },
      { key: 'drip_volume',      label: 'Drip Volume',               required: false, type: 'number' },
      { key: 'drain_volume',     label: 'Drain Volume',              required: false, type: 'number' },
      { key: 'percent_drain',    label: '% Drain',                   required: false, type: 'number' },
      { key: 'qty_of_water',     label: 'Qty Of Water (M3)',         required: false, type: 'number',
        description: 'Entry-level field — taken from first row of each group.' },
      { key: 'cycle',            label: 'Cycle',                     required: false, type: 'int',
        description: 'Entry-level field — taken from first row of each group.' },
      { key: 'total_water_qty',  label: 'Total Water QTY',           required: false, type: 'number',
        description: 'Entry-level field — taken from first row of each group.' },
      { key: 'total_water_drip', label: 'Total Water QTY Based on Drip Volume', required: false, type: 'number',
        description: 'Entry-level field — taken from first row of each group.' },
      { key: 'weather_condition',label: 'Weather condition',         required: false, type: 'text',
        description: 'e.g. foggy, cloudy, raining' },
      { key: 'irrigation_status',label: 'Irrigation / pipe status',  required: false, type: 'text',
        description: 'e.g. drenching, no irrigation, drip pipe damage' },
      { key: 'crop_name',        label: 'Crop + Variety',             required: false, type: 'text',
        description: 'e.g. "Capsicum Red". If blank, resolved from Crop Rotation history.' },
    ],
    uniqueBy: ['field_id', 'date', 'time'],
    fieldIdResolution: 'byNameColumn',
  },
  fertigation: {
    key: 'fertigation',
    label: 'Fertigation entries',
    description:
      'Stock mixtures and element breakdowns are not supported by this importer — only the day-level totals.',
    fields: [
      { key: 'field_name',        label: 'Field name',                required: true,  type: 'text' },
      { key: 'date',              label: 'Date',                      required: true,  type: 'date' },
      { key: 'week_number',       label: 'Week number',               required: false, type: 'int' },
      { key: 'flow_rate',         label: 'Flow rate (L/h)',           required: false, type: 'number' },
      { key: 'frequency',         label: 'Cycles / day',              required: false, type: 'int' },
      { key: 'daily_water',       label: 'Daily water (L)',           required: false, type: 'number' },
      { key: 'total_fertilizer',  label: 'Total fertilizer (kg)',     required: false, type: 'number' },
      { key: 'crop_name',          label: 'Crop + Variety',            required: false, type: 'text',
        description: 'e.g. "Capsicum Red". If blank, resolved from Crop Rotation history.' },
    ],
    uniqueBy: ['field_id', 'date'],
    fieldIdResolution: 'byNameColumn',
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── Field name normalization ───────────────────────────────────────

function resolveFieldId(
  name: string,
  fieldIdByName: Map<string, string>,
): string | undefined {
  const raw = name.trim();
  const lower = raw.toLowerCase();
  if (fieldIdByName.has(lower)) return fieldIdByName.get(lower);
  const dashed = lower.replace(/\s+/g, '-');
  if (fieldIdByName.has(dashed)) return fieldIdByName.get(dashed);
  const collapsed = lower.replace(/[\s\-_]+/g, '');
  for (const [k, v] of fieldIdByName) {
    if (k.replace(/[\s\-_]+/g, '') === collapsed) return v;
  }
  return undefined;
}

async function loadFieldMap(): Promise<Map<string, string>> {
  const result = await dbPool.query(
    `SELECT id, lower(name) AS lname FROM fields WHERE deleted_at IS NULL`,
  );
  return new Map<string, string>(result.rows.map((r: any) => [r.lname, r.id]));
}

// ─── Shared coerce logic ────────────────────────────────────────────

function coerceValue(raw: string, type: FieldSpec['type']): unknown {
  const v = (raw ?? '').trim();
  if (v === '') return null;
  switch (type) {
    case 'int': {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'number': {
      const n = Number(v.replace(/,/g, '').replace(/%/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'date':
    case 'time':
    case 'text':
    default:
      return v;
  }
}

function coerceRow(
  row: Record<string, string>,
  target: TargetSpec,
  mapping: Record<string, string>,
): { coerced: Record<string, unknown>; error: string | null } {
  const coerced: Record<string, unknown> = {};
  for (const f of target.fields) {
    const src = mapping[f.key];
    const raw = src ? (row[src] ?? '') : '';
    const val = coerceValue(raw, f.type);
    if (f.required && (val === null || val === '')) {
      return { coerced, error: `Missing required ${f.key} (source column "${src || '?'}")` };
    }
    coerced[f.key] = val;
  }
  return { coerced, error: null };
}

// ─── Fill-down for merged cells ─────────────────────────────────────

const FILL_DOWN_KEYS = [
  'date', 'time', 'field_name',
  'qty_of_water', 'cycle', 'total_water_qty', 'total_water_drip',
  'weather_condition', 'irrigation_status',
];

function fillDown(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): void {
  const prev: Record<string, string> = {};
  for (const row of rows) {
    for (const key of FILL_DOWN_KEYS) {
      const col = mapping[key];
      if (!col) continue;
      const val = (row[col] ?? '').trim();
      if (val === '' && prev[key]) {
        row[col] = prev[key];
      } else if (val !== '') {
        prev[key] = val;
      }
    }
  }
}

// ─── Simple import (harvests, ecph basic, fertigation) ──────────────

async function executeSimpleImport(
  coercedRows: Array<{ fieldId: string; values: Record<string, unknown>; cropId?: string | null; varietyId?: string | null }>,
  targetKey: string,
  dryRun: boolean,
): Promise<{ inserted: number; skipped: number }> {
  if (dryRun) {
    return { inserted: coercedRows.length, skipped: 0 };
  }

  const client = await dbPool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const { fieldId, values, cropId, varietyId } of coercedRows) {
      if (targetKey === 'harvests') {
        const plantingLink = await resolveHarvestPlanting(
          {
            fieldId,
            harvestDate: String(values.date ?? ''),
            segmentId: values.segment_id != null ? String(values.segment_id) : null,
          },
          client,
        );
        const r = await client.query(
          `INSERT INTO harvests (field_id, date, total_quantity, notes, crop_id, variety_id, open_field_planting_id, planting_record_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [fieldId, values.date, values.total_quantity, values.notes ?? null,
           cropId ?? null, varietyId ?? null,
           plantingLink.openFieldPlantingId, plantingLink.plantingRecordId],
        );
        if (r.rowCount && r.rowCount > 0) inserted += 1;
      } else if (targetKey === 'ecph') {
        const r = await client.query(
          `INSERT INTO ecph_entries (field_id, date, time, qty_of_water, cycle, total_water_qty, crop_id, variety_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            fieldId, values.date, values.time ?? null,
            values.qty_of_water ?? null, values.cycle ?? null, values.total_water_qty ?? null,
            cropId ?? null, varietyId ?? null,
          ],
        );
        if (r.rowCount && r.rowCount > 0) inserted += 1;
      } else if (targetKey === 'fertigation') {
        const dup = await client.query(
          `SELECT id FROM fertigation_entries WHERE field_id = $1 AND date = $2 LIMIT 1`,
          [fieldId, values.date],
        );
        if (dup.rowCount && dup.rowCount > 0) continue;
        const r = await client.query(
          `INSERT INTO fertigation_entries
            (field_id, date, week_number, flow_rate, frequency, daily_water, total_fertilizer, crop_id, variety_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            fieldId, values.date, values.week_number ?? null,
            values.flow_rate ?? null, values.frequency ?? null,
            values.daily_water ?? null, values.total_fertilizer ?? null,
            cropId ?? null, varietyId ?? null,
          ],
        );
        if (r.rowCount && r.rowCount > 0) inserted += 1;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { inserted, skipped: coercedRows.length - inserted };
}

// ─── EC/PH full import (valve grouping) ─────────────────────────────

type ValveRow = {
  fieldId: string;
  values: Record<string, unknown>;
  cropId?: string | null;
  varietyId?: string | null;
};

function groupValveRows(rows: ValveRow[]): Map<string, ValveRow[]> {
  const groups = new Map<string, ValveRow[]>();
  for (const row of rows) {
    const key = `${row.fieldId}|${row.values.date}|${row.values.time ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return groups;
}

async function executeEcphFullImport(
  coercedRows: ValveRow[],
  dryRun: boolean,
): Promise<{ inserted: number; skipped: number; valvesInserted: number }> {
  const groups = groupValveRows(coercedRows);

  if (dryRun) {
    return { inserted: groups.size, skipped: 0, valvesInserted: coercedRows.length };
  }

  const client = await dbPool.connect();
  let inserted = 0;
  let valvesInserted = 0;
  try {
    await client.query('BEGIN');
    for (const [, rows] of groups) {
      const first = rows[0].values;
      const fieldId = rows[0].fieldId;

      const cropId = rows[0].cropId ?? null;
      const varietyId = rows[0].varietyId ?? null;

      const entryResult = await client.query(
        `INSERT INTO ecph_entries
          (field_id, date, time, qty_of_water, cycle, total_water_qty,
           field_total_water_based_on_drip, weather_condition, irrigation_status,
           crop_id, variety_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          fieldId,
          first.date,
          first.time ?? null,
          first.qty_of_water ?? null,
          first.cycle ?? null,
          first.total_water_qty ?? null,
          first.total_water_drip ?? null,
          first.weather_condition ?? null,
          first.irrigation_status ?? null,
          cropId,
          varietyId,
        ],
      );

      if (!entryResult.rowCount || entryResult.rowCount === 0) continue;
      inserted += 1;
      const entryId = entryResult.rows[0].id;

      for (const row of rows) {
        const v = row.values;
        await client.query(
          `INSERT INTO ecph_valve_readings
            (ecph_entry_id, valve_number, drip_volume, ec_in, ec, ph_in, ph,
             drain, percent_drain)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            entryId,
            v.valve_number,
            v.drip_volume ?? null,
            v.ec_in ?? null,
            v.ec_out ?? null,
            v.ph_in ?? null,
            v.ph_out ?? null,
            v.drain_volume ?? null,
            v.percent_drain ?? null,
          ],
        );
        valvesInserted += 1;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { inserted, skipped: groups.size - inserted, valvesInserted };
}

// ─── Shared execute logic ───────────────────────────────────────────

async function runImport(
  rows: Record<string, string>[],
  headers: string[],
  target: TargetSpec,
  mapping: Record<string, string>,
  dryRun: boolean,
  fileName: string,
  userId: string,
  ip: string | undefined,
  userAgent: string | undefined,
) {
  const fieldIdByName = await loadFieldMap();
  const cropHistoryEntries = await loadCropHistory();
  const cropVarietyRows = await loadCropsAndVarieties();

  const cropColumn = mapping['crop_name'];

  if (target.key === 'ecph_full') {
    fillDown(rows, mapping);
  }

  const stats = {
    total: rows.length,
    toInsert: 0,
    skipped: 0,
    valvesInserted: undefined as number | undefined,
    errors: [] as Array<{ row: number; reason: string }>,
    preview: [] as Array<Record<string, unknown>>,
    unmappedHeaders: headers.filter((h) => !Object.values(mapping).includes(h)),
    cropResolution: {
      fromHistory: 0,
      fromColumn: 0,
      unresolved: 0,
    },
  };

  const coercedRows: Array<{ fieldId: string; values: Record<string, unknown>; cropId?: string | null; varietyId?: string | null }> = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const { coerced, error } = coerceRow(row, target, mapping);

    if (error) {
      stats.errors.push({ row: rIdx + 2, reason: error });
      continue;
    }

    const fname = String(coerced.field_name ?? '').trim();
    const fieldId = resolveFieldId(fname, fieldIdByName);
    if (!fieldId) {
      stats.errors.push({
        row: rIdx + 2,
        reason: `Unknown field name "${coerced.field_name}". Create the field first or fix the spelling.`,
      });
      continue;
    }

    let cropId: string | null = null;
    let varietyId: string | null = null;

    if (cropColumn && row[cropColumn]) {
      const parsed = parseCropVarietyName(row[cropColumn], cropVarietyRows);
      cropId = parsed.cropId;
      varietyId = parsed.varietyId;
      if (cropId) stats.cropResolution.fromColumn++;
    }

    if (!cropId && coerced.date) {
      const resolved = resolveCropForEntry(fieldId, String(coerced.date), cropHistoryEntries);
      cropId = resolved.cropId;
      varietyId = resolved.varietyId;
      if (cropId) stats.cropResolution.fromHistory++;
    }

    if (!cropId) stats.cropResolution.unresolved++;

    coercedRows.push({ fieldId, values: coerced, cropId, varietyId });
    if (stats.preview.length < 5) {
      const cropInfo = cropId
        ? cropVarietyRows.find((r) => r.crop_id === cropId)
        : null;
      stats.preview.push({
        fieldId,
        ...coerced,
        _resolved_crop: cropInfo?.crop_name || null,
        _resolved_variety: cropInfo && varietyId
          ? cropVarietyRows.find((r) => r.variety_id === varietyId)?.variety_name || null
          : null,
      });
    }
  }

  if (target.key === 'ecph_full') {
    const result = await executeEcphFullImport(coercedRows, dryRun);
    stats.toInsert = result.inserted;
    stats.skipped = result.skipped;
    stats.valvesInserted = result.valvesInserted;
  } else {
    const result = await executeSimpleImport(coercedRows, target.key, dryRun);
    stats.toInsert = result.inserted;
    stats.skipped = result.skipped;
  }

  if (!dryRun) {
    await logAuditEvent({
      userId,
      action: 'IMPORT',
      entity: 'report',
      entityId: 'historical-csv',
      changes: {
        target: target.key,
        fileName,
        totalRows: rows.length,
        inserted: stats.toInsert,
        skippedDuplicates: stats.skipped,
        errors: stats.errors.length,
        mapping,
      },
      ipAddress: ip,
      userAgent,
    });
  }

  return { dryRun, target: target.key, headers, stats };
}

// ─── Routes ─────────────────────────────────────────────────────────

historicalImportRouter.get(
  '/targets',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json({ success: true, data: Object.values(TARGETS) });
  }),
);

// CSV file preview
historicalImportRouter.post(
  '/preview',
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'CSV file is required.' },
      });
    }
    const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const { headers, rows } = parseCsvAsObjects(text);
    res.json({
      success: true,
      data: {
        headers,
        sampleRows: rows.slice(0, 10),
        totalRows: rows.length,
        fileName: req.file.originalname,
      },
    });
  }),
);

// JSON preview (for client-parsed Excel)
historicalImportRouter.post(
  '/preview-json',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rows: Record<string, string>[] = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_ROWS', message: 'rows array is required.' },
      });
    }
    const headers = Object.keys(rows[0]);
    res.json({
      success: true,
      data: {
        headers,
        sampleRows: rows.slice(0, 10),
        totalRows: rows.length,
        fileName: req.body.fileName || 'uploaded.xlsx',
      },
    });
  }),
);

// CSV file execute
historicalImportRouter.post(
  '/execute',
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'CSV file is required.' },
      });
    }
    const targetKey = String(req.body.target || '');
    const target = TARGETS[targetKey];
    if (!target) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_TARGET', message: `Unknown target: ${targetKey}` },
      });
    }
    let mapping: Record<string, string> = {};
    try {
      mapping = typeof req.body.mapping === 'string'
        ? JSON.parse(req.body.mapping)
        : (req.body.mapping || {});
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_MAPPING', message: 'mapping must be valid JSON.' },
      });
    }
    const dryRun = String(req.body.dryRun ?? 'true') !== 'false';

    const missing = target.fields
      .filter((f) => f.required && !mapping[f.key])
      .map((f) => f.key);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MAPPING', message: `Required fields are not mapped: ${missing.join(', ')}` },
      });
    }

    const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const { headers, rows } = parseCsvAsObjects(text);

    const result = await runImport(
      rows, headers, target, mapping, dryRun,
      req.file.originalname, req.user!.userId,
      req.ip, req.headers['user-agent'],
    );

    res.json({ success: true, data: result });
  }),
);

// JSON execute (for client-parsed Excel)
historicalImportRouter.post(
  '/execute-json',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rows: Record<string, string>[] = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_ROWS', message: 'rows array is required.' },
      });
    }
    const targetKey = String(req.body.target || '');
    const target = TARGETS[targetKey];
    if (!target) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_TARGET', message: `Unknown target: ${targetKey}` },
      });
    }
    const mapping: Record<string, string> = req.body.mapping || {};
    const dryRun = req.body.dryRun !== false && String(req.body.dryRun ?? 'true') !== 'false';

    const missing = target.fields
      .filter((f) => f.required && !mapping[f.key])
      .map((f) => f.key);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MAPPING', message: `Required fields are not mapped: ${missing.join(', ')}` },
      });
    }

    const headers = Object.keys(rows[0]);
    const stringRows = rows.map((row) => {
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        obj[k] = v == null ? '' : String(v);
      }
      return obj;
    });

    const result = await runImport(
      stringRows, headers, target, mapping, dryRun,
      req.body.fileName || 'uploaded.xlsx', req.user!.userId,
      req.ip, req.headers['user-agent'],
    );

    res.json({ success: true, data: result });
  }),
);

// Crop resolution preview: resolve crops for a batch of field+date pairs
historicalImportRouter.post(
  '/resolve-crops',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rows, mapping } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'rows required' } });
    }

    const fieldIdByName = await loadFieldMap();
    const cropHistoryEntries = await loadCropHistory();
    const cropVarietyRows = await loadCropsAndVarieties();

    const cropColumn = mapping?.crop_name;
    const fieldColumn = mapping?.field_name;
    const dateColumn = mapping?.date;

    if (!fieldColumn || !dateColumn) {
      return res.status(400).json({ success: false, error: { message: 'field_name and date mapping required' } });
    }

    const results: Array<{
      row: number;
      fieldName: string;
      date: string;
      cropName: string | null;
      varietyName: string | null;
      source: 'column' | 'history' | 'none';
    }> = [];

    const sampleRows = rows.slice(0, 200);
    for (let i = 0; i < sampleRows.length; i++) {
      const row = sampleRows[i];
      const fieldName = String(row[fieldColumn] || '').trim();
      const date = String(row[dateColumn] || '').trim();
      const fieldId = resolveFieldId(fieldName, fieldIdByName);

      let cropName: string | null = null;
      let varietyName: string | null = null;
      let source: 'column' | 'history' | 'none' = 'none';

      if (cropColumn && row[cropColumn]) {
        const parsed = parseCropVarietyName(row[cropColumn], cropVarietyRows);
        if (parsed.cropId) {
          cropName = parsed.cropName;
          varietyName = parsed.varietyName;
          source = 'column';
        }
      }

      if (!cropName && fieldId && date) {
        const resolved = resolveCropForEntry(fieldId, date, cropHistoryEntries);
        if (resolved.cropId) {
          const cRow = cropVarietyRows.find((r) => r.crop_id === resolved.cropId);
          cropName = cRow?.crop_name || null;
          if (resolved.varietyId) {
            const vRow = cropVarietyRows.find((r) => r.variety_id === resolved.varietyId);
            varietyName = vRow?.variety_name || null;
          }
          source = 'history';
        }
      }

      results.push({ row: i + 2, fieldName, date, cropName, varietyName, source });
    }

    const summary = {
      total: results.length,
      fromColumn: results.filter((r) => r.source === 'column').length,
      fromHistory: results.filter((r) => r.source === 'history').length,
      unresolved: results.filter((r) => r.source === 'none').length,
    };

    res.json({ success: true, data: { results, summary } });
  }),
);
