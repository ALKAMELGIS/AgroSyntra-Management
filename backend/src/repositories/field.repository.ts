import { dbPool } from '../db/client';
import type { Field } from '../models/field.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = { page?: number; limit?: number; farmAreaId?: string; fieldIds?: string[]; siteId?: string; organizationId?: string };
type ListResult<T> = { items: T[]; total: number };

// Cached PostGIS / crop_varieties availability flags
let _hasPostGIS: boolean | null = null;
let _hasCropVarieties: boolean | null = null;

async function checkPostGIS(): Promise<boolean> {
  if (_hasPostGIS !== null) return _hasPostGIS;
  try {
    await dbPool.query(`SELECT PostGIS_Version()`);
    _hasPostGIS = true;
  } catch {
    _hasPostGIS = false;
  }
  return _hasPostGIS;
}

async function checkCropVarieties(): Promise<boolean> {
  if (_hasCropVarieties !== null) return _hasCropVarieties;
  try {
    await dbPool.query(`SELECT 1 FROM crop_varieties LIMIT 0`);
    _hasCropVarieties = true;
  } catch {
    _hasCropVarieties = false;
  }
  return _hasCropVarieties;
}

function polygonSelect(alias = 'f'): string {
  return _hasPostGIS
    ? `ST_AsGeoJSON(${alias}.polygon) AS polygon_geojson`
    : `${alias}.polygon AS polygon_geojson`;
}

function polygonSelectBare(): string {
  return _hasPostGIS
    ? `ST_AsGeoJSON(polygon) AS polygon_geojson`
    : `polygon AS polygon_geojson`;
}

function parsePolygon(raw: any): Field['polygon'] | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return undefined; }
  }
  if (typeof raw === 'object' && raw.type) return raw;
  return undefined;
}

function mapField(row: any): Field {
  return {
    id: row.id,
    farmAreaId: row.farm_area_id,
    fieldTypeId: row.field_type_id ?? undefined,
    name: row.name,
    currentCropId: row.current_crop_id ?? undefined,
    varietyId: row.variety_id ?? undefined,
    valveCount: row.valve_count,
    area: row.area ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    polygon: parsePolygon(row.polygon_geojson ?? row.polygon),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    varietyName: row.variety_name ?? undefined,
    current_crop: row.crop_name ?? undefined,
  };
}

export class FieldRepository extends BaseRepository<Field> {
  constructor() {
    super('fields');
  }

  async list(params: ListParams): Promise<ListResult<Field>> {
    await checkPostGIS();
    await checkCropVarieties();

    const { page, limit, offset } = normalizePagination(params);
    const values: Array<string | number | string[]> = [];
    const where: string[] = ['deleted_at IS NULL'];

    if (params.siteId) {
      values.push(params.siteId);
      where.push(`farm_area_id IN (SELECT id FROM farm_areas WHERE site_id = $${values.length})`);
    }
    if (params.farmAreaId) {
      values.push(params.farmAreaId);
      where.push(`farm_area_id = $${values.length}`);
    }
    if (params.fieldIds?.length) {
      values.push(params.fieldIds);
      where.push(`id = ANY($${values.length}::uuid[])`);
    }
    if (params.organizationId) {
      values.push(params.organizationId);
      where.push(`organization_id = $${values.length}`);
    }

    const whereSql = `WHERE ${where.map(w => `f.${w}`).join(' AND ')}`;
    const totalResult = await dbPool.query(
      `SELECT COUNT(*) FROM fields f ${whereSql}`,
      values
    );
    const total = Number(totalResult.rows[0].count);

    const varietyJoin = _hasCropVarieties ? 'LEFT JOIN crop_varieties cv ON cv.id = f.variety_id' : '';
    const varietyCol = _hasCropVarieties ? ', cv.name AS variety_name' : '';

    values.push(limit, offset);
    const result = await dbPool.query(
      `SELECT f.*, ${polygonSelect()}${varietyCol}, c.name AS crop_name
       FROM fields f
       LEFT JOIN crops c ON c.id = f.current_crop_id
       ${varietyJoin}
       ${whereSql}
       ORDER BY f.name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return { items: result.rows.map(mapField), total };
  }

  async getById(id: string): Promise<Field> {
    await checkPostGIS();
    await checkCropVarieties();
    const varietyJoin = _hasCropVarieties ? 'LEFT JOIN crop_varieties cv ON cv.id = f.variety_id' : '';
    const varietyCol = _hasCropVarieties ? ', cv.name AS variety_name' : '';
    const result = await dbPool.query(
      `SELECT f.*, ${polygonSelect()}, c.name AS crop_name${varietyCol}
       FROM fields f
       LEFT JOIN crops c ON c.id = f.current_crop_id
       ${varietyJoin}
       WHERE f.id = $1 AND f.deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Field not found');
    }
    return mapField(result.rows[0]);
  }

