"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
// Cached PostGIS / crop_varieties availability flags
let _hasPostGIS = null;
let _hasCropVarieties = null;
async function checkPostGIS() {
    if (_hasPostGIS !== null)
        return _hasPostGIS;
    try {
        await client_1.dbPool.query(`SELECT PostGIS_Version()`);
        _hasPostGIS = true;
    }
    catch {
        _hasPostGIS = false;
    }
    return _hasPostGIS;
}
async function checkCropVarieties() {
    if (_hasCropVarieties !== null)
        return _hasCropVarieties;
    try {
        await client_1.dbPool.query(`SELECT 1 FROM crop_varieties LIMIT 0`);
        _hasCropVarieties = true;
    }
    catch {
        _hasCropVarieties = false;
    }
    return _hasCropVarieties;
}
function polygonSelect(alias = 'f') {
    return _hasPostGIS
        ? `ST_AsGeoJSON(${alias}.polygon) AS polygon_geojson`
        : `${alias}.polygon AS polygon_geojson`;
}
function polygonSelectBare() {
    return _hasPostGIS
        ? `ST_AsGeoJSON(polygon) AS polygon_geojson`
        : `polygon AS polygon_geojson`;
}
function parsePolygon(raw) {
    if (!raw)
        return undefined;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    if (typeof raw === 'object' && raw.type)
        return raw;
    return undefined;
}
function mapField(row) {
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
class FieldRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('fields');
    }
    async list(params) {
        await checkPostGIS();
        await checkCropVarieties();
        const { page, limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = ['deleted_at IS NULL'];
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
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM fields f ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        const varietyJoin = _hasCropVarieties ? 'LEFT JOIN crop_varieties cv ON cv.id = f.variety_id' : '';
        const varietyCol = _hasCropVarieties ? ', cv.name AS variety_name' : '';
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT f.*, ${polygonSelect()}${varietyCol}, c.name AS crop_name
       FROM fields f
       LEFT JOIN crops c ON c.id = f.current_crop_id
       ${varietyJoin}
       ${whereSql}
       ORDER BY f.name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return { items: result.rows.map(mapField), total };
    }
    async getById(id) {
        await checkPostGIS();
        await checkCropVarieties();
        const varietyJoin = _hasCropVarieties ? 'LEFT JOIN crop_varieties cv ON cv.id = f.variety_id' : '';
        const varietyCol = _hasCropVarieties ? ', cv.name AS variety_name' : '';
        const result = await client_1.dbPool.query(`SELECT f.*, ${polygonSelect()}, c.name AS crop_name${varietyCol}
       FROM fields f
       LEFT JOIN crops c ON c.id = f.current_crop_id
       ${varietyJoin}
       WHERE f.id = $1 AND f.deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field not found');
        }
        return mapField(result.rows[0]);
    }
    async getLocation(id) {
        const result = await client_1.dbPool.query(`SELECT latitude, longitude FROM fields
       WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field not found');
        }
        const { latitude, longitude } = result.rows[0];
        if (latitude === null || longitude === null) {
            throw new errors_1.AppError('Field location not set', 'VALIDATION_ERROR', 400);
        }
        return { latitude: Number(latitude), longitude: Number(longitude) };
    }
    async getPolygon(id) {
        await checkPostGIS();
        const result = await client_1.dbPool.query(`SELECT ${polygonSelectBare()}
       FROM fields WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field not found');
        }
        const raw = result.rows[0].polygon_geojson;
        if (!raw) {
            throw new errors_1.AppError('Field polygon not set', 'VALIDATION_ERROR', 400);
        }
        const geojson = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!geojson?.coordinates?.[0]) {
            throw new errors_1.AppError('Invalid field polygon', 'VALIDATION_ERROR', 400);
        }
        return geojson.coordinates[0].map((coord) => [coord[1], coord[0]]);
    }
    async create(payload) {
        await checkPostGIS();
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const polygonExpr = payload.polygonWkt
                ? (_hasPostGIS ? 'ST_GeomFromText($10, 4326)' : '$10::jsonb')
                : '$10';
            const result = await client.query(`INSERT INTO fields (
        farm_area_id, field_type_id, name, current_crop_id, valve_count,
        area, latitude, longitude, variety_id, polygon, organization_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${polygonExpr}, $11)
       RETURNING *, ${polygonSelectBare()}`, [
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
            ]);
            const field = mapField(result.rows[0]);
            if (payload.currentCropId) {
                await client.query(`INSERT INTO crop_history (field_id, crop_id, start_date, end_date)
           VALUES ($1, $2, NOW()::date, NULL)`, [field.id, payload.currentCropId]);
            }
            await client.query('COMMIT');
            return field;
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
        const updates = [];
        const values = [];
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
            }
            else {
                updates.push(`polygon = $${values.length}`);
            }
        }
        if (updates.length === 0) {
            throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
        }
        await checkPostGIS();
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE fields
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING *, ${polygonSelectBare()}`, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field not found');
        }
        return mapField(result.rows[0]);
    }
    async softDelete(id) {
        const result = await client_1.dbPool.query(`UPDATE fields
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field not found');
        }
    }
    async getCropHistory(fieldId) {
        const result = await client_1.dbPool.query(`SELECT ch.*, c.name AS crop_name
       FROM crop_history ch
       LEFT JOIN crops c ON c.id = ch.crop_id
       WHERE ch.field_id = $1
       ORDER BY ch.start_date DESC`, [fieldId]);
        return result.rows.map((row) => ({
            id: row.id,
            cropId: row.crop_id,
            crop: row.crop_name,
            startDate: row.start_date,
            endDate: row.end_date,
        }));
    }
    async changeCurrentCrop(fieldId, cropId, startDate, varietyId) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE crop_history
         SET end_date = $1
         WHERE field_id = $2 AND end_date IS NULL`, [startDate, fieldId]);
            await client.query(`INSERT INTO crop_history (field_id, crop_id, start_date, end_date)
         VALUES ($1, $2, $3, NULL)`, [fieldId, cropId, startDate]);
            await checkPostGIS();
            const updated = await client.query(`UPDATE fields
         SET current_crop_id = $1, variety_id = $3, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *, ${polygonSelectBare()}`, [cropId, fieldId, varietyId ?? null]);
            if (updated.rowCount === 0) {
                throw new errors_1.NotFoundError('Field not found');
            }
            await client.query('COMMIT');
            return mapField(updated.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async addCropHistoryEntry(fieldId, cropId, startDate, endDate) {
        await client_1.dbPool.query(`INSERT INTO crop_history (field_id, crop_id, start_date, end_date)
       VALUES ($1, $2, $3, $4)`, [fieldId, cropId, startDate, endDate]);
    }
}
exports.FieldRepository = FieldRepository;
