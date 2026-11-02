"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FertigationRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
function cropNameSql(alias) {
    return `(
    SELECT COALESCE(
      (SELECT name FROM crops WHERE id = ${alias}.crop_id),
      (SELECT c.name FROM crop_history ch
         JOIN crops c ON c.id = ch.crop_id
        WHERE ch.field_id = ${alias}.field_id
          AND ch.start_date <= ${alias}.date
          AND (ch.end_date IS NULL OR ch.end_date >= ${alias}.date)
        ORDER BY ch.start_date DESC
        LIMIT 1),
      (SELECT c.name FROM planting_records pr
         JOIN crops c ON c.id = pr.crop_id
        WHERE pr.field_id = ${alias}.field_id
          AND COALESCE(pr.transplant_date, pr.seeding_date) <= ${alias}.date
          AND (pr.uprooted_at IS NULL OR pr.uprooted_at >= ${alias}.date)
        ORDER BY COALESCE(pr.transplant_date, pr.seeding_date) DESC
        LIMIT 1),
      (SELECT c.name FROM open_field_planting ofp
         JOIN crops c ON c.id = ofp.crop_id
        WHERE ofp.field_id = ${alias}.field_id
          AND ofp.seeding_date <= ${alias}.date
          AND (ofp.uprooted_at IS NULL OR ofp.uprooted_at >= ${alias}.date)
        ORDER BY ofp.seeding_date DESC
        LIMIT 1),
      (SELECT c.name FROM fields f2
         JOIN crops c ON c.id = f2.current_crop_id
        WHERE f2.id = ${alias}.field_id)
    )
  )`;
}
function mapEntry(row) {
    const cropName = row.crop_name ?? undefined;
    return {
        id: row.id,
        fieldId: row.field_id,
        recipeId: row.recipe_id ?? undefined,
        recipeName: row.recipe_name ?? undefined,
        cropId: row.crop_id ?? undefined,
        cropName,
        crop: cropName,
        date: row.date,
        weekNumber: row.week_number ?? undefined,
        flowRate: row.flow_rate ?? undefined,
        frequency: row.frequency ?? undefined,
        valvesCount: row.valves_count ?? undefined,
        dailyWater: row.daily_water ?? undefined,
        fertilizers: row.fertilizers ?? undefined,
        totalFertilizer: row.total_fertilizer ?? undefined,
        cumulative: row.cumulative ?? undefined,
        workerId: row.worker_id ?? undefined,
        operatorName: row.operator_name ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class FertigationRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('fertigation_entries');
    }
    async list(params) {
        const { limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = [];
        let joinSql = ' LEFT JOIN fields f ON f.id = fertigation_entries.field_id';
        joinSql += ' LEFT JOIN workers w ON w.id = fertigation_entries.worker_id';
        joinSql += ' LEFT JOIN recipes r ON r.id = fertigation_entries.recipe_id';
        values.push(params.organizationId);
        where.push(`COALESCE(fertigation_entries.organization_id, f.organization_id) = $${values.length}`);
        if (params.siteId) {
            joinSql += ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
            values.push(params.siteId);
            where.push(`fa.site_id = $${values.length}`);
        }
        if (params.fieldId) {
            values.push(params.fieldId);
            where.push(`fertigation_entries.field_id = $${values.length}`);
        }
        if (params.startDate) {
            values.push(params.startDate);
            where.push(`fertigation_entries.date >= $${values.length}`);
        }
        if (params.endDate) {
            values.push(params.endDate);
            where.push(`fertigation_entries.date <= $${values.length}`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM fertigation_entries${joinSql} ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT fertigation_entries.*, w.name AS operator_name, r.name AS recipe_name,
              ${cropNameSql('fertigation_entries')} AS crop_name
       FROM fertigation_entries${joinSql}
       ${whereSql}
       ORDER BY fertigation_entries.date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return { items: result.rows.map(mapEntry), total };
    }
    async getById(id) {
        const result = await client_1.dbPool.query(`SELECT fe.*, w.name AS operator_name, r.name AS recipe_name,
              ${cropNameSql('fe')} AS crop_name
       FROM fertigation_entries fe
       LEFT JOIN workers w ON w.id = fe.worker_id
       LEFT JOIN recipes r ON r.id = fe.recipe_id
       WHERE fe.id = $1`, [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Fertigation entry not found');
        }
        return mapEntry(result.rows[0]);
    }
    async create(payload) {
        const result = await client_1.dbPool.query(`INSERT INTO fertigation_entries (
        field_id, recipe_id, crop_id, date, week_number, flow_rate,
        frequency, valves_count, daily_water, fertilizers,
        total_fertilizer, cumulative, worker_id
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`, [
            payload.fieldId,
            payload.recipeId ?? null,
            payload.cropId ?? null,
            payload.date,
            payload.weekNumber ?? null,
            payload.flowRate ?? null,
            payload.frequency ?? null,
            payload.valvesCount ?? null,
            payload.dailyWater ?? null,
            payload.fertilizers ?? null,
            payload.totalFertilizer ?? null,
            payload.cumulative ?? null,
            payload.workerId ?? null,
        ]);
        return this.getById(result.rows[0].id);
    }
    async findIdByFieldAndDate(fieldId, date) {
        const result = await client_1.dbPool.query(`SELECT id FROM fertigation_entries WHERE field_id = $1 AND date = $2 LIMIT 1`, [fieldId, date]);
        return result.rows[0]?.id ? String(result.rows[0].id) : null;
    }
    async update(id, payload) {
        const updates = [];
        const values = [];
        if (payload.recipeId !== undefined) {
            values.push(payload.recipeId);
            updates.push(`recipe_id = $${values.length}`);
        }
        if (payload.cropId !== undefined) {
            values.push(payload.cropId);
            updates.push(`crop_id = $${values.length}`);
        }
        if (payload.date !== undefined) {
            values.push(payload.date);
            updates.push(`date = $${values.length}`);
        }
        if (payload.weekNumber !== undefined) {
            values.push(payload.weekNumber);
            updates.push(`week_number = $${values.length}`);
        }
        if (payload.flowRate !== undefined) {
            values.push(payload.flowRate);
            updates.push(`flow_rate = $${values.length}`);
        }
        if (payload.frequency !== undefined) {
            values.push(payload.frequency);
            updates.push(`frequency = $${values.length}`);
        }
        if (payload.valvesCount !== undefined) {
            values.push(payload.valvesCount);
            updates.push(`valves_count = $${values.length}`);
        }
        if (payload.dailyWater !== undefined) {
            values.push(payload.dailyWater);
            updates.push(`daily_water = $${values.length}`);
        }
        if (payload.fertilizers !== undefined) {
            values.push(payload.fertilizers);
            updates.push(`fertilizers = $${values.length}`);
        }
        if (payload.totalFertilizer !== undefined) {
            values.push(payload.totalFertilizer);
            updates.push(`total_fertilizer = $${values.length}`);
        }
        if (payload.cumulative !== undefined) {
            values.push(payload.cumulative);
            updates.push(`cumulative = $${values.length}`);
        }
        if (payload.workerId !== undefined) {
            values.push(payload.workerId);
            updates.push(`worker_id = $${values.length}`);
        }
        if (updates.length === 0) {
            throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE fertigation_entries
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Fertigation entry not found');
        }
        return this.getById(result.rows[0].id);
    }
    async delete(id) {
        const result = await client_1.dbPool.query('DELETE FROM fertigation_entries WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Fertigation entry not found');
        }
    }
}
exports.FertigationRepository = FertigationRepository;