  async getLocation(id: string): Promise<{ latitude: number; longitude: number }> {
    const result = await dbPool.query(
      `SELECT latitude, longitude FROM fields
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Field not found');
    }
    const { latitude, longitude } = result.rows[0];
    if (latitude === null || longitude === null) {
      throw new AppError('Field location not set', 'VALIDATION_ERROR', 400);
    }
    return { latitude: Number(latitude), longitude: Number(longitude) };
  }

  async getPolygon(id: string): Promise<number[][]> {
    await checkPostGIS();
    const result = await dbPool.query(
      `SELECT ${polygonSelectBare()}
       FROM fields WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Field not found');
    }
    const raw = result.rows[0].polygon_geojson;
    if (!raw) {
      throw new AppError('Field polygon not set', 'VALIDATION_ERROR', 400);
    }
    const geojson = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!geojson?.coordinates?.[0]) {
      throw new AppError('Invalid field polygon', 'VALIDATION_ERROR', 400);
    }
    return geojson.coordinates[0].map((coord: number[]) => [coord[1], coord[0]]);
  }

  async create(payload: {
    farmAreaId: string;
    fieldTypeId?: string;
    name: string;
    currentCropId?: string;
    varietyId?: string;
    valveCount?: number;
    area?: number;
    latitude?: number;
    longitude?: number;
    polygonWkt?: string | null;
    organizationId: string;
  }): Promise<Field> {
    await checkPostGIS();
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const polygonExpr = payload.polygonWkt
        ? (_hasPostGIS ? 'ST_GeomFromText($10, 4326)' : '$10::jsonb')
        : '$10';
      const result = await client.query(
      `INSERT INTO fields (
        farm_area_id, field_type_id, name, current_crop_id, valve_count,
        area, latitude, longitude, variety_id, polygon, organization_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${polygonExpr}, $11)
       RETURNING *, ${polygonSelectBare()}`,
      [
        payload.farmAreaId,
        payload.fieldTypeId ?? null,
        payload.name,
        payload.currentCropId ?? null,
        payload.valveCount ?? 0,
        payload.area ?? null,
        payload.latitude ?? null,
        payload.longitude ?? null,
        payload.varietyId ?? null,
        payload.polygonWkt ?? null,
        payload.organizationId,
      ]
    );

      const field = mapField(result.rows[0]);
      if (payload.currentCropId) {
        await client.query(
          `INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
           VALUES ($1, $2, NULL, NOW()::date, NULL, NULL)
           ON CONFLICT (field_id, crop_id, start_date) DO UPDATE SET
             end_date = NULL
           RETURNING id`,
          [field.id, payload.currentCropId]
        );
      }
      await client.query('COMMIT');
      return field;
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
      farmAreaId?: string;
      fieldTypeId?: string;
      name?: string;
      currentCropId?: string;
      varietyId?: string | null;
      valveCount?: number;
      area?: number;
      latitude?: number;
      longitude?: number;
      polygonWkt?: string | null;
    }
  ): Promise<Field> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (payload.farmAreaId !== undefined) {
      values.push(payload.farmAreaId);
      updates.push(`farm_area_id = $${values.length}`);
    }
    if (payload.fieldTypeId !== undefined) {
      values.push(payload.fieldTypeId);
      updates.push(`field_type_id = $${values.length}`);
    }
    if (payload.name !== undefined) {
      values.push(payload.name);
      updates.push(`name = $${values.length}`);
    }
    if (payload.currentCropId !== undefined) {
      values.push(payload.currentCropId);
      updates.push(`current_crop_id = $${values.length}`);
    }
    if (payload.varietyId !== undefined) {
      values.push(payload.varietyId);
      updates.push(`variety_id = $${values.length}`);
    }
    if (payload.valveCount !== undefined) {
      values.push(payload.valveCount);
      updates.push(`valve_count = $${values.length}`);
    }
    if (payload.area !== undefined) {
      values.push(payload.area);
      updates.push(`area = $${values.length}`);
    }
    if (payload.latitude !== undefined) {
      values.push(payload.latitude);
      updates.push(`latitude = $${values.length}`);
    }
    if (payload.longitude !== undefined) {
      values.push(payload.longitude);
      updates.push(`longitude = $${values.length}`);
    }
    if (payload.polygonWkt !== undefined) {
      values.push(payload.polygonWkt);
      if (payload.polygonWkt) {
        updates.push(_hasPostGIS
          ? `polygon = ST_GeomFromText($${values.length}, 4326)`
          : `polygon = $${values.length}::jsonb`);
      } else {
        updates.push(`polygon = $${values.length}`);
      }
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }

    await checkPostGIS();
    values.push(id);
    const result = await dbPool.query(
      `UPDATE fields
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING *, ${polygonSelectBare()}`,
      values
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Field not found');
    }

    return mapField(result.rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await dbPool.query(
      `UPDATE fields
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Field not found');
    }
  }

  async getCropHistory(fieldId: string) {
    const result = await dbPool.query(
      `SELECT ch.*, c.name AS crop_name
       FROM crop_history ch
       LEFT JOIN crops c ON c.id = ch.crop_id
       WHERE ch.field_id = $1
       ORDER BY ch.start_date DESC`,
      [fieldId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      cropId: row.crop_id,
      crop: row.crop_name,
      startDate: row.start_date,
      endDate: row.end_date,
    }));
  }

  async changeCurrentCrop(fieldId: string, cropId: string, startDate: string, varietyId?: string | null) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE crop_history
         SET end_date = $1
         WHERE field_id = $2 AND end_date IS NULL`,
        [startDate, fieldId]
      );

      await client.query(
        `INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
         VALUES ($1, $2, NULL, $3, NULL, NULL)
         ON CONFLICT (field_id, crop_id, start_date) DO UPDATE SET
           end_date = NULL
         RETURNING id`,
        [fieldId, cropId, startDate]
      );

      await checkPostGIS();
      const updated = await client.query(
        `UPDATE fields
         SET current_crop_id = $1, variety_id = $3, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *, ${polygonSelectBare()}`,
        [cropId, fieldId, varietyId ?? null]
      );
      if (updated.rowCount === 0) {
        throw new NotFoundError('Field not found');
      }
      await client.query('COMMIT');
      return mapField(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addCropHistoryEntry(
    fieldId: string,
    cropId: string,
    startDate: string,
    endDate: string | null
  ) {
    await dbPool.query(
      `INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
       VALUES ($1, $2, NULL, $3, $4, NULL)
       ON CONFLICT (field_id, crop_id, start_date) DO UPDATE SET
         end_date = CASE
           WHEN crop_history.end_date IS NULL OR EXCLUDED.end_date IS NULL THEN NULL
           ELSE GREATEST(crop_history.end_date, EXCLUDED.end_date)
         END
       RETURNING id`,
      [fieldId, cropId, startDate, endDate]
    );
  }
}
