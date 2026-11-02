import { dbPool } from '../db/client';
import type { ECPHEntry, ECPHValveReading } from '../models/ecph.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = {
  page?: number;
  limit?: number;
  fieldId?: string;
  siteId?: string;
  startDate?: string;
  endDate?: string;
  templateId?: string;
  organizationId: string;
};
type ListResult<T> = { items: T[]; total: number };

const CROP_RESOLVE_SQL = `
  LEFT JOIN crops entry_crop ON entry_crop.id = ecph_entries.crop_id
  LEFT JOIN LATERAL (
    SELECT ch.crop_id
    FROM crop_history ch
    WHERE ch.field_id = ecph_entries.field_id
      AND ch.start_date <= ecph_entries.date::date
      AND (ch.end_date IS NULL OR ch.end_date >= ecph_entries.date::date)
    ORDER BY ch.start_date DESC
    LIMIT 1
  ) hist ON ecph_entries.crop_id IS NULL
  LEFT JOIN crops hist_crop ON hist_crop.id = hist.crop_id
  LEFT JOIN crops field_crop ON field_crop.id = f.current_crop_id
`;

const ENTRY_SELECT_SQL = `
  ecph_entries.*,
  COALESCE(ecph_entries.crop_id, hist.crop_id, f.current_crop_id) AS resolved_crop_id,
  COALESCE(entry_crop.name, hist_crop.name, field_crop.name) AS crop_name
`;

function mapEntry(row: any): ECPHEntry {
  return {
    id: row.id,
    fieldId: row.field_id,
    date: row.date,
    time: row.time ?? undefined,
    qtyOfWater: row.qty_of_water ?? undefined,
    cycle: row.cycle ?? undefined,
    totalWaterQty: row.total_water_qty ?? undefined,
    fieldTotalWaterBasedOnDrip: row.field_total_water_based_on_drip ?? undefined,
    dripperCount: row.dripper_count ?? undefined,
    dripTestCount: row.drip_test_count ?? undefined,
    cropId: row.resolved_crop_id ?? row.crop_id ?? undefined,
    cropName: row.crop_name ?? undefined,
    weatherCondition: row.weather_condition ?? undefined,
    irrigationStatus: row.irrigation_status ?? undefined,
    templateId: row.template_id ?? undefined,
    createdAt: row.created_at,
  };
}

function mapReading(row: any): ECPHValveReading {
  return {
    id: row.id,
    ecphEntryId: row.ecph_entry_id,
    valveNumber: row.valve_number,
    dripVolume: row.drip_volume ?? undefined,
    ecIn: row.ec_in ?? undefined,
    ec: row.ec ?? undefined,
    phIn: row.ph_in ?? undefined,
    ph: row.ph ?? undefined,
    drain: row.drain ?? undefined,
    percentDrain: row.percent_drain ?? undefined,
    totalWaterBasedOnDrip: row.total_water_based_on_drip ?? undefined,
    qtyOfWater: row.qty_of_water ?? undefined,
    cycle: row.cycle ?? undefined,
    totalWaterQty: row.total_water_qty ?? undefined,
  };
}

export class EcphRepository extends BaseRepository<ECPHEntry> {
  constructor() {
    super('ecph_entries');
  }

