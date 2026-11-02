"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pumpRoomRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const pumpRoom_helpers_1 = require("./pumpRoom.helpers");
exports.pumpRoomRouter = (0, express_1.Router)();
exports.pumpRoomRouter.use(auth_1.auth);
exports.pumpRoomRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
const MANAGER_ROLES = ['ceo', 'farm_manager', 'operation_manager'];
function requireManager(req) {
    if (!MANAGER_ROLES.includes(req.user.role)) {
        const err = new Error('Forbidden');
        err.status = 403;
        throw err;
    }
}
const ACTIVE_FILTER = 'deleted_at IS NULL';
const pumpSchema = zod_1.z.object({
    reading: zod_1.z.number().optional().nullable(),
    usage: zod_1.z.number().optional().nullable(),
});
const recordBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid().optional().nullable(),
    recordDate: zod_1.z.string().min(1),
    meterId: zod_1.z.string().optional().nullable(),
    usageArea: zod_1.z.string().optional().nullable(),
    pumps: zod_1.z.array(pumpSchema).optional(),
    reading1: zod_1.z.number().optional().nullable(),
    usage1: zod_1.z.number().optional().nullable(),
    reading2: zod_1.z.number().optional().nullable(),
    usage2: zod_1.z.number().optional().nullable(),
});
const recordPatchSchema = zod_1.z.object({
    recordDate: zod_1.z.string().optional(),
    meterId: zod_1.z.string().optional().nullable(),
    usageArea: zod_1.z.string().optional().nullable(),
    pumps: zod_1.z.array(pumpSchema).optional(),
    pumpIndex: zod_1.z.number().int().min(0).optional(),
    reading: zod_1.z.number().optional().nullable(),
    reading1: zod_1.z.number().optional().nullable(),
    usage1: zod_1.z.number().optional().nullable(),
    reading2: zod_1.z.number().optional().nullable(),
    usage2: zod_1.z.number().optional().nullable(),
});
function tableForDeletedSheetRecordType(recordType) {
    if (recordType === 'water')
        return 'pump_room_water';
    if (recordType === 'fogger')
        return 'pump_room_fogger';
    return 'pump_room_electricity';
}
async function getConfigForSite(siteId) {
    if (!siteId)
        return { ...pumpRoom_helpers_1.DEFAULT_CONFIG, site_id: null };
    const result = await client_1.dbPool.query(`SELECT * FROM site_pump_room_config WHERE site_id = $1`, [siteId]);
    if (!result.rows[0])
        return { ...pumpRoom_helpers_1.DEFAULT_CONFIG, site_id: siteId };
    return result.rows[0];
}
function configResponse(row) {
    return {
        siteId: row.site_id,
        waterPumpCount: row.water_pump_count ?? pumpRoom_helpers_1.DEFAULT_CONFIG.water_pump_count,
        electricityPumpCount: row.electricity_pump_count ?? pumpRoom_helpers_1.DEFAULT_CONFIG.electricity_pump_count,
        foggerPumpCount: row.fogger_pump_count ?? pumpRoom_helpers_1.DEFAULT_CONFIG.fogger_pump_count,
        waterPumpLabels: row.water_pump_labels ?? pumpRoom_helpers_1.DEFAULT_CONFIG.water_pump_labels,
        electricityPumpLabels: row.electricity_pump_labels ?? pumpRoom_helpers_1.DEFAULT_CONFIG.electricity_pump_labels,
        foggerPumpLabels: row.fogger_pump_labels ?? pumpRoom_helpers_1.DEFAULT_CONFIG.fogger_pump_labels,
    };
}
async function insertRecord(table, data) {
    const pumps = (0, pumpRoom_helpers_1.parsePumpsInput)(data);
    const legacy = (0, pumpRoom_helpers_1.pumpsToLegacyColumns)(pumps);
    const pumpsJson = JSON.stringify(pumps);
    const result = await client_1.dbPool.query(`INSERT INTO ${table} (site_id, record_date, meter_id, usage_area, pumps, reading_1, usage_1, reading_2, usage_2)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING *`, [
        data.siteId || null,
        data.recordDate,
        data.meterId || null,
        data.usageArea || null,
        pumpsJson,
        legacy.reading_1,
        legacy.usage_1,
        legacy.reading_2,
        legacy.usage_2,
    ]);
    return (0, pumpRoom_helpers_1.formatRow)(result.rows[0]);
}
async function patchRecord(table, id, data) {
    const existing = await client_1.dbPool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!existing.rows[0])
        return null;
    let pumps = data.pumps ? (0, pumpRoom_helpers_1.parsePumpsInput)({ pumps: data.pumps }) : (0, pumpRoom_helpers_1.normalizePumps)(existing.rows[0]);
    if (data.pumpIndex !== undefined && data.reading !== undefined) {
        pumps = (0, pumpRoom_helpers_1.updatePumpAtIndex)(pumps, data.pumpIndex, data.reading);
    }
    else if (data.reading1 !== undefined || data.usage1 !== undefined || data.reading2 !== undefined || data.usage2 !== undefined) {
        pumps = (0, pumpRoom_helpers_1.parsePumpsInput)({ ...data, pumps: undefined });
    }
    const legacy = (0, pumpRoom_helpers_1.pumpsToLegacyColumns)(pumps);
    const sets = [];
    const params = [];
    let idx = 1;
    if (data.recordDate !== undefined) {
        sets.push(`record_date = $${idx}`);
        params.push(data.recordDate);
        idx++;
    }
    if (data.meterId !== undefined) {
        sets.push(`meter_id = $${idx}`);
        params.push(data.meterId);
        idx++;
    }
    if (data.usageArea !== undefined) {
        sets.push(`usage_area = $${idx}`);
        params.push(data.usageArea);
        idx++;
    }
    if (data.pumps !== undefined || data.pumpIndex !== undefined || data.reading1 !== undefined || data.reading2 !== undefined) {
        sets.push(`pumps = $${idx}::jsonb`);
        params.push(JSON.stringify(pumps));
        idx++;
        sets.push(`reading_1 = $${idx}`);
        params.push(legacy.reading_1);
        idx++;
        sets.push(`usage_1 = $${idx}`);
        params.push(legacy.usage_1);
        idx++;
        sets.push(`reading_2 = $${idx}`);
        params.push(legacy.reading_2);
        idx++;
        sets.push(`usage_2 = $${idx}`);
        params.push(legacy.usage_2);
        idx++;
    }
    if (sets.length === 0) {
        return (0, pumpRoom_helpers_1.formatRow)(existing.rows[0]);
    }
    sets.push('updated_at = NOW()');
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    return (0, pumpRoom_helpers_1.formatRow)(result.rows[0]);
}
function listHandler(table) {
    return (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const siteId = req.query.site_id;
        const month = req.query.month;
        let query = `SELECT * FROM ${table} WHERE ${ACTIVE_FILTER}`;
        const params = [];
        if (siteId) {
            params.push(siteId);
            query += ` AND site_id = $${params.length}`;
        }
        if (month) {
            params.push(month + '-01');
            query += ` AND record_date >= $${params.length}::date AND record_date < ($${params.length}::date + INTERVAL '1 month')`;
        }
        query += ` ORDER BY record_date ASC`;
        const result = await client_1.dbPool.query(query, params);
        res.json({ success: true, data: result.rows.map(pumpRoom_helpers_1.formatRow) });
    });
}
function bulkHandler(table) {
    return (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const schema = zod_1.z.object({
            siteId: zod_1.z.string().uuid().optional().nullable(),
            records: zod_1.z.array(recordBodySchema),
        });
        const { siteId, records } = schema.parse(req.body);
        const client = await client_1.dbPool.connect();
        let created = 0;
        try {
            await client.query('BEGIN');
            for (const rec of records) {
                const pumps = (0, pumpRoom_helpers_1.parsePumpsInput)(rec);
                const legacy = (0, pumpRoom_helpers_1.pumpsToLegacyColumns)(pumps);
                await client.query(`INSERT INTO ${table} (site_id, record_date, meter_id, usage_area, pumps, reading_1, usage_1, reading_2, usage_2)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`, [
                    siteId || null,
                    rec.recordDate,
                    rec.meterId || null,
                    rec.usageArea || null,
                    JSON.stringify(pumps),
                    legacy.reading_1,
                    legacy.usage_1,
                    legacy.reading_2,
                    legacy.usage_2,
                ]);
                created++;
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
        res.json({ success: true, data: { created } });
    });
}
function deleteSheetHandler(recordType, table) {
    return (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const month = req.query.month;
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ success: false, error: { message: 'month query required (YYYY-MM)' } });
        }
        const siteId = req.query.site_id || null;
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const deletion = await client.query(`INSERT INTO pump_room_deleted_sheets (site_id, record_type, month_year, deleted_by)
         VALUES ($1, $2, $3, $4) RETURNING id`, [siteId, recordType, month, req.user.userId]);
            const deletionId = deletion.rows[0].id;
            const updated = await client.query(`UPDATE ${table} SET deleted_at = NOW(), deletion_id = $1
         WHERE deleted_at IS NULL
           AND record_date >= $2::date AND record_date < ($2::date + INTERVAL '1 month')
           AND (($3::uuid IS NULL AND site_id IS NULL) OR site_id = $3)
         RETURNING id`, [deletionId, month + '-01', siteId]);
            await client.query(`UPDATE pump_room_deleted_sheets SET record_count = $1 WHERE id = $2`, [updated.rows.length, deletionId]);
            await client.query('COMMIT');
            res.json({ success: true, data: { deleted: updated.rows.length, deletionId } });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    });
}
// ─── CONFIG ──────────────────────────────────────────────────────────────────
exports.pumpRoomRouter.get('/config', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id || null;
    if (!siteId) {
        return res.json({ success: true, data: configResponse({ ...pumpRoom_helpers_1.DEFAULT_CONFIG, site_id: null }) });
    }
    const row = await getConfigForSite(siteId);
    res.json({ success: true, data: configResponse(row) });
}));
exports.pumpRoomRouter.put('/config', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    requireManager(req);
    const schema = zod_1.z.object({
        siteId: zod_1.z.string().uuid(),
        waterPumpCount: zod_1.z.number().int().min(1).max(10).optional(),
        electricityPumpCount: zod_1.z.number().int().min(1).max(10).optional(),
        foggerPumpCount: zod_1.z.number().int().min(1).max(10).optional(),
        waterPumpLabels: zod_1.z.array(zod_1.z.string()).optional(),
        electricityPumpLabels: zod_1.z.array(zod_1.z.string()).optional(),
        foggerPumpLabels: zod_1.z.array(zod_1.z.string()).optional(),
    });
    const data = schema.parse(req.body);
    const existing = await getConfigForSite(data.siteId);
    const waterCount = data.waterPumpCount ?? existing.water_pump_count ?? 2;
    const elecCount = data.electricityPumpCount ?? existing.electricity_pump_count ?? 2;
    const foggerCount = data.foggerPumpCount ?? existing.fogger_pump_count ?? 2;
    const waterLabels = data.waterPumpLabels ?? existing.water_pump_labels ?? (0, pumpRoom_helpers_1.defaultPumpLabels)(waterCount);
    const elecLabels = data.electricityPumpLabels ?? existing.electricity_pump_labels ?? (0, pumpRoom_helpers_1.defaultPumpLabels)(elecCount);
    const foggerLabels = data.foggerPumpLabels ?? existing.fogger_pump_labels ?? (0, pumpRoom_helpers_1.defaultPumpLabels)(foggerCount);
    const result = await client_1.dbPool.query(`INSERT INTO site_pump_room_config (
       site_id, water_pump_count, electricity_pump_count, fogger_pump_count,
       water_pump_labels, electricity_pump_labels, fogger_pump_labels, updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (site_id) DO UPDATE SET
       water_pump_count = EXCLUDED.water_pump_count,
       electricity_pump_count = EXCLUDED.electricity_pump_count,
       fogger_pump_count = EXCLUDED.fogger_pump_count,
       water_pump_labels = EXCLUDED.water_pump_labels,
       electricity_pump_labels = EXCLUDED.electricity_pump_labels,
       fogger_pump_labels = EXCLUDED.fogger_pump_labels,
       updated_at = NOW()
     RETURNING *`, [
        data.siteId,
        waterCount,
        elecCount,
        foggerCount,
        JSON.stringify(waterLabels),
        JSON.stringify(elecLabels),
        JSON.stringify(foggerLabels),
    ]);
    res.json({ success: true, data: configResponse(result.rows[0]) });
}));
// ─── ELECTRICITY ─────────────────────────────────────────────────────────────
exports.pumpRoomRouter.get('/electricity', listHandler('pump_room_electricity'));
exports.pumpRoomRouter.post('/electricity', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordBodySchema.parse(req.body);
    const row = await insertRecord('pump_room_electricity', data);
    res.status(201).json({ success: true, data: row });
}));
exports.pumpRoomRouter.put('/electricity/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordPatchSchema.parse(req.body);
    const row = await patchRecord('pump_room_electricity', req.params.id, data);
    if (!row)
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true, data: row });
}));
exports.pumpRoomRouter.delete('/electricity/sheet', deleteSheetHandler('electricity', 'pump_room_electricity'));
exports.pumpRoomRouter.delete('/electricity/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query(`DELETE FROM pump_room_electricity WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
}));
exports.pumpRoomRouter.post('/electricity/bulk', bulkHandler('pump_room_electricity'));
// ─── WATER ───────────────────────────────────────────────────────────────────
exports.pumpRoomRouter.get('/water', listHandler('pump_room_water'));
exports.pumpRoomRouter.post('/water', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordBodySchema.parse(req.body);
    const row = await insertRecord('pump_room_water', data);
    res.status(201).json({ success: true, data: row });
}));
exports.pumpRoomRouter.put('/water/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordPatchSchema.parse(req.body);
    const row = await patchRecord('pump_room_water', req.params.id, data);
    if (!row)
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true, data: row });
}));
exports.pumpRoomRouter.delete('/water/sheet', deleteSheetHandler('water', 'pump_room_water'));
exports.pumpRoomRouter.delete('/water/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query(`DELETE FROM pump_room_water WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
}));
exports.pumpRoomRouter.post('/water/bulk', bulkHandler('pump_room_water'));
// ─── FOGGER ──────────────────────────────────────────────────────────────────
exports.pumpRoomRouter.get('/fogger', listHandler('pump_room_fogger'));
exports.pumpRoomRouter.post('/fogger', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordBodySchema.parse(req.body);
    const row = await insertRecord('pump_room_fogger', data);
    res.status(201).json({ success: true, data: row });
}));
exports.pumpRoomRouter.put('/fogger/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordPatchSchema.parse(req.body);
    const row = await patchRecord('pump_room_fogger', req.params.id, data);
    if (!row)
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    res.json({ success: true, data: row });
}));
exports.pumpRoomRouter.delete('/fogger/sheet', deleteSheetHandler('fogger', 'pump_room_fogger'));
exports.pumpRoomRouter.delete('/fogger/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query(`DELETE FROM pump_room_fogger WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
}));
exports.pumpRoomRouter.post('/fogger/bulk', bulkHandler('pump_room_fogger'));
// ─── DELETED SHEETS / RECOVERY ───────────────────────────────────────────────
exports.pumpRoomRouter.get('/deleted-sheets', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    requireManager(req);
    const result = await client_1.dbPool.query(`SELECT d.*, s.name AS site_name, u.name AS deleted_by_name
     FROM pump_room_deleted_sheets d
     LEFT JOIN sites s ON s.id = d.site_id
     LEFT JOIN users u ON u.id = d.deleted_by
     WHERE d.restored_at IS NULL
     ORDER BY d.deleted_at DESC`);
    res.json({ success: true, data: result.rows });
}));
exports.pumpRoomRouter.post('/deleted-sheets/:id/restore', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    requireManager(req);
    const deletionId = req.params.id;
    const sheet = await client_1.dbPool.query(`SELECT * FROM pump_room_deleted_sheets WHERE id = $1 AND restored_at IS NULL`, [deletionId]);
    if (!sheet.rows[0]) {
        return res.status(404).json({ success: false, error: { message: 'Deleted sheet not found' } });
    }
    const { record_type } = sheet.rows[0];
    const table = tableForDeletedSheetRecordType(record_type);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE ${table} SET deleted_at = NULL, deletion_id = NULL WHERE deletion_id = $1`, [deletionId]);
        await client.query(`UPDATE pump_room_deleted_sheets SET restored_at = NOW() WHERE id = $1`, [deletionId]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    res.json({ success: true, data: { restored: true } });
}));
