import { dbPool } from '../db/client';
import type { WeatherLogEntry } from '../models/weather-log.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = {
  organizationId: string;
  page?: number;
  limit?: number;
  siteId?: string;
  fieldId?: string;
  startDate?: string;
  endDate?: string;
};
type ListResult<T> = { items: T[]; total: number };

// Weather logs have no organization_id of their own: a log belongs to the
// organization that owns its site (site_id is NOT NULL). Append the parameter
// number and a closing parenthesis.
const IN_ORG_SITES = 'site_id IN (SELECT id FROM sites WHERE organization_id = $';

const toNumber = (value: any) => (value === null || value === undefined ? undefined : Number(value));

function mapEntry(row: any): WeatherLogEntry {
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

export class WeatherLogRepository extends BaseRepository<WeatherLogEntry> {
  constructor() {
    super('weather_logs');
  }

  async list(params: ListParams): Promise<ListResult<WeatherLogEntry>> {
    const { limit, offset } = normalizePagination(params);
    const values: Array<string | number> = [params.organizationId];
    const where: string[] = [`${IN_ORG_SITES}1)`];

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

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalResult = await dbPool.query(
      `SELECT COUNT(*) FROM weather_logs ${whereSql}`,
      values
    );
    const total = Number(totalResult.rows[0].count);

    values.push(limit, offset);
    const result = await dbPool.query(
      `SELECT * FROM weather_logs
       ${whereSql}
       ORDER BY date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return { items: result.rows.map(mapEntry), total };
  }

  async getById(id: string, organizationId: string): Promise<WeatherLogEntry> {
    const result = await dbPool.query(
      `SELECT * FROM weather_logs WHERE id = $1 AND ${IN_ORG_SITES}2)`,
      [id, organizationId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Weather log not found');
    }
    return mapEntry(result.rows[0]);
  }

  async create(payload: {
    date: string;
    countryId?: string;
    siteId: string;
    fieldId?: string;
    latitude?: number;
    longitude?: number;
    maxTemp?: number;
    minTemp?: number;
    avgTemp?: number;
    feelsLike?: number;
    avgRH?: number;
    rainfall?: number;
    pressure?: number;
    windSpeed?: number;
    windDirection?: number;
    clouds?: number;
    description?: string;
    source?: string;
    notes?: string;
  }): Promise<WeatherLogEntry> {
    const result = await dbPool.query(
      `INSERT INTO weather_logs (
        date, country_id, site_id, field_id, latitude, longitude,
        max_temp, min_temp, avg_temp, feels_like, avg_rh, rainfall,
        pressure, wind_speed, wind_direction, clouds, description, source, notes
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
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
      ]
    );
    return mapEntry(result.rows[0]);
  }

  async update(
    id: string,
    organizationId: string,
    payload: {
      date?: string;
      countryId?: string;
      siteId?: string;
      fieldId?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      maxTemp?: number | null;
      minTemp?: number | null;
      avgTemp?: number | null;
      feelsLike?: number | null;
      avgRH?: number | null;
      rainfall?: number | null;
      pressure?: number | null;
      windSpeed?: number | null;
      windDirection?: number | null;
      clouds?: number | null;
      description?: string | null;
      source?: string | null;
      notes?: string | null;
    }
  ): Promise<WeatherLogEntry> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    const setField = (column: string, value: unknown) => {
      values.push(value as string | number | null);
      updates.push(`${column} = $${values.length}`);
    };

    if (payload.date !== undefined) setField('date', payload.date);
    if (payload.countryId !== undefined) setField('country_id', payload.countryId);
    if (payload.siteId !== undefined) setField('site_id', payload.siteId);
    if (payload.fieldId !== undefined) setField('field_id', payload.fieldId);
    if (payload.latitude !== undefined) setField('latitude', payload.latitude);
    if (payload.longitude !== undefined) setField('longitude', payload.longitude);
    if (payload.maxTemp !== undefined) setField('max_temp', payload.maxTemp);
    if (payload.minTemp !== undefined) setField('min_temp', payload.minTemp);
    if (payload.avgTemp !== undefined) setField('avg_temp', payload.avgTemp);
    if (payload.feelsLike !== undefined) setField('feels_like', payload.feelsLike);
    if (payload.avgRH !== undefined) setField('avg_rh', payload.avgRH);
    if (payload.rainfall !== undefined) setField('rainfall', payload.rainfall);
    if (payload.pressure !== undefined) setField('pressure', payload.pressure);
    if (payload.windSpeed !== undefined) setField('wind_speed', payload.windSpeed);
    if (payload.windDirection !== undefined) setField('wind_direction', payload.windDirection);
    if (payload.clouds !== undefined) setField('clouds', payload.clouds);
    if (payload.description !== undefined) setField('description', payload.description);
    if (payload.source !== undefined) setField('source', payload.source);
    if (payload.notes !== undefined) setField('notes', payload.notes);

    if (updates.length === 0) {
      throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(id, organizationId);
    const result = await dbPool.query(
      `UPDATE weather_logs
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND ${IN_ORG_SITES}${values.length})
       RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Weather log not found');
    }
    return mapEntry(result.rows[0]);
  }

  async delete(id: string, organizationId: string): Promise<void> {
    const result = await dbPool.query(
      `DELETE FROM weather_logs WHERE id = $1 AND ${IN_ORG_SITES}2)`,
      [id, organizationId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Weather log not found');
    }
  }
}