  async list(params: ListParams): Promise<ListResult<ECPHEntry>> {
    const { limit, offset } = normalizePagination(params);
    const values: Array<string | number> = [];
    const where: string[] = [];
    let joinSql = ' LEFT JOIN fields f ON f.id = ecph_entries.field_id';

    values.push(params.organizationId);
    where.push(`COALESCE(ecph_entries.organization_id, f.organization_id) = $${values.length}`);

    if (params.siteId) {
      joinSql += ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
      values.push(params.siteId);
      where.push(`fa.site_id = $${values.length}`);
    }

    if (params.fieldId) {
      values.push(params.fieldId);
      where.push(`ecph_entries.field_id = $${values.length}`);
    }
    if (params.startDate) {
      values.push(params.startDate);
      where.push(`ecph_entries.date >= $${values.length}`);
    }
    if (params.endDate) {
      values.push(params.endDate);
      where.push(`ecph_entries.date <= $${values.length}`);
    }
    if (params.templateId) {
      values.push(params.templateId);
      where.push(`ecph_entries.template_id = $${values.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalResult = await dbPool.query(
      `SELECT COUNT(*) FROM ecph_entries${joinSql} ${whereSql}`,
      values
    );
    const total = Number(totalResult.rows[0].count);

    values.push(limit, offset);
    const result = await dbPool.query(
      `SELECT ${ENTRY_SELECT_SQL}
       FROM ecph_entries${joinSql}${CROP_RESOLVE_SQL}
       ${whereSql}
       ORDER BY ecph_entries.date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const entries = result.rows.map(mapEntry);

    const entryIds = entries.map(e => e.id);
    if (entryIds.length > 0) {
      const readingsResult = await dbPool.query(
        'SELECT * FROM ecph_valve_readings WHERE ecph_entry_id = ANY($1)',
        [entryIds]
      );
      const readingsByEntry = new Map<string, ECPHValveReading[]>();
      for (const row of readingsResult.rows) {
        const entryId = row.ecph_entry_id;
        if (!readingsByEntry.has(entryId)) readingsByEntry.set(entryId, []);
        readingsByEntry.get(entryId)!.push(mapReading(row));
      }
      for (const entry of entries) {
        entry.valveReadings = readingsByEntry.get(entry.id) || [];
      }
    }

    return { items: entries, total };
  }

  async getById(id: string): Promise<ECPHEntry> {
    const entryResult = await dbPool.query(
      `SELECT ${ENTRY_SELECT_SQL}
       FROM ecph_entries
       LEFT JOIN fields f ON f.id = ecph_entries.field_id
       ${CROP_RESOLVE_SQL}
       WHERE ecph_entries.id = $1`,
      [id]
    );
    if (entryResult.rowCount === 0) {
      throw new NotFoundError('EC/PH entry not found');
    }
    const readingsResult = await dbPool.query(
      'SELECT * FROM ecph_valve_readings WHERE ecph_entry_id = $1',
      [id]
    );
    const entry = mapEntry(entryResult.rows[0]);
    entry.valveReadings = readingsResult.rows.map(mapReading);
    return entry;
  }

  async create(payload: {
    fieldId: string;
    date: string;
    time?: string;
    qtyOfWater?: number;
    cycle?: number;
    totalWaterQty?: number;
    fieldTotalWaterBasedOnDrip?: number;
    dripperCount?: number;
    dripTestCount?: number;
    weatherCondition?: string;
    irrigationStatus?: string;
    templateId?: string;
    valveReadings?: Array<{
      valveNumber: number;
      dripVolume?: number;
      ecIn?: number;
      ec?: number;
      phIn?: number;
      ph?: number;
      drain?: number;
      percentDrain?: number;
      totalWaterBasedOnDrip?: number;
      qtyOfWater?: number;
      cycle?: number;
      totalWaterQty?: number;
    }>;
  }): Promise<ECPHEntry> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const entryResult = await client.query(
        `INSERT INTO ecph_entries (
          field_id, date, time, qty_of_water, cycle,
          total_water_qty, field_total_water_based_on_drip, dripper_count,
          drip_test_count, weather_condition, irrigation_status, template_id
        )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          payload.fieldId,
          payload.date,
          payload.time ?? null,
          payload.qtyOfWater ?? null,
          payload.cycle ?? null,
          payload.totalWaterQty ?? null,
          payload.fieldTotalWaterBasedOnDrip ?? null,
          payload.dripperCount ?? null,
          payload.dripTestCount != null && payload.dripTestCount > 0
            ? payload.dripTestCount
            : null,
          payload.weatherCondition ?? null,
          payload.irrigationStatus ?? null,
          payload.templateId ?? null,
        ]
      );
      const entry = mapEntry(entryResult.rows[0]);

      if (payload.valveReadings) {
        for (const reading of payload.valveReadings) {
          await client.query(
            `INSERT INTO ecph_valve_readings (
              ecph_entry_id, valve_number, drip_volume, ec_in, ec, ph_in, ph,
              drain, percent_drain, total_water_based_on_drip,
              qty_of_water, cycle, total_water_qty
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              entry.id,
              reading.valveNumber,
              reading.dripVolume ?? null,
              reading.ecIn ?? null,
              reading.ec ?? null,
              reading.phIn ?? null,
              reading.ph ?? null,
              reading.drain ?? null,
              reading.percentDrain ?? null,
              reading.totalWaterBasedOnDrip ?? null,
              reading.qtyOfWater ?? null,
              reading.cycle ?? null,
              reading.totalWaterQty ?? null,
            ]
          );
        }
      }

