"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HarvestService = void 0;
const harvest_repository_1 = require("../repositories/harvest.repository");
const pagination_1 = require("../utils/pagination");
const client_1 = require("../db/client");
const phiAuditLog_service_1 = require("./phiAuditLog.service");
const harvestPlantingLink_1 = require("../utils/harvestPlantingLink");
const harvestBulkDuplicate_1 = require("../utils/harvestBulkDuplicate");
const seasons_service_1 = require("./seasons.service");
class HarvestService {
    constructor() {
        this.repository = new harvest_repository_1.HarvestRepository();
    }
    async list(params) {
        const { items, total } = await this.repository.list(params);
        const { page, limit } = (0, pagination_1.normalizePagination)(params);
        return { items, meta: (0, pagination_1.buildPaginationMeta)(total, page, limit) };
    }
    getById(id) {
        return this.repository.getById(id);
    }
    async create(payload) {
        await (0, seasons_service_1.assertFieldDateWritable)(payload.fieldId, payload.date);
        const totalQuantity = payload.totalQuantity ??
            payload.varieties.reduce((sum, v) => sum + v.quantity, 0);
        return this.repository.create({ ...payload, totalQuantity });
    }
    async update(id, payload) {
        const existing = await this.repository.getById(id);
        await (0, seasons_service_1.assertFieldDateWritable)(existing.fieldId, payload.date ?? existing.date);
        return this.repository.update(id, payload);
    }
    remove(id) {
        return this.repository.delete(id);
    }
    async getSummary(siteId) {
        const result = await client_1.dbPool.query(`SELECT f.name AS field_name,
              COALESCE(hc.name, ofc.name, prc.name, fc.name) AS crop_name,
              COALESCE(h.open_field_planting_id, h.planting_record_id)::text AS planting_id,
              COALESCE(ofp.seeding_date, pr.transplant_date, pr.seeding_date) AS cycle_start,
              ROUND(COALESCE(SUM(h.total_quantity), 0) / 1000.0, 3) AS yield_tons
       FROM fields f
       LEFT JOIN harvests h ON h.field_id = f.id
       LEFT JOIN crops hc ON hc.id = h.crop_id
       LEFT JOIN crops fc ON fc.id = f.current_crop_id
       LEFT JOIN open_field_planting ofp ON ofp.id = h.open_field_planting_id
       LEFT JOIN planting_records pr ON pr.id = h.planting_record_id
       LEFT JOIN crops ofc ON ofc.id = ofp.crop_id
       LEFT JOIN crops prc ON prc.id = pr.crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1 AND f.deleted_at IS NULL
       GROUP BY f.id, f.name,
                COALESCE(hc.name, ofc.name, prc.name, fc.name),
                COALESCE(h.open_field_planting_id, h.planting_record_id),
                COALESCE(ofp.seeding_date, pr.transplant_date, pr.seeding_date)
       ORDER BY f.name, cycle_start NULLS LAST`, [siteId]);
        return result.rows;
    }
    async getDailyWorksheet(siteId, startDate, endDate) {
        const params = [siteId];
        let dateFilter = '';
        if (startDate) {
            params.push(startDate);
            dateFilter += ` AND h.date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND h.date <= $${params.length}`;
        }
        const result = await client_1.dbPool.query(`SELECT h.date,
              COALESCE(hv.variety, c.name, 'Unknown') AS crop,
              SUM(hv.quantity) AS harvest_qty,
              EXTRACT(WEEK FROM h.date) AS week_no,
              EXTRACT(DAY FROM h.date) AS day,
              EXTRACT(MONTH FROM h.date) AS month,
              EXTRACT(YEAR FROM h.date) AS year
       FROM harvests h
       JOIN harvest_varieties hv ON hv.harvest_id = h.id
       JOIN fields f ON f.id = h.field_id
       LEFT JOIN crops c ON c.id = h.crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1 ${dateFilter}
       GROUP BY h.date, COALESCE(hv.variety, c.name, 'Unknown'),
                EXTRACT(WEEK FROM h.date), EXTRACT(DAY FROM h.date),
                EXTRACT(MONTH FROM h.date), EXTRACT(YEAR FROM h.date)
       ORDER BY h.date DESC, crop`, params);
        return result.rows;
    }
    async getWeeklySummary(siteId) {
        const weekResult = await client_1.dbPool.query(`SELECT COALESCE(c.name, fc.name, 'Unknown') AS crop,
              SUM(hv.quantity) AS total_quantity
       FROM harvests h
       JOIN harvest_varieties hv ON hv.harvest_id = h.id
       JOIN fields f ON f.id = h.field_id
       LEFT JOIN crops c ON c.id = h.crop_id
       LEFT JOIN crops fc ON fc.id = f.current_crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1
         AND EXTRACT(WEEK FROM h.date) = EXTRACT(WEEK FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM h.date) = EXTRACT(YEAR FROM CURRENT_DATE)
       GROUP BY COALESCE(c.name, fc.name, 'Unknown')
       ORDER BY total_quantity DESC`, [siteId]);
        const dayResult = await client_1.dbPool.query(`SELECT COALESCE(c.name, fc.name, 'Unknown') AS crop,
              SUM(hv.quantity) AS total_quantity
       FROM harvests h
       JOIN harvest_varieties hv ON hv.harvest_id = h.id
       JOIN fields f ON f.id = h.field_id
       LEFT JOIN crops c ON c.id = h.crop_id
       LEFT JOIN crops fc ON fc.id = f.current_crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1 AND h.date = CURRENT_DATE
       GROUP BY COALESCE(c.name, fc.name, 'Unknown')
       ORDER BY total_quantity DESC`, [siteId]);
        return { weekly: weekResult.rows, daily: dayResult.rows };
    }
    async bulkCreate(entries) {
        const client = await client_1.dbPool.connect();
        const errors = [];
        let inserted = 0;
        let skipped = 0;
        try {
            await client.query('BEGIN');
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                try {
                    const varietyName = e.varieties[0]?.variety || '';
                    await (0, seasons_service_1.assertFieldDateWritable)(e.fieldId, e.date, client);
                    const shiftKey = (0, harvestBulkDuplicate_1.harvestBulkShiftKey)(e.shiftNumber);
                    const timeKey = (0, harvestBulkDuplicate_1.harvestBulkTimeKey)(e.startTime);
                    const dupCheck = await client.query(`SELECT h.id FROM harvests h
             JOIN harvest_varieties hv ON hv.harvest_id = h.id
             WHERE h.field_id = $1 AND h.date = $2 AND LOWER(TRIM(hv.variety)) = LOWER(TRIM($3))
               AND LOWER(TRIM(COALESCE(h.shift_number, ''))) = $4
               AND (
                 $4 <> ''
                 OR COALESCE(to_char(h.start_time, 'HH24:MI'), '') = $5
               )
             LIMIT 1`, [e.fieldId, e.date, varietyName, shiftKey, timeKey]);
                    if (dupCheck.rows.length > 0) {
                        skipped++;
                        continue;
                    }
                    const totalQty = e.totalQuantity ?? e.varieties.reduce((s, v) => s + v.quantity, 0);
                    const plantingLink = await (0, harvestPlantingLink_1.resolveHarvestPlanting)({ fieldId: e.fieldId, harvestDate: e.date, segmentId: e.segmentId }, client);
                    const res = await client.query(`INSERT INTO harvests (field_id, date, total_quantity, start_time, end_time, shift_number, week_number, batch_number, segment_id, harvested_area_ha, packhouse, authorized_by, extra_data, open_field_planting_id, planting_record_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id`, [
                        e.fieldId, e.date, totalQty,
                        e.startTime || null, e.endTime || null, e.shiftNumber || null,
                        (e.weekNumber && String(e.weekNumber).trim()) || null,
                        e.batchNumber || null, e.segmentId || null,
                        e.harvestedAreaHa || null, e.packhouse || null, e.authorizedBy || null,
                        JSON.stringify(e.extraData || {}),
                        plantingLink.openFieldPlantingId,
                        plantingLink.plantingRecordId,
                    ]);
                    const harvestId = res.rows[0].id;
                    for (const v of e.varieties) {
                        await client.query(`INSERT INTO harvest_varieties (harvest_id, variety, quantity, grade) VALUES ($1, $2, $3, $4)`, [harvestId, v.variety, v.quantity, v.grade || null]);
                    }
                    inserted++;
                    (0, phiAuditLog_service_1.checkAndNotifyHarvestConflicts)(harvestId).catch(() => { });
                }
                catch (err) {
                    errors.push(`Row ${i + 1}: ${err.message}`);
                }
            }
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            errors.push(`Transaction failed: ${err.message}`);
        }
        finally {
            client.release();
        }
        return { inserted, skipped, errors };
    }
}
exports.HarvestService = HarvestService;
