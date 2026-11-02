"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
function mapSite(row) {
    return {
        id: row.id,
        countryId: row.country_id,
        name: row.name,
        location: row.location ?? undefined,
        totalArea: row.total_area ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? undefined,
    };
}
class SiteRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('sites');
    }
    async list(params) {
        const { page, limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = ['deleted_at IS NULL'];
        if (params.organizationId) {
            values.push(params.organizationId);
            where.push(`organization_id = $${values.length}`);
        }
        if (params.countryId) {
            values.push(params.countryId);
            where.push(`country_id = $${values.length}`);
        }
        if (params.siteIds?.length) {
            values.push(params.siteIds);
            where.push(`id = ANY($${values.length}::uuid[])`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM sites ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT * FROM sites
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return { items: result.rows.map(mapSite), total };
    }
    async getById(id) {
        const result = await client_1.dbPool.query('SELECT * FROM sites WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Site not found');
        }
        return mapSite(result.rows[0]);
    }
    async create(payload) {
        const result = await client_1.dbPool.query(`INSERT INTO sites (country_id, name, location, total_area, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [payload.countryId, payload.name, payload.location ?? null, payload.totalArea ?? null, payload.organizationId]);
        return mapSite(result.rows[0]);
    }
    async update(id, payload) {
        const updates = [];
        const values = [];
        if (payload.name !== undefined) {
            values.push(payload.name);
            updates.push(`name = $${values.length}`);
        }
        if (payload.location !== undefined) {
            values.push(payload.location);
            updates.push(`location = $${values.length}`);
        }
        if (payload.totalArea !== undefined) {
            values.push(payload.totalArea);
            updates.push(`total_area = $${values.length}`);
        }
        if (payload.countryId !== undefined) {
            values.push(payload.countryId);
            updates.push(`country_id = $${values.length}`);
        }
        if (updates.length === 0) {
            throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE sites
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Site not found');
        }
        return mapSite(result.rows[0]);
    }
    async softDelete(id) {
        const result = await client_1.dbPool.query(`UPDATE sites
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Site not found');
        }
    }
    /** Get distinct country IDs that have at least one of the given site IDs */
    async getCountryIdsForSiteIds(siteIds) {
        if (siteIds.length === 0)
            return [];
        const result = await client_1.dbPool.query('SELECT DISTINCT country_id FROM sites WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [siteIds]);
        return result.rows.map((r) => r.country_id);
    }
}
exports.SiteRepository = SiteRepository;