      await client.query('COMMIT');
      return this.getById(entry.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    payload: {
      date?: string;
      time?: string;
      qtyOfWater?: number;
      cycle?: number;
      totalWaterQty?: number;
      fieldTotalWaterBasedOnDrip?: number;
      dripperCount?: number;
      dripTestCount?: number;
      weatherCondition?: string;
      irrigationStatus?: string;
      valveReadings?: Array<{
        valveNumber: number;
        dripVolume?: number;
        ecIn?: number;
        ec?: number;
        phIn?: number;
        ph?: number;
        drain?: number;
        percentDrain?: number;
        totalWaterBasedOnDrip?: number;
        qtyOfWater?: number;
        cycle?: number;
        totalWaterQty?: number;
      }>;
    }
  ): Promise<ECPHEntry> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: Array<string | number | null> = [];

      if (payload.date !== undefined) {
        values.push(payload.date);
        updates.push(`date = $${values.length}`);
      }
      if (payload.time !== undefined) {
        values.push(payload.time);
        updates.push(`time = $${values.length}`);
      }
      if (payload.qtyOfWater !== undefined) {
        values.push(payload.qtyOfWater);
        updates.push(`qty_of_water = $${values.length}`);
      }
      if (payload.cycle !== undefined) {
        values.push(payload.cycle);
        updates.push(`cycle = $${values.length}`);
      }
      if (payload.totalWaterQty !== undefined) {
        values.push(payload.totalWaterQty);
        updates.push(`total_water_qty = $${values.length}`);
      }
      if (payload.fieldTotalWaterBasedOnDrip !== undefined) {
        values.push(payload.fieldTotalWaterBasedOnDrip);
        updates.push(`field_total_water_based_on_drip = $${values.length}`);
      }
      if (payload.dripperCount !== undefined) {
        values.push(payload.dripperCount);
        updates.push(`dripper_count = $${values.length}`);
      }
      if (payload.dripTestCount !== undefined) {
        values.push(
          payload.dripTestCount != null && payload.dripTestCount > 0
            ? payload.dripTestCount
            : null
        );
        updates.push(`drip_test_count = $${values.length}`);
      }
      if (payload.weatherCondition !== undefined) {
        values.push(payload.weatherCondition);
        updates.push(`weather_condition = $${values.length}`);
      }
      if (payload.irrigationStatus !== undefined) {
        values.push(payload.irrigationStatus);
        updates.push(`irrigation_status = $${values.length}`);
      }

      if (updates.length === 0 && payload.valveReadings === undefined) {
        throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
      }

      let entryRow: any;
      if (updates.length > 0) {
        values.push(id);
        const result = await client.query(
          `UPDATE ecph_entries
           SET ${updates.join(', ')}, created_at = created_at
           WHERE id = $${values.length}
           RETURNING *`,
          values
        );
        if (result.rowCount === 0) {
          throw new NotFoundError('EC/PH entry not found');
        }
        entryRow = result.rows[0];
      } else {
        const result = await client.query('SELECT * FROM ecph_entries WHERE id = $1', [id]);
        if (result.rowCount === 0) {
          throw new NotFoundError('EC/PH entry not found');
        }
        entryRow = result.rows[0];
      }

      if (payload.valveReadings) {
        await client.query('DELETE FROM ecph_valve_readings WHERE ecph_entry_id = $1', [
          id,
        ]);
        for (const reading of payload.valveReadings) {
          await client.query(
            `INSERT INTO ecph_valve_readings (
              ecph_entry_id, valve_number, drip_volume, ec_in, ec, ph_in, ph,
              drain, percent_drain, total_water_based_on_drip,
              qty_of_water, cycle, total_water_qty
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              id,
              reading.valveNumber,
              reading.dripVolume ?? null,
              reading.ecIn ?? null,
              reading.ec ?? null,
              reading.phIn ?? null,
              reading.ph ?? null,
              reading.drain ?? null,
              reading.percentDrain ?? null,
              reading.totalWaterBasedOnDrip ?? null,
              reading.qtyOfWater ?? null,
              reading.cycle ?? null,
              reading.totalWaterQty ?? null,
            ]
          );
        }
      }

      await client.query('COMMIT');
      const entry = mapEntry(entryRow);
      const readingsResult = await dbPool.query(
        'SELECT * FROM ecph_valve_readings WHERE ecph_entry_id = $1',
        [id]
      );
      entry.valveReadings = readingsResult.rows.map(mapReading);
      return entry;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<void> {
    const result = await dbPool.query('DELETE FROM ecph_entries WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('EC/PH entry not found');
    }
  }
}
