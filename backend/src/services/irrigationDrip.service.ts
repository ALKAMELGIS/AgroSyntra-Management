import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { assertDateWritableForSite } from './seasons.service';

export interface IrrigationDripEntry {
  id: string;
  siteId: string;
  fieldId: string | null;
  date: string;
  locationLabel: string;
  valveRange: string | null;
  weekNumber: number | null;
  method: string | null;
  flowRateM3: number | null;
  operatorName: string | null;
  authorizedBy: string | null;
  waterQtyM3: number | null;
  frequency: number | null;
  dailyWater: number | null;
  fertilizerType: string | null;
  fertilizerQty: number | null;
}

export interface IrrigationDripLocationInput {
  locationLabel: string;
  fieldId?: string | null;
  valveRange?: string | null;
  waterQtyM3?: number | null;
  frequency?: number | null;
  dailyWater?: number | null;
  fertilizerType?: string | null;
  fertilizerQty?: number | null;
}

export interface IrrigationDripDayInput {
  date: string;
  weekNumber?: number | null;
  method?: string | null;
  flowRateM3?: number | null;
  operatorName?: string | null;
  authorizedBy?: string | null;
  locations: IrrigationDripLocationInput[];
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateStr(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  const s = typeof v === 'string' ? v : String(v);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = v instanceof Date ? v : new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
}

function computeDaily(waterQty: number | null, frequency: number | null, dailyWater: number | null): number | null {
  if (waterQty != null && frequency != null) {
    const v = waterQty * frequency;
    return Number.isFinite(v) ? Number(v.toFixed(4)) : null;
  }
  return dailyWater;
}

function locationHasData(loc: IrrigationDripLocationInput): boolean {
  return Boolean(
    loc.waterQtyM3 != null
    || loc.frequency != null
    || loc.dailyWater != null
    || (loc.fertilizerType && String(loc.fertilizerType).trim())
    || loc.fertilizerQty != null,
  );
}

function mapRow(row: Record<string, unknown>): IrrigationDripEntry {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    fieldId: (row.field_id as string) ?? null,
    date: dateStr(row.date),
    locationLabel: row.location_label as string,
    valveRange: (row.valve_range as string) ?? null,
    weekNumber: row.week_number != null ? Number(row.week_number) : null,
    method: (row.method as string) ?? null,
    flowRateM3: num(row.flow_rate_m3),
    operatorName: (row.operator_name as string) ?? null,
    authorizedBy: (row.authorized_by as string) ?? null,
    waterQtyM3: num(row.water_qty_m3),
    frequency: num(row.frequency),
    dailyWater: num(row.daily_water),
    fertilizerType: (row.fertilizer_type as string) ?? null,
    fertilizerQty: num(row.fertilizer_qty),
  };
}

export async function listEntries(
  siteId: string,
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<IrrigationDripEntry[]> {
  const params: unknown[] = [siteId, orgId];
  let sql = `SELECT * FROM irrigation_entries
     WHERE site_id = $1 AND (organization_id IS NULL OR organization_id = $2)`;
  if (startDate) {
    params.push(startDate);
    sql += ` AND date >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    sql += ` AND date <= $${params.length}`;
  }
  sql += ' ORDER BY date ASC, location_label ASC';
  const result = await dbPool.query(sql, params);
  return result.rows.map(mapRow);
}

export async function replaceDays(
  siteId: string,
  orgId: string,
  days: IrrigationDripDayInput[],
): Promise<{ saved: number; dates: number }> {
  // Drip entries belong to the site: refuse any day inside a closed season
  // before anything is replaced.
  for (const day of days) {
    const date = dateStr(day.date);
    if (date) await assertDateWritableForSite(siteId, date);
  }
  const client = await dbPool.connect();
  let saved = 0;
  try {
    await client.query('BEGIN');
    for (const day of days) {
      const date = dateStr(day.date);
      if (!date) continue;
      let filled = (day.locations || []).filter((loc) => loc.locationLabel && locationHasData(loc));
      if (filled.length === 0) {
        const stub = (day.locations || []).find((loc) => loc.locationLabel);
        if (stub) filled = [stub];
      }
      const labels = [...new Set(
        (day.locations || [])
          .map((loc) => String(loc.locationLabel || '').trim())
          .filter(Boolean),
      )];
      if (labels.length === 0) continue;
      await client.query(
        `DELETE FROM irrigation_entries
         WHERE site_id = $1 AND date = $2 AND (organization_id IS NULL OR organization_id = $3)
           AND location_label = ANY($4::text[])`,
        [siteId, date, orgId, labels],
      );
      for (const loc of filled) {
        const waterQty = num(loc.waterQtyM3);
        const frequency = num(loc.frequency);
        const dailyWater = computeDaily(waterQty, frequency, num(loc.dailyWater));
        await client.query(
          `INSERT INTO irrigation_entries (
            organization_id, site_id, field_id, date, location_label, valve_range,
            week_number, method, flow_rate_m3, operator_name, authorized_by,
            water_qty_m3, frequency, daily_water, fertilizer_type, fertilizer_qty,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, NOW())`,
          [
            orgId,
            siteId,
            loc.fieldId || null,
            date,
            loc.locationLabel.trim(),
            loc.valveRange || null,
            day.weekNumber ?? null,
            day.method || 'Drip',
            num(day.flowRateM3),
            day.operatorName || null,
            day.authorizedBy || null,
            waterQty,
            frequency,
            dailyWater,
            loc.fertilizerType?.trim() || null,
            num(loc.fertilizerQty),
          ],
        );
        saved += 1;
      }
    }
    await client.query('COMMIT');
    return { saved, dates: days.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteEntry(id: string, orgId: string): Promise<void> {
  const existing = await dbPool.query(
    `SELECT site_id, date FROM irrigation_entries
     WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
    [id, orgId],
  );
  const row = existing.rows[0];
  if (!row) throw new NotFoundError('Irrigation entry');
  const day = dateStr(row.date);
  if (row.site_id && day) await assertDateWritableForSite(row.site_id, day);
  const result = await dbPool.query(
    `DELETE FROM irrigation_entries
     WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
    [id, orgId],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError('Irrigation entry');
  }
}

export async function deleteDay(
  siteId: string,
  date: string,
  orgId: string,
  locationLabels?: string[],
): Promise<number> {
  const iso = dateStr(date);
  if (!iso) throw new AppError('Date is required', 'VALIDATION', 400);
  await assertDateWritableForSite(siteId, iso);
  const labels = (locationLabels || []).map((l) => String(l || '').trim()).filter(Boolean);
  if (labels.length > 0) {
    const result = await dbPool.query(
      `DELETE FROM irrigation_entries
       WHERE site_id = $1 AND date = $2 AND (organization_id IS NULL OR organization_id = $3)
         AND location_label = ANY($4::text[])`,
      [siteId, iso, orgId, labels],
    );
    return result.rowCount ?? 0;
  }
  const result = await dbPool.query(
    `DELETE FROM irrigation_entries
     WHERE site_id = $1 AND date = $2 AND (organization_id IS NULL OR organization_id = $3)`,
    [siteId, iso, orgId],
  );
  return result.rowCount ?? 0;
}
