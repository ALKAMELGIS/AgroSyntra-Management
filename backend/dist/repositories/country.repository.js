"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const queryBuilder_1 = require("../utils/queryBuilder");
const base_repository_1 = require("./base.repository");
function mapCountry(row) {
    return {
        id: row.id,
        name: row.name,
        code: row.code,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? undefined,
    };
}
class CountryRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('countries');
    }
    async list(params) {
        const { page, limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = ['deleted_at IS NULL'];
        if (params.organizationId) {
            values.push(params.organizationId);
            where.push(`organization_id = $${values.length}`);
        }
        if (params.countryIds?.length) {
            values.push(params.countryIds);
            where.push(`id = ANY($${values.length}::uuid[])`);
        }
        const whereSql = `WHERE ${where.join(' AND ')}`;
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM countries ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT * FROM countries
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return {
            items: result.rows.map(mapCountry),
            total,
        };
    }
    async getById(id) {
        const result = await client_1.dbPool.query('SELECT * FROM countries WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Country not found');
        }
        return mapCountry(result.rows[0]);
    }
    async create(payload, organizationId) {
        const result = await client_1.dbPool.query(`INSERT INTO countries (name, code, organization_id)
       VALUES ($1, $2, $3)
       RETURNING *`, [payload.name, payload.code, organizationId]);
        return mapCountry(result.rows[0]);
    }
    async update(id, payload) {
        const { sql, values } = (0, queryBuilder_1.buildUpdateQuery)('countries', { name: 'name', code: 'code' }, payload, id, { softDelete: true });
        const result = await client_1.dbPool.query(sql, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Country not found');
        }
        return mapCountry(result.rows[0]);
    }
    async softDelete(id) {
        const result = await client_1.dbPool.query(`UPDATE countries
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Country not found');
        }
    }
}
exports.CountryRepository = CountryRepository;
