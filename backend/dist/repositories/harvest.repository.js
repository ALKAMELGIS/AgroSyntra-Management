"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HarvestRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const harvestPlantingLink_1 = require("../utils/harvestPlantingLink");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
function mapHarvest(row) {
    return {
        id: row.id,
        fieldId: row.field_id,
        fieldName: row.field_name ?? undefined,
        date: row.date,
        totalQuantity: Number(row.total_quantity),
        notes: row.notes ?? undefined,
        startTime: row.start_time ?? undefined,
        endTime: row.end_time ?? undefined,
        shiftNumber: row.shift_number ?? undefined,
        weekNumber: row.week_number ?? undefined,
        batchNumber: row.batch_number ?? undefined,
        segmentId: row.segment_id ?? undefined,
        harvestedAreaHa: row.harvested_area_ha != null ? Number(row.harvested_area_ha) : undefined,
        packhouse: row.packhouse ?? undefined,
        authorizedBy: row.authorized_by ?? undefined,
        extraData: row.extra_data ?? {},
        cropName: row.crop_name ?? undefined,
        varietyName: row.variety_name ?? undefined,
        openFieldPlantingId: row.open_field_planting_id ?? undefined,
        plantingRecordId: row.planting_record_id ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapVariety(row) {
    return {
        id: row.id,
        harvestId: row.harvest_id,
        variety: row.variety,
        quantity: Number(row.quantity),
        grade: row.grade ?? undefined,
    };
}
class HarvestRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('harvests');
    }
    async list(params) {
        const { limit, offset } = (0, pagination_1.normalizePagination)(params);
        const values = [];
        const where = [];
        let siteJoinSql = ' LEFT JOIN fields f ON f.id = h.field_id';
        values.push(params.organizationId);
        where.push(`COALESCE(h.organization_id, f.organization_id) = $${values.length}`);
        if (params.siteId) {
            siteJoinSql += ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
            values.push(params.siteId);
            where.push(`fa.site_id = $${values.length}`);
        }
        if (params.fieldIds && params.fieldIds.length > 0) {
            const placeholders = params.fieldIds.map((id, i) => { values.push(id); return `$${values.length}`; });
            where.push(`h.field_id IN (${placeholders.join(', ')})`);
        }
        else if (params.fieldId) {
            values.push(params.fieldId);
            where.push(`h.field_id = $${values.length}`);
        }
        if (params.startDate) {
            values.push(params.startDate);
            where.push(`h.date >= $${values.length}`);
        }
        if (params.endDate) {
            values.push(params.endDate);
            where.push(`h.date <= $${values.length}`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const countJoinSql = siteJoinSql;
        const totalResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM harvests h${countJoinSql} ${whereSql}`, values);
        const total = Number(totalResult.rows[0].count);
        values.push(limit, offset);
        const result = await client_1.dbPool.query(`SELECT h.*,
              f.name AS field_name,
              (
                SELECT COALESCE(
                  (SELECT name FROM crops WHERE id = h.crop_id),
                  (SELECT c.name FROM open_field_planting ofp
                    JOIN crops c ON c.id = ofp.crop_id
                   WHERE ofp.id = h.open_field_planting_id),
                  (SELECT c.name FROM planting_records pr
                    JOIN crops c ON c.id = pr.crop_id
                   WHERE pr.id = h.planting_record_id),
                  (SELECT c.name FROM fields f2
                    JOIN crops c ON c.id = f2.current_crop_id
                   WHERE f2.id = h.field_id)
                )
              ) AS crop_name,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', hv.id,
                    'harvestId', hv.harvest_id,
                    'variety', hv.variety,
                    'quantity', hv.quantity,
                    'grade', hv.grade
                  )
                ) FILTER (WHERE hv.id IS NOT NULL),
                '[]'
              ) AS varieties
       FROM harvests h
       LEFT JOIN harvest_varieties hv ON hv.harvest_id = h.id
       ${siteJoinSql}
       ${whereSql}
       GROUP BY h.id, f.name
       ORDER BY h.date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        return {
            items: result.rows.map((row) => {
                const harvest = mapHarvest(row);
                harvest.varieties = (row.varieties || []).map(mapVariety);
                return harvest;
            }),
            total,
        };
    }
    async getById(id) {
        const harvestResult = await client_1.dbPool.query('SELECT * FROM harvests WHERE id = $1', [id]);
        if (harvestResult.rowCount === 0) {
            throw new errors_1.NotFoundError('Harvest not found');
        }
        const varietiesResult = await client_1.dbPool.query('SELECT * FROM harvest_varieties WHERE harvest_id = $1', [id]);
        const harvest = mapHarvest(harvestResult.rows[0]);
        harvest.varieties = varietiesResult.rows.map(mapVariety);
        return harvest;
    }
    async create(payload) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const plantingLink = await (0, harvestPlantingLink_1.resolveHarvestPlanting)({ fieldId: payload.fieldId, harvestDate: payload.date, segmentId: payload.segmentId }, client);
            const harvestResult = await client.query(`INSERT INTO harvests (field_id, date, total_quantity, notes, start_time, end_time, shift_number, week_number, batch_number, segment_id, harvested_area_ha, packhouse, authorized_by, extra_data, open_field_planting_id, planting_record_id, crop_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`, [
                payload.fieldId, payload.date, payload.totalQuantity, payload.notes ?? null,
                payload.startTime ?? null, payload.endTime ?? null, payload.shiftNumber ?? null,
                payload.weekNumber?.trim() || null,
                payload.batchNumber ?? null, payload.segmentId ?? null,
                payload.harvestedAreaHa ?? null, payload.packhouse ?? null, payload.authorizedBy ?? null,
                JSON.stringify(payload.extraData || {}),
                plantingLink.openFieldPlantingId,
                plantingLink.plantingRecordId,
                payload.cropId || null,
            ]);
            const harvest = mapHarvest(harvestResult.rows[0]);
            if (payload.varieties.length === 0) {
                throw new errors_1.AppError('Varieties are required', 'VALIDATION_ERROR', 400);
            }
            for (const v of payload.varieties) {
                const varietyResult = await client.query(`INSERT INTO harvest_varieties (harvest_id, variety, quantity, grade)
           VALUES ($1, $2, $3, $4)
           RETURNING *`, [harvest.id, v.variety, v.quantity, v.grade ?? null]);
                harvest.varieties = harvest.varieties || [];
                harvest.varieties.push(mapVariety(varietyResult.rows[0]));
            }
            await client.query('COMMIT');
            return harvest;
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
            if (payload.totalQuantity !== undefined) {
                values.push(payload.totalQuantity);
                updates.push(`total_quantity = $${values.length}`);
            }
            if (payload.notes !== undefined) {
                values.push(payload.notes);
                updates.push(`notes = $${values.length}`);
            }
            if (payload.startTime !== undefined) {
                values.push(payload.startTime);
                updates.push(`start_time = $${values.length}`);
            }
            if (payload.endTime !== undefined) {
                values.push(payload.endTime);
                updates.push(`end_time = $${values.length}`);
            }
            if (payload.shiftNumber !== undefined) {
                values.push(payload.shiftNumber);
                updates.push(`shift_number = $${values.length}`);
            }
            if (payload.weekNumber !== undefined) {
                const week = String(payload.weekNumber).trim();
                values.push(week || null);
                updates.push(`week_number = $${values.length}`);
            }
            if (payload.batchNumber !== undefined) {
                values.push(payload.batchNumber);
                updates.push(`batch_number = $${values.length}`);
            }
            if (payload.segmentId !== undefined) {
                values.push(payload.segmentId);
                updates.push(`segment_id = $${values.length}`);
            }
            if (payload.harvestedAreaHa !== undefined) {
                values.push(payload.harvestedAreaHa);
                updates.push(`harvested_area_ha = $${values.length}`);
            }
            if (payload.packhouse !== undefined) {
                values.push(payload.packhouse);
                updates.push(`packhouse = $${values.length}`);
            }
            if (payload.authorizedBy !== undefined) {
                values.push(payload.authorizedBy);
                updates.push(`authorized_by = $${values.length}`);
            }
            const existing = await client.query('SELECT * FROM harvests WHERE id = $1', [id]);
            if (existing.rowCount === 0) {
                throw new errors_1.NotFoundError('Harvest not found');
            }
            const current = existing.rows[0];
            const nextDate = payload.date !== undefined ? payload.date : current.date;
            const nextSegment = payload.segmentId !== undefined ? payload.segmentId : current.segment_id;
            const plantingLink = await (0, harvestPlantingLink_1.resolveHarvestPlanting)({ fieldId: current.field_id, harvestDate: nextDate, segmentId: nextSegment }, client);
            values.push(plantingLink.openFieldPlantingId);
            updates.push(`open_field_planting_id = $${values.length}`);
            values.push(plantingLink.plantingRecordId);
            updates.push(`planting_record_id = $${values.length}`);
            if (updates.length === 0 && payload.varieties === undefined) {
                throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
            }
            let harvestRow;
            if (updates.length > 0) {
                values.push(id);
                const result = await client.query(`UPDATE harvests
           SET ${updates.join(', ')}, updated_at = NOW()
           WHERE id = $${values.length}
           RETURNING *`, values);
                if (result.rowCount === 0) {
                    throw new errors_1.NotFoundError('Harvest not found');
                }
                harvestRow = result.rows[0];
            }
            else {
                const result = await client.query('SELECT * FROM harvests WHERE id = $1', [id]);
                if (result.rowCount === 0) {
                    throw new errors_1.NotFoundError('Harvest not found');
                }
                harvestRow = result.rows[0];
            }
            if (payload.varieties) {
                await client.query('DELETE FROM harvest_varieties WHERE harvest_id = $1', [id]);
                if (payload.varieties.length === 0) {
                    throw new errors_1.AppError('Varieties are required', 'VALIDATION_ERROR', 400);
                }
                for (const v of payload.varieties) {
                    await client.query(`INSERT INTO harvest_varieties (harvest_id, variety, quantity, grade)
             VALUES ($1, $2, $3, $4)`, [id, v.variety, v.quantity, v.grade ?? null]);
                }
            }
            await client.query('COMMIT');
            const varietiesResult = await client_1.dbPool.query('SELECT * FROM harvest_varieties WHERE harvest_id = $1', [id]);
            const harvest = mapHarvest(harvestRow);
            harvest.varieties = varietiesResult.rows.map(mapVariety);
            return harvest;
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
        const result = await client_1.dbPool.query('DELETE FROM harvests WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Harvest not found');
        }
    }
}
exports.HarvestRepository = HarvestRepository;
