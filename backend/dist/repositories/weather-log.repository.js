"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherLogRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
const toNumber = (value) => (value === null || value === undefined ? undefined : Number(value));
function mapEntry(row) {
    return {
        id: row.id,
        date: row.date,
        countryId: row.country_id ?? undefined,
        siteId: row.site_id,
        fieldId: row.field_id ?? undefined,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        maxTemp: toNumber(row.max_temp),
        minTemp: toNumber(row.min_temp),
        avgTemp: toNumber(row.avg_temp),
        feelsLike: toNumber(row.feels_like),
        avgRH: toNumber(row.avg_rh),
        rainfall: toNumber(row.rainfall),
        pressure: toNumber(row.pressure),
        windSpeed: toNumber(row.wind_speed),
        windDirection: toNumber(row.wind_direction),
        clouds: toNumber(row.clouds),
        description: row.description ?? undefined,
        source: row.source ?? undefined,
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class WeatherLogRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('weather_logs');
    }
    async list(params) {
        const { limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = [];
        if (params.siteId) {
            values.push(params.siteId);
            where.push(`site_id = $${values.length}`);
        }
        if (params.fieldId) {
            values.push(params.fieldId);
            where.push(`field_id = $${values.length}`);
        }
        if (params.startDate) {
            values.push(params.startDate);
            where.push(`date >= $${values.length}`);
        }
        if (params.endDate) {
            values.push(params.endDate);
            where.push(`date <= $${values.length}`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM weather_logs ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT * FROM weather_logs
       ${whereSql}
       ORDER BY date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return { items: result.rows.map(mapEntry), total };
    }
    async getById(id) {
        const result = await client_1.dbPool.query('SELECT * FROM weather_logs WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Weather log not found');
        }
        return mapEntry(result.rows[0]);
    }
    async create(payload) {
        const result = await client_1.dbPool.query(`INSERT INTO weather_logs (
        date, country_id, site_id, field_id, latitude, longitude,
        max_temp, min_temp, avg_temp, feels_like, avg_rh, rainfall,
        pressure, wind_speed, wind_direction, clouds, description, source, notes
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`, [
            payload.date,
            payload.countryId ?? null,
            payload.siteId,
            payload.fieldId ?? null,
            payload.latitude ?? null,
            payload.longitude ?? null,
            payload.maxTemp ?? null,
            payload.minTemp ?? null,
            payload.avgTemp ?? null,
            payload.feelsLike ?? null,
            payload.avgRH ?? null,
            payload.rainfall ?? null,
            payload.pressure ?? null,
            payload.windSpeed ?? null,
            payload.windDirection ?? null,
            payload.clouds ?? null,
            payload.description ?? null,
            payload.source ?? null,
            payload.notes ?? null,
        ]);
        return mapEntry(result.rows[0]);
    }
    async update(id, payload) {
        const updates = [];
        const values = [];
        const setField = (column, value) => {
            values.push(value);
            updates.push(`${column} = $${values.length}`);
        };
        if (payload.date !== undefined)
            setField('date', payload.date);
        if (payload.countryId !== undefined)
            setField('country_id', payload.countryId);
        if (payload.siteId !== undefined)
            setField('site_id', payload.siteId);
        if (payload.fieldId !== undefined)
            setField('field_id', payload.fieldId);
        if (payload.latitude !== undefined)
            setField('latitude', payload.latitude);
        if (payload.longitude !== undefined)
            setField('longitude', payload.longitude);
        if (payload.maxTemp !== undefined)
            setField('max_temp', payload.maxTemp);
        if (payload.minTemp !== undefined)
            setField('min_temp', payload.minTemp);
        if (payload.avgTemp !== undefined)
            setField('avg_temp', payload.avgTemp);
        if (payload.feelsLike !== undefined)
            setField('feels_like', payload.feelsLike);
        if (payload.avgRH !== undefined)
            setField('avg_rh', payload.avgRH);
        if (payload.rainfall !== undefined)
            setField('rainfall', payload.rainfall);
        if (payload.pressure !== undefined)
            setField('pressure', payload.pressure);
        if (payload.windSpeed !== undefined)
            setField('wind_speed', payload.windSpeed);
        if (payload.windDirection !== undefined)
            setField('wind_direction', payload.windDirection);
        if (payload.clouds !== undefined)
            setField('clouds', payload.clouds);
        if (payload.description !== undefined)
            setField('description', payload.description);
        if (payload.source !== undefined)
            setField('source', payload.source);
        if (payload.notes !== undefined)
            setField('notes', payload.notes);
        if (updates.length === 0) {
            throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE weather_logs
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Weather log not found');
        }
        return mapEntry(result.rows[0]);
    }
    async delete(id) {
        const result = await client_1.dbPool.query('DELETE FROM weather_logs WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Weather log not found');
        }
    }
}
exports.WeatherLogRepository = WeatherLogRepository;
