"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cropHistoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const fieldCropSync_1 = require("../../utils/fieldCropSync");
const seasons_service_1 = require("../../services/seasons.service");
const cropHistoryListSql_1 = require("../../utils/cropHistoryListSql");
const cropHistoryAvailability_service_1 = require("../../services/cropHistoryAvailability.service");
exports.cropHistoryRouter = (0, express_1.Router)();
exports.cropHistoryRouter.use(auth_1.auth);
exports.cropHistoryRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
exports.cropHistoryRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    let query = cropHistoryListSql_1.CROP_HISTORY_LIST_SQL;
    const params = [];
    if (siteId) {
        query += ` WHERE s.id = $1`;
        params.push(siteId);
    }
    query += ` ORDER BY f.name ASC, ch.start_date DESC`;
    const result = await client_1.dbPool.query(query, params);
    res.json({ success: true, data: result.rows });
}));
// Gap warnings: find fields with date gaps between rotation entries
exports.cropHistoryRouter.get('/gaps', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    let query = `
    WITH ordered AS (
      SELECT ch.field_id, f.name AS field_name,
             ch.start_date, ch.end_date,
             c.name AS crop_name,
             LAG(ch.end_date) OVER (PARTITION BY ch.field_id ORDER BY ch.start_date) AS prev_end
      FROM crop_history ch
      JOIN fields f ON f.id = ch.field_id
      JOIN crops c ON c.id = ch.crop_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id
      JOIN sites s ON s.id = fa.site_id
      ${siteId ? 'WHERE s.id = $1' : ''}
    )
    SELECT field_id, field_name, crop_name, start_date, prev_end,
           (start_date::date - prev_end::date) AS gap_days
    FROM ordered
    WHERE prev_end IS NOT NULL AND (start_date::date - prev_end::date) > 1
    ORDER BY field_name, start_date
  `;
    const result = await client_1.dbPool.query(query, siteId ? [siteId] : []);
    res.json({ success: true, data: result.rows });
}));
exports.cropHistoryRouter.get('/availability', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    if (!siteId) {
        return res.status(400).json({ success: false, error: { message: 'site_id is required' } });
    }
    const rows = await (0, cropHistoryAvailability_service_1.listCropHistoryAvailability)(siteId);
    res.json({ success: true, data: rows });
}));
exports.cropHistoryRouter.get('/:fieldId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await client_1.dbPool.query(`SELECT ch.*, c.name AS crop_name, cv.name AS variety_name
     FROM crop_history ch
     JOIN crops c ON c.id = ch.crop_id
     LEFT JOIN crop_varieties cv ON cv.id = ch.variety_id
     WHERE ch.field_id = $1
     ORDER BY ch.start_date DESC`, [req.params.fieldId]);
    res.json({ success: true, data: result.rows });
}));
const createSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    cropId: zod_1.z.string().uuid(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    startDate: zod_1.z.string().min(1),
    endDate: zod_1.z.string().optional().nullable(),
});
exports.cropHistoryRouter.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = createSchema.parse(req.body);
    await (0, fieldCropSync_1.autoClosePrevious)(data.fieldId, data.startDate);
    const seasonId = await (0, seasons_service_1.seasonIdForWritableField)(data.fieldId, data.startDate);
    const result = await client_1.dbPool.query(`INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`, [data.fieldId, data.cropId, data.varietyId || null, data.startDate, data.endDate || null, seasonId]);
    if (!data.endDate)
        await (0, fieldCropSync_1.syncFieldCrop)(data.fieldId);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
exports.cropHistoryRouter.post('/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        entries: zod_1.z.array(createSchema).min(1),
    });
    const { entries } = schema.parse(req.body);
    const client = await client_1.dbPool.connect();
    let created = 0;
    const fieldsToSync = new Set();
    try {
        await client.query('BEGIN');
        for (const e of entries) {
            await (0, fieldCropSync_1.autoClosePrevious)(e.fieldId, e.startDate, undefined, client);
            const seasonId = await (0, seasons_service_1.seasonIdForWritableField)(e.fieldId, e.startDate, client);
            const r = await client.query(`INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING id`, [e.fieldId, e.cropId, e.varietyId || null, e.startDate, e.endDate || null, seasonId]);
            if (r.rowCount && r.rowCount > 0) {
                created++;
                if (!e.endDate)
                    fieldsToSync.add(e.fieldId);
            }
        }
        for (const fId of fieldsToSync) {
            await (0, fieldCropSync_1.syncFieldCrop)(fId, client);
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
    res.json({ success: true, data: { created, total: entries.length } });
}));
exports.cropHistoryRouter.put('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { cropId, varietyId, startDate, endDate } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;
    if (cropId) {
        sets.push(`crop_id = $${idx}`);
        params.push(cropId);
        idx++;
    }
    if (varietyId !== undefined) {
        sets.push(`variety_id = $${idx}`);
        params.push(varietyId || null);
        idx++;
    }
    if (startDate) {
        sets.push(`start_date = $${idx}`);
        params.push(startDate);
        idx++;
    }
    if (endDate !== undefined) {
        sets.push(`end_date = $${idx}`);
        params.push(endDate || null);
        idx++;
    }
    if (sets.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
    }
    params.push(req.params.id);
    const result = await client_1.dbPool.query(`UPDATE crop_history SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    }
    const updated = result.rows[0];
    await (0, fieldCropSync_1.syncFieldCrop)(updated.field_id);
    res.json({ success: true, data: updated });
}));
exports.cropHistoryRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query('DELETE FROM crop_history WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));
// Utility: resolve crop for a field on a specific date
exports.cropHistoryRouter.get('/resolve/:fieldId/:date', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await client_1.dbPool.query(`SELECT ch.crop_id, ch.variety_id, c.name AS crop_name, cv.name AS variety_name
     FROM crop_history ch
     JOIN crops c ON c.id = ch.crop_id
     LEFT JOIN crop_varieties cv ON cv.id = ch.variety_id
     WHERE ch.field_id = $1 AND ch.start_date <= $2 AND (ch.end_date IS NULL OR ch.end_date >= $2)
     ORDER BY ch.start_date DESC LIMIT 1`, [req.params.fieldId, req.params.date]);
    res.json({ success: true, data: result.rows[0] || null });
}));
