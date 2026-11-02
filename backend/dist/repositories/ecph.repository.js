"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcphRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
function mapEntry(row) {
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
        weatherCondition: row.weather_condition ?? undefined,
        irrigationStatus: row.irrigation_status ?? undefined,
        templateId: row.template_id ?? undefined,
        createdAt: row.created_at,
    };
}
function mapReading(row) {
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
class EcphRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('ecph_entries');
    }
    async list(params) {
        const { limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = [];
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
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM ecph_entries${joinSql} ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT ecph_entries.* FROM ecph_entries${joinSql}
       ${whereSql}
       ORDER BY ecph_entries.date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        const entries = result.rows.map(mapEntry);
        const entryIds = entries.map(e => e.id);
        if (entryIds.length > 0) {
            const readingsResult = await client_1.dbPool.query('SELECT * FROM ecph_valve_readings WHERE ecph_entry_id = ANY($1)', [entryIds]);
            const readingsByEntry = new Map();
            for (const row of readingsResult.rows) {
                const entryId = row.ecph_entry_id;
                if (!readingsByEntry.has(entryId))
                    readingsByEntry.set(entryId, []);
                readingsByEntry.get(entryId).push(mapReading(row));
            }
            for (const entry of entries) {
                entry.valveReadings = readingsByEntry.get(entry.id) || [];
            }
        }
        return { items: entries, total };
    }
    async getById(id) {
        const entryResult = await client_1.dbPool.query('SELECT * FROM ecph_entries WHERE id = $1', [id]);
        if (entryResult.rowCount === 0) {
            throw new errors_1.NotFoundError('EC/PH entry not found');
        }
        const readingsResult = await client_1.dbPool.query('SELECT * FROM ecph_valve_readings WHERE ecph_entry_id = $1', [id]);
        const entry = mapEntry(entryResult.rows[0]);
        entry.valveReadings = readingsResult.rows.map(mapReading);
        return entry;
    }
    async create(payload) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const entryResult = await client.query(`INSERT INTO ecph_entries (
          field_id, date, time, qty_of_water, cycle,
          total_water_qty, field_total_water_based_on_drip, dripper_count,
          weather_condition, irrigation_status, template_id
        )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`, [
                payload.fieldId,
                payload.date,
                payload.time ?? null,
                payload.qtyOfWater ?? null,
                payload.cycle ?? null,
                payload.totalWaterQty ?? null,
                payload.fieldTotalWaterBasedOnDrip ?? null,
                payload.dripperCount ?? null,
                payload.weatherCondition ?? null,
                payload.irrigationStatus ?? null,
                payload.templateId ?? null,
            ]);
            const entry = mapEntry(entryResult.rows[0]);
            if (payload.valveReadings) {
                for (const reading of payload.valveReadings) {
                    await client.query(`INSERT INTO ecph_valve_readings (
              ecph_entry_id, valve_number, drip_volume, ec_in, ec, ph_in, ph,
              drain, percent_drain, total_water_based_on_drip,
              qty_of_water, cycle, total_water_qty
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
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
                    ]);
                }
            }
            await client.query('COMMIT');
            return this.getById(entry.id);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async update(id, payload) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const updates = [];
            const values = [];
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
            if (payload.weatherCondition !== undefined) {
                values.push(payload.weatherCondition);
                updates.push(`weather_condition = $${values.length}`);
            }
            if (payload.irrigationStatus !== undefined) {
                values.push(payload.irrigationStatus);
                updates.push(`irrigation_status = $${values.length}`);
            }
            if (updates.length === 0 && payload.valveReadings === undefined) {
                throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
            }
            let entryRow;
            if (updates.length > 0) {
                values.push(id);
                const result = await client.query(`UPDATE ecph_entries
           SET ${updates.join(', ')}, created_at = created_at
           WHERE id = $${values.length}
           RETURNING *`, values);
                if (result.rowCount === 0) {
                    throw new errors_1.NotFoundError('EC/PH entry not found');
                }
                entryRow = result.rows[0];
            }
            else {
                const result = await client.query('SELECT * FROM ecph_entries WHERE id = $1', [id]);
                if (result.rowCount === 0) {
                    throw new errors_1.NotFoundError('EC/PH entry not found');
                }
                entryRow = result.rows[0];
            }
            if (payload.valveReadings) {
                await client.query('DELETE FROM ecph_valve_readings WHERE ecph_entry_id = $1', [
                    id,
                ]);
                for (const reading of payload.valveReadings) {
                    await client.query(`INSERT INTO ecph_valve_readings (
              ecph_entry_id, valve_number, drip_volume, ec_in, ec, ph_in, ph,
              drain, percent_drain, total_water_based_on_drip,
              qty_of_water, cycle, total_water_qty
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [
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
                    ]);
                }
            }
            await client.query('COMMIT');
            const entry = mapEntry(entryRow);
            const readingsResult = await client_1.dbPool.query('SELECT * FROM ecph_valve_readings WHERE ecph_entry_id = $1', [id]);
            entry.valveReadings = readingsResult.rows.map(mapReading);
            return entry;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async delete(id) {
        const result = await client_1.dbPool.query('DELETE FROM ecph_entries WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('EC/PH entry not found');
        }
    }
}
exports.EcphRepository = EcphRepository;
