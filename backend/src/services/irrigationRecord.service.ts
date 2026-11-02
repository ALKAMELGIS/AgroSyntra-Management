import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { assertFieldDateWritable } from './seasons.service';

const SUMMARY_MULTIPLIER = 220;

export interface IrrigationMonthSheet {
  id: string;
  siteId: string;
  year: number;
  month: number;
  farmName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IrrigationRecord {
  id: string;
  monthSheetId: string;
  fieldId: string;
  fieldName?: string;
  date: string;
  segmentId?: string;
  areaHa?: number;
  crop?: string;
  flowRateM3Hr?: number;
  cycleDurationHr?: number;
  volumeM3?: number;
  authorizedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryCell {
  fieldId: string;
  fieldName: string;
  month: number;
  volumeM3: number;
  displayValue: number;
}

function computeVolume(flowRate?: number | null, cycleDuration?: number | null): number | null {
  if (flowRate == null || cycleDuration == null) return null;
  const v = Number(flowRate) * Number(cycleDuration);
  return Number.isFinite(v) ? v : null;
}

function mapSheet(row: Record<string, unknown>): IrrigationMonthSheet {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    year: Number(row.year),
    month: Number(row.month),
    farmName: (row.farm_name as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapRecord(row: Record<string, unknown>): IrrigationRecord {
  return {
    id: row.id as string,
    monthSheetId: row.month_sheet_id as string,
    fieldId: row.field_id as string,
    fieldName: (row.field_name as string) ?? undefined,
    date: row.date as string,
    segmentId: (row.segment_id as string) ?? undefined,
    areaHa: row.area_ha != null ? Number(row.area_ha) : undefined,
    crop: (row.crop as string) ?? undefined,
    flowRateM3Hr: row.flow_rate_m3_hr != null ? Number(row.flow_rate_m3_hr) : undefined,
    cycleDurationHr: row.cycle_duration_hr != null ? Number(row.cycle_duration_hr) : undefined,
    volumeM3: row.volume_m3 != null ? Number(row.volume_m3) : undefined,
    authorizedBy: (row.authorized_by as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listSheets(siteId: string, year: number): Promise<IrrigationMonthSheet[]> {
  const result = await dbPool.query(
    `SELECT * FROM irrigation_month_sheets
     WHERE site_id = $1 AND year = $2
     ORDER BY month ASC`,
    [siteId, year]
  );
  return result.rows.map(mapSheet);
}

export async function createSheet(
  siteId: string,
  year: number,
  month: number,
  farmName?: string
): Promise<IrrigationMonthSheet> {
  const result = await dbPool.query(
    `INSERT INTO irrigation_month_sheets (site_id, year, month, farm_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (site_id, year, month)
     DO UPDATE SET farm_name = COALESCE(EXCLUDED.farm_name, irrigation_month_sheets.farm_name),
                   updated_at = NOW()
     RETURNING *`,
    [siteId, year, month, farmName ?? null]
  );
  return mapSheet(result.rows[0]);
}

export async function listRecords(monthSheetId: string): Promise<IrrigationRecord[]> {
  const result = await dbPool.query(
    `SELECT r.*, f.name AS field_name
     FROM irrigation_records r
     JOIN fields f ON f.id = r.field_id
     WHERE r.month_sheet_id = $1
     ORDER BY r.date ASC, f.name ASC`,
    [monthSheetId]
  );
  return result.rows.map(mapRecord);
}

type ListRecordsForSiteParams = {
  siteId: string;
  fieldId?: string;
  startDate?: string;
  endDate?: string;
};

/** All pivot irrigation records for a site (RC-133), with optional field/date filters. */
export async function listRecordsForSite(params: ListRecordsForSiteParams): Promise<IrrigationRecord[]> {
  const values: unknown[] = [params.siteId];
  const clauses: string[] = ['s.site_id = $1'];

  if (params.fieldId) {
    values.push(params.fieldId);
    clauses.push(`r.field_id = $${values.length}`);
  }
  if (params.startDate) {
    values.push(params.startDate);
    clauses.push(`r.date >= $${values.length}`);
  }
  if (params.endDate) {
    values.push(params.endDate);
    clauses.push(`r.date <= $${values.length}`);
  }

  const result = await dbPool.query(
    `SELECT r.*, f.name AS field_name
     FROM irrigation_records r
     JOIN irrigation_month_sheets s ON s.id = r.month_sheet_id
     JOIN fields f ON f.id = r.field_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY r.date ASC, f.name ASC`,
    values
  );
  return result.rows.map(mapRecord);
}

export async function createRecord(payload: {
  monthSheetId: string;
  fieldId: string;
  date: string;
  segmentId?: string;
  areaHa?: number;
  crop?: string;
  flowRateM3Hr?: number;
  cycleDurationHr?: number;
  authorizedBy?: string;
}): Promise<IrrigationRecord> {
  await assertFieldDateWritable(payload.fieldId, payload.date);
  const volume = computeVolume(payload.flowRateM3Hr, payload.cycleDurationHr);
  const result = await dbPool.query(
    `INSERT INTO irrigation_records (
       month_sheet_id, field_id, date, segment_id, area_ha, crop,
       flow_rate_m3_hr, cycle_duration_hr, volume_m3, authorized_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      payload.monthSheetId,
      payload.fieldId,
      payload.date,
      payload.segmentId ?? null,
      payload.areaHa ?? null,
      payload.crop ?? null,
      payload.flowRateM3Hr ?? null,
      payload.cycleDurationHr ?? null,
      volume,
      payload.authorizedBy ?? null,
    ]
  );
  const row = result.rows[0];
  const fieldResult = await dbPool.query('SELECT name FROM fields WHERE id = $1', [payload.fieldId]);
  row.field_name = fieldResult.rows[0]?.name;
  return mapRecord(row);
}

export async function updateRecord(
  id: string,
  payload: {
    fieldId?: string;
    date?: string;
    segmentId?: string;
    areaHa?: number;
    crop?: string;
    flowRateM3Hr?: number;
    cycleDurationHr?: number;
    authorizedBy?: string;
  }
): Promise<IrrigationRecord> {
  const existing = await dbPool.query('SELECT * FROM irrigation_records WHERE id = $1', [id]);
  if (existing.rowCount === 0) throw new NotFoundError('Irrigation record not found');
  const cur = existing.rows[0];
  await assertFieldDateWritable(
    payload.fieldId ?? cur.field_id,
    payload.date ?? cur.date,
  );
  const flowRate = payload.flowRateM3Hr ?? cur.flow_rate_m3_hr;
  const cycleDuration = payload.cycleDurationHr ?? cur.cycle_duration_hr;
  const volume = computeVolume(flowRate, cycleDuration);

  const result = await dbPool.query(
    `UPDATE irrigation_records SET
       field_id = COALESCE($2, field_id),
       date = COALESCE($3, date),
       segment_id = COALESCE($4, segment_id),
       area_ha = COALESCE($5, area_ha),
       crop = COALESCE($6, crop),
       flow_rate_m3_hr = COALESCE($7, flow_rate_m3_hr),
       cycle_duration_hr = COALESCE($8, cycle_duration_hr),
       volume_m3 = $9,
       authorized_by = COALESCE($10, authorized_by),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      payload.fieldId ?? null,
      payload.date ?? null,
      payload.segmentId ?? null,
      payload.areaHa ?? null,
      payload.crop ?? null,
      payload.flowRateM3Hr ?? null,
      payload.cycleDurationHr ?? null,
      volume,
      payload.authorizedBy ?? null,
    ]
  );
  const fieldResult = await dbPool.query('SELECT name FROM fields WHERE id = $1', [result.rows[0].field_id]);
  result.rows[0].field_name = fieldResult.rows[0]?.name;
  return mapRecord(result.rows[0]);
}

export async function deleteRecord(id: string): Promise<void> {
  const result = await dbPool.query('DELETE FROM irrigation_records WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new NotFoundError('Irrigation record not found');
}

export async function getSummary(siteId: string, year: number): Promise<{
  fields: Array<{ id: string; name: string }>;
  cells: SummaryCell[];
}> {
  const fieldsResult = await dbPool.query(
    `SELECT f.id, f.name
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN field_types ft ON ft.id = f.field_type_id
     WHERE fa.site_id = $1
       AND LOWER(ft.name) = 'pivot'
       AND f.deleted_at IS NULL
     ORDER BY f.name ASC`,
    [siteId]
  );

  const aggResult = await dbPool.query(
    `SELECT r.field_id, s.month, COALESCE(SUM(r.volume_m3), 0) AS volume_m3
     FROM irrigation_records r
     JOIN irrigation_month_sheets s ON s.id = r.month_sheet_id
     JOIN fields f ON f.id = r.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN field_types ft ON ft.id = f.field_type_id
     WHERE fa.site_id = $1
       AND s.year = $2
       AND LOWER(ft.name) = 'pivot'
     GROUP BY r.field_id, s.month`,
    [siteId, year]
  );

  const fieldMap = new Map<string, string>();
  for (const row of fieldsResult.rows) {
    fieldMap.set(row.id, row.name);
  }

  const cells: SummaryCell[] = aggResult.rows.map((row) => {
    const volumeM3 = Number(row.volume_m3);
    return {
      fieldId: row.field_id,
      fieldName: fieldMap.get(row.field_id) ?? '',
      month: Number(row.month),
      volumeM3,
      displayValue: volumeM3 * SUMMARY_MULTIPLIER,
    };
  });

  return {
    fields: fieldsResult.rows.map((r) => ({ id: r.id, name: r.name })),
    cells,
  };
}

export async function getSheetById(id: string): Promise<IrrigationMonthSheet> {
  const result = await dbPool.query('SELECT * FROM irrigation_month_sheets WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new NotFoundError('Month sheet not found');
  return mapSheet(result.rows[0]);
}

export async function assertSheetAccess(monthSheetId: string, siteId: string): Promise<void> {
  const sheet = await getSheetById(monthSheetId);
  if (sheet.siteId !== siteId) {
    throw new AppError('Month sheet does not belong to this site', 'FORBIDDEN', 403);
  }
}

export interface BulkImportRecord {
  fieldId: string;
  date: string;
  segmentId?: string;
  areaHa?: number;
  crop?: string;
  flowRateM3Hr?: number;
  cycleDurationHr?: number;
  authorizedBy?: string;
}

export interface BulkImportSheet {
  month: number;
  mode: 'merge' | 'replace';
  records: BulkImportRecord[];
}

export interface BulkImportMonthResult {
  month: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

function recordKey(date: string, fieldId: string, segmentId?: string | null): string {
  return `${date}|${fieldId}|${(segmentId || '').trim().toLowerCase()}`;
}

export async function bulkImport(
  siteId: string,
  year: number,
  farmName: string | undefined,
  sheets: BulkImportSheet[]
): Promise<{
  months: BulkImportMonthResult[];
  totalInserted: number;
  totalSkipped: number;
}> {
  const client = await dbPool.connect();
  const months: BulkImportMonthResult[] = [];
  let totalInserted = 0;
  let totalSkipped = 0;

  try {
    await client.query('BEGIN');

    for (const sheet of sheets) {
      const result: BulkImportMonthResult = {
        month: sheet.month,
        inserted: 0,
        skipped: 0,
        errors: [],
      };

      try {
        const sheetRow = await client.query(
          `INSERT INTO irrigation_month_sheets (site_id, year, month, farm_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (site_id, year, month)
           DO UPDATE SET farm_name = COALESCE(EXCLUDED.farm_name, irrigation_month_sheets.farm_name),
                         updated_at = NOW()
           RETURNING id`,
          [siteId, year, sheet.month, farmName ?? null]
        );
        const monthSheetId = sheetRow.rows[0].id as string;

        if (sheet.mode === 'replace') {
          await client.query('DELETE FROM irrigation_records WHERE month_sheet_id = $1', [monthSheetId]);
        }

        const existingKeys = new Set<string>();
        if (sheet.mode === 'merge') {
          const existing = await client.query(
            `SELECT date, field_id, segment_id FROM irrigation_records WHERE month_sheet_id = $1`,
            [monthSheetId]
          );
          for (const row of existing.rows) {
            existingKeys.add(recordKey(row.date as string, row.field_id as string, row.segment_id as string));
          }
        }

        for (let i = 0; i < sheet.records.length; i++) {
          const rec = sheet.records[i];
          try {
            const key = recordKey(rec.date, rec.fieldId, rec.segmentId);
            if (sheet.mode === 'merge' && existingKeys.has(key)) {
              result.skipped++;
              continue;
            }

            const volume = computeVolume(rec.flowRateM3Hr, rec.cycleDurationHr);
            await client.query(
              `INSERT INTO irrigation_records (
                 month_sheet_id, field_id, date, segment_id, area_ha, crop,
                 flow_rate_m3_hr, cycle_duration_hr, volume_m3, authorized_by
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                monthSheetId,
                rec.fieldId,
                rec.date,
                rec.segmentId ?? null,
                rec.areaHa ?? null,
                rec.crop ?? null,
                rec.flowRateM3Hr ?? null,
                rec.cycleDurationHr ?? null,
                volume,
                rec.authorizedBy ?? null,
              ]
            );
            existingKeys.add(key);
            result.inserted++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`Row ${i + 1}: ${msg}`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(msg);
      }

      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      months.push(result);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { months, totalInserted, totalSkipped };
}
