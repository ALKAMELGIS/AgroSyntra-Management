"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldTypeRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
function mapFieldType(row) {
    return {
        id: row.id,
        name: row.name,
        namingPattern: row.naming_pattern ?? undefined,
        defaultValveCount: row.default_valve_count ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class FieldTypeRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('field_types');
    }
    async list(params) {
        const { page, limit, offset } = (0, pagination_1.normalizePagination)(params);
        const totalResult = await client_1.dbPool.query('SELECT COUNT(*) FROM field_types');
        const total = Number(totalResult.rows[0].count);
        const result = await client_1.dbPool.query(`SELECT * FROM field_types
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`, [limit, offset]);
        return { items: result.rows.map(mapFieldType), total };
    }
    async getById(id) {
        const result = await client_1.dbPool.query('SELECT * FROM field_types WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field type not found');
        }
        return mapFieldType(result.rows[0]);
    }
    async create(payload) {
        const result = await client_1.dbPool.query(`INSERT INTO field_types (name, naming_pattern, default_valve_count)
       VALUES ($1, $2, $3)
       RETURNING *`, [payload.name, payload.namingPattern ?? null, payload.defaultValveCount ?? 0]);
        return mapFieldType(result.rows[0]);
    }
    async update(id, payload) {
        const updates = [];
        const values = [];
        if (payload.name !== undefined) {
            values.push(payload.name);
            updates.push(`name = $${values.length}`);
        }
        if (payload.namingPattern !== undefined) {
            values.push(payload.namingPattern);
            updates.push(`naming_pattern = $${values.length}`);
        }
        if (payload.defaultValveCount !== undefined) {
            values.push(payload.defaultValveCount);
            updates.push(`default_valve_count = $${values.length}`);
        }
        if (updates.length === 0) {
            throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE field_types
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field type not found');
        }
        return mapFieldType(result.rows[0]);
    }
    async delete(id) {
        const result = await client_1.dbPool.query('DELETE FROM field_types WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Field type not found');
        }
    }
}
exports.FieldTypeRepository = FieldTypeRepository;
