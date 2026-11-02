"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSheets = listSheets;
exports.createSheet = createSheet;
exports.listRecords = listRecords;
exports.listRecordsForSite = listRecordsForSite;
exports.createRecord = createRecord;
exports.updateRecord = updateRecord;
exports.deleteRecord = deleteRecord;
exports.getSummary = getSummary;
exports.getSheetById = getSheetById;
exports.assertSheetAccess = assertSheetAccess;
exports.bulkImport = bulkImport;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const seasons_service_1 = require("./seasons.service");
const SUMMARY_MULTIPLIER = 220;
function computeVolume(flowRate, cycleDuration) {
    if (flowRate == null || cycleDuration == null)
        return null;
    const v = Number(flowRate) * Number(cycleDuration);
    return Number.isFinite(v) ? v : null;
}
function mapSheet(row) {
    return {
        id: row.id,
        siteId: row.site_id,
        year: Number(row.year),
        month: Number(row.month),
        farmName: row.farm_name ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapRecord(row) {
    return {
        id: row.id,
        monthSheetId: row.month_sheet_id,
        fieldId: row.field_id,
        fieldName: row.field_name ?? undefined,
        date: row.date,
        segmentId: row.segment_id ?? undefined,
        areaHa: row.area_ha != null ? Number(row.area_ha) : undefined,
        crop: row.crop ?? undefined,
        flowRateM3Hr: row.flow_rate_m3_hr != null ? Number(row.flow_rate_m3_hr) : undefined,
        cycleDurationHr: row.cycle_duration_hr != null ? Number(row.cycle_duration_hr) : undefined,
        volumeM3: row.volume_m3 != null ? Number(row.volume_m3) : undefined,
        authorizedBy: row.authorized_by ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
async function listSheets(siteId, year) {
    const result = await client_1.dbPool.query(`SELECT * FROM irrigation_month_sheets
     WHERE site_id = $1 AND year = $2
     ORDER BY month ASC`, [siteId, year]);
    return result.rows.map(mapSheet);
}
async function createSheet(siteId, year, month, farmName) {
    const result = await client_1.dbPool.query(`INSERT INTO irrigation_month_sheets (site_id, year, month, farm_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (site_id, year, month)
     DO UPDATE SET farm_name = COALESCE(EXCLUDED.farm_name, irrigation_month_sheets.farm_name),
                   updated_at = NOW()
     RETURNING *`, [siteId, year, month, farmName ?? null]);
    return mapSheet(result.rows[0]);
}
async function listRecords(monthSheetId) {
    const result = await client_1.dbPool.query(`SELECT r.*, f.name AS field_name
     FROM irrigation_records r
     JOIN fields f ON f.id = r.field_id
     WHERE r.month_sheet_id = $1
     ORDER BY r.date ASC, f.name ASC`, [monthSheetId]);
    return result.rows.map(mapRecord);
}
/** All pivot irrigation records for a site (RC-133), with optional field/date filters. */
async function listRecordsForSite(params) {
    const values = [params.siteId];
    const clauses = ['s.site_id = $1'];
    if (params.fieldId) {
        values.push(params.fieldId);
        clauses.push(`r.field_id = $${values.length}`);
    }
    if (params.startDate) {
        values.push(params.startDate);
        clauses.push(`r.date >= $${values.length}`);
    }
    if (params.endDate) {
        values.push(params.endDate);
        clauses.push(`r.date <= $${values.length}`);
    }
    const result = await client_1.dbPool.query(`SELECT r.*, f.name AS field_name
     FROM irrigation_records r
     JOIN irrigation_month_sheets s ON s.id = r.month_sheet_id
     JOIN fields f ON f.id = r.field_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY r.date ASC, f.name ASC`, values);
    return result.rows.map(mapRecord);
}
async function createRecord(payload) {
    await (0, seasons_service_1.assertFieldDateWritable)(payload.fieldId, payload.date);
    const volume = computeVolume(payload.flowRateM3Hr, payload.cycleDurationHr);
    const result = await client_1.dbPool.query(`INSERT INTO irrigation_records (
       month_sheet_id, field_id, date, segment_id, area_ha, crop,
       flow_rate_m3_hr, cycle_duration_hr, volume_m3, authorized_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`, [
        payload.monthSheetId,
        payload.fieldId,
        payload.date,
        payload.segmentId ?? null,
        payload.areaHa ?? null,
        payload.crop ?? null,
        payload.flowRateM3Hr ?? null,
        payload.cycleDurationHr ?? null,
        volume,
        payload.authorizedBy ?? null,
    ]);
    const row = result.rows[0];
    const fieldResult = await client_1.dbPool.query('SELECT name FROM fields WHERE id = $1', [payload.fieldId]);
    row.field_name = fieldResult.rows[0]?.name;
    return mapRecord(row);
}
async function updateRecord(id, payload) {
    const existing = await client_1.dbPool.query('SELECT * FROM irrigation_records WHERE id = $1', [id]);
    if (existing.rowCount === 0)
        throw new errors_1.NotFoundError('Irrigation record not found');
    const cur = existing.rows[0];
    await (0, seasons_service_1.assertFieldDateWritable)(payload.fieldId ?? cur.field_id, payload.date ?? cur.date);
    const flowRate = payload.flowRateM3Hr ?? cur.flow_rate_m3_hr;
    const cycleDuration = payload.cycleDurationHr ?? cur.cycle_duration_hr;
    const volume = computeVolume(flowRate, cycleDuration);
    const result = await client_1.dbPool.query(`UPDATE irrigation_records SET
       field_id = COALESCE($2, field_id),
       date = COALESCE($3, date),
       segment_id = COALESCE($4, segment_id),
       area_ha = COALESCE($5, area_ha),
       crop = COALESCE($6, crop),
       flow_rate_m3_hr = COALESCE($7, flow_rate_m3_hr),
       cycle_duration_hr = COALESCE($8, cycle_duration_hr),
       volume_m3 = $9,
       authorized_by = COALESCE($10, authorized_by),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`, [
        id,
        payload.fieldId ?? null,
        payload.date ?? null,
        payload.segmentId ?? null,
        payload.areaHa ?? null,
        payload.crop ?? null,
        payload.flowRateM3Hr ?? null,
        payload.cycleDurationHr ?? null,
        volume,
        payload.authorizedBy ?? null,
    ]);
    const fieldResult = await client_1.dbPool.query('SELECT name FROM fields WHERE id = $1', [result.rows[0].field_id]);
    result.rows[0].field_name = fieldResult.rows[0]?.name;
    return mapRecord(result.rows[0]);
}
async function deleteRecord(id) {
    const result = await client_1.dbPool.query('DELETE FROM irrigation_records WHERE id = $1', [id]);
    if (result.rowCount === 0)
        throw new errors_1.NotFoundError('Irrigation record not found');
}
async function getSummary(siteId, year) {
    const fieldsResult = await client_1.dbPool.query(`SELECT f.id, f.name
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN field_types ft ON ft.id = f.field_type_id
     WHERE fa.site_id = $1
       AND LOWER(ft.name) = 'pivot'
       AND f.deleted_at IS NULL
     ORDER BY f.name ASC`, [siteId]);
    const aggResult = await client_1.dbPool.query(`SELECT r.field_id, s.month, COALESCE(SUM(r.volume_m3), 0) AS volume_m3
     FROM irrigation_records r
     JOIN irrigation_month_sheets s ON s.id = r.month_sheet_id
     JOIN fields f ON f.id = r.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN field_types ft ON ft.id = f.field_type_id
     WHERE fa.site_id = $1
       AND s.year = $2
       AND LOWER(ft.name) = 'pivot'
     GROUP BY r.field_id, s.month`, [siteId, year]);
    const fieldMap = new Map();
    for (const row of fieldsResult.rows) {
        fieldMap.set(row.id, row.name);
    }
    const cells = aggResult.rows.map((row) => {
        const volumeM3 = Number(row.volume_m3);
        return {
            fieldId: row.field_id,
            fieldName: fieldMap.get(row.field_id) ?? '',
            month: Number(row.month),
            volumeM3,
            displayValue: volumeM3 * SUMMARY_MULTIPLIER,
        };
    });
    return {
        fields: fieldsResult.rows.map((r) => ({ id: r.id, name: r.name })),
        cells,
    };
}
async function getSheetById(id) {
    const result = await client_1.dbPool.query('SELECT * FROM irrigation_month_sheets WHERE id = $1', [id]);
    if (result.rowCount === 0)
        throw new errors_1.NotFoundError('Month sheet not found');
    return mapSheet(result.rows[0]);
}
async function assertSheetAccess(monthSheetId, siteId) {
    const sheet = await getSheetById(monthSheetId);
    if (sheet.siteId !== siteId) {
        throw new errors_1.AppError('Month sheet does not belong to this site', 'FORBIDDEN', 403);
    }
}
function recordKey(date, fieldId, segmentId) {
    return `${date}|${fieldId}|${(segmentId || '').trim().toLowerCase()}`;
}
async function bulkImport(siteId, year, farmName, sheets) {
    const client = await client_1.dbPool.connect();
    const months = [];
    let totalInserted = 0;
    let totalSkipped = 0;
    try {
        await client.query('BEGIN');
        for (const sheet of sheets) {
            const result = {
                month: sheet.month,
                inserted: 0,
                skipped: 0,
                errors: [],
            };
            try {
                const sheetRow = await client.query(`INSERT INTO irrigation_month_sheets (site_id, year, month, farm_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (site_id, year, month)
           DO UPDATE SET farm_name = COALESCE(EXCLUDED.farm_name, irrigation_month_sheets.farm_name),
                         updated_at = NOW()
           RETURNING id`, [siteId, year, sheet.month, farmName ?? null]);
                const monthSheetId = sheetRow.rows[0].id;
                if (sheet.mode === 'replace') {
                    await client.query('DELETE FROM irrigation_records WHERE month_sheet_id = $1', [monthSheetId]);
                }
                const existingKeys = new Set();
                if (sheet.mode === 'merge') {
                    const existing = await client.query(`SELECT date, field_id, segment_id FROM irrigation_records WHERE month_sheet_id = $1`, [monthSheetId]);
                    for (const row of existing.rows) {
                        existingKeys.add(recordKey(row.date, row.field_id, row.segment_id));
                    }
                }
                for (let i = 0; i < sheet.records.length; i++) {
                    const rec = sheet.records[i];
                    try {
                        const key = recordKey(rec.date, rec.fieldId, rec.segmentId);
                        if (sheet.mode === 'merge' && existingKeys.has(key)) {
                            result.skipped++;
                            continue;
                        }
                        const volume = computeVolume(rec.flowRateM3Hr, rec.cycleDurationHr);
                        await client.query(`INSERT INTO irrigation_records (
                 month_sheet_id, field_id, date, segment_id, area_ha, crop,
                 flow_rate_m3_hr, cycle_duration_hr, volume_m3, authorized_by
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
                            monthSheetId,
                            rec.fieldId,
                            rec.date,
                            rec.segmentId ?? null,
                            rec.areaHa ?? null,
                            rec.crop ?? null,
                            rec.flowRateM3Hr ?? null,
                            rec.cycleDurationHr ?? null,
                            volume,
                            rec.authorizedBy ?? null,
                        ]);
                        existingKeys.add(key);
                        result.inserted++;
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        result.errors.push(`Row ${i + 1}: ${msg}`);
                    }
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                result.errors.push(msg);
            }
            totalInserted += result.inserted;
            totalSkipped += result.skipped;
            months.push(result);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    return { months, totalInserted, totalSkipped };
}
