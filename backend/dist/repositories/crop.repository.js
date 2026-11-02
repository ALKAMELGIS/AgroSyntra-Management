"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CropRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const queryBuilder_1 = require("../utils/queryBuilder");
const base_repository_1 = require("./base.repository");
function mapCrop(row) {
    return {
        id: row.id,
        name: row.name,
        dripperCount: row.dripper_count ?? undefined,
        dripTestCount: row.drip_test_count ?? undefined,
        plantCount: row.plant_count ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class CropRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('crops');
    }
    async list(params) {
        const { page, limit, offset } = (0, pagination_1.normalizePagination)(params);
        const totalResult = await client_1.dbPool.query('SELECT COUNT(*) FROM crops');
        const total = Number(totalResult.rows[0].count);
        const result = await client_1.dbPool.query(`SELECT * FROM crops
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`, [limit, offset]);
        return { items: result.rows.map(mapCrop), total };
    }
    async getById(id) {
        const result = await client_1.dbPool.query('SELECT * FROM crops WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Crop not found');
        }
        return mapCrop(result.rows[0]);
    }
    async create(payload) {
        const result = await client_1.dbPool.query(`INSERT INTO crops (name, dripper_count, drip_test_count, plant_count)
       VALUES ($1, $2, $3, $4)
       RETURNING *`, [payload.name, payload.dripperCount ?? null, payload.dripTestCount ?? null, payload.plantCount ?? null]);
        return mapCrop(result.rows[0]);
    }
    async update(id, payload) {
        const { sql, values } = (0, queryBuilder_1.buildUpdateQuery)('crops', {
            name: 'name',
            dripperCount: 'dripper_count',
            dripTestCount: 'drip_test_count',
            plantCount: 'plant_count',
        }, payload, id);
        const result = await client_1.dbPool.query(sql, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Crop not found');
        }
        return mapCrop(result.rows[0]);
    }
    async delete(id) {
        const result = await client_1.dbPool.query('DELETE FROM crops WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Crop not found');
        }
    }
    // ── Variety methods ─────────────────────────────────────────────
    mapVariety(row) {
        return {
            id: row.id,
            cropId: row.crop_id,
            name: row.name,
            isActive: row.is_active,
            breederId: row.breeder_id || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async listVarieties(cropId) {
        const result = await client_1.dbPool.query('SELECT * FROM crop_varieties WHERE crop_id = $1 ORDER BY name ASC', [cropId]);
        return result.rows.map((r) => this.mapVariety(r));
    }
    async createVariety(cropId, name, breederId) {
        const result = await client_1.dbPool.query(`INSERT INTO crop_varieties (crop_id, name, breeder_id) VALUES ($1, $2, $3) RETURNING *`, [cropId, name, breederId || null]);
        return this.mapVariety(result.rows[0]);
    }
    async updateVariety(id, payload) {
        const updates = [];
        const values = [];
        if (payload.name !== undefined) {
            values.push(payload.name);
            updates.push(`name = $${values.length}`);
        }
        if (payload.isActive !== undefined) {
            values.push(payload.isActive);
            updates.push(`is_active = $${values.length}`);
        }
        if (updates.length === 0) {
            throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE crop_varieties SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Variety not found');
        }
        return this.mapVariety(result.rows[0]);
    }
    async deleteVariety(id) {
        const result = await client_1.dbPool.query('DELETE FROM crop_varieties WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Variety not found');
        }
    }
}
exports.CropRepository = CropRepository;
