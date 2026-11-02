"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openFieldPlantingRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const tenant_1 = require("../middleware/tenant");
const cropHistoryForPlanting_1 = require("../../utils/cropHistoryForPlanting");
const plantingUproot_service_1 = require("../../services/plantingUproot.service");
const plantingSegmentTokens_1 = require("../../utils/plantingSegmentTokens");
const errors_1 = require("../../utils/errors");
const seasons_service_1 = require("../../services/seasons.service");
exports.openFieldPlantingRouter = (0, express_1.Router)();
exports.openFieldPlantingRouter.use(auth_1.auth);
exports.openFieldPlantingRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
const recordSchema = zod_1.z.object({
    seedingDate: zod_1.z.string().min(1),
    fieldId: zod_1.z.string().uuid().optional().nullable(),
    segment: zod_1.z.string().optional().nullable(),
    totalArea: zod_1.z.string().optional().nullable(),
    cropId: zod_1.z.string().uuid().optional().nullable(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    cropType: zod_1.z.string().optional().nullable(),
    breederId: zod_1.z.string().uuid().optional().nullable(),
    lotBatchNo: zod_1.z.string().optional().nullable(),
    quantity: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    uom: zod_1.z.string().optional().nullable(),
    authorizedBy: zod_1.z.string().optional().nullable(),
});
exports.openFieldPlantingRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    const orgId = (0, tenant_1.requireOrgId)(req);
    let query = `
    SELECT ofp.*,
           f.name AS field_name, c.name AS crop_name, cv.name AS variety_name,
           b.name AS breeder_name,
           fa.name AS farm_area_name, s.name AS site_name, s.id AS site_id
    FROM open_field_planting ofp
    LEFT JOIN fields f ON f.id = ofp.field_id
    LEFT JOIN crops c ON c.id = ofp.crop_id
    LEFT JOIN crop_varieties cv ON cv.id = ofp.variety_id
    LEFT JOIN breeders b ON b.id = ofp.breeder_id
    LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
    LEFT JOIN sites s ON s.id = fa.site_id
    WHERE COALESCE(ofp.organization_id, f.organization_id) = $1
  `;
    const params = [orgId];
    if (siteId) {
        query += ` AND (s.id = $2 OR ofp.field_id IS NULL)`;
        params.push(siteId);
    }
    query += ` ORDER BY ofp.seeding_date ASC, f.name ASC`;
    const result = await client_1.dbPool.query(query, params);
    res.json({ success: true, data: result.rows });
}));
exports.openFieldPlantingRouter.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordSchema.parse(req.body);
    const orgId = req.user?.organizationId || null;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        let cropHistoryId = null;
        if (data.fieldId && data.seedingDate && data.cropId) {
            cropHistoryId = await (0, cropHistoryForPlanting_1.createCropHistoryForPlanting)(data.fieldId, data.cropId, data.varietyId || null, data.seedingDate, client);
        }
        const { seasonId, cycleNumber } = await (0, seasons_service_1.preparePlantingInsert)('open_field_planting', {
            fieldId: data.fieldId || null,
            segment: data.segment || null,
            cropId: data.cropId || null,
            occupancyDate: data.seedingDate,
        }, client);
        const result = await client.query(`INSERT INTO open_field_planting
       (organization_id, seeding_date, field_id, segment, total_area,
        crop_id, variety_id, crop_type, breeder_id,
        lot_batch_no, quantity, uom, authorized_by, crop_history_id,
        season_id, cycle_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`, [
            orgId, data.seedingDate, data.fieldId || null, data.segment || null, data.totalArea || null,
            data.cropId || null, data.varietyId || null, data.cropType || 'Annual',
            data.breederId || null, data.lotBatchNo || null,
            data.quantity ? Number(data.quantity) : null, data.uom || null,
            data.authorizedBy || null, cropHistoryId, seasonId, cycleNumber,
        ]);
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.openFieldPlantingRouter.put('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordSchema.partial().parse(req.body);
    const id = req.params.id;
    const sets = [];
    const params = [];
    let idx = 1;
    const addSet = (col, val, cast = '') => {
        sets.push(`${col} = $${idx}${cast}`);
        params.push(val);
        idx++;
    };
    if (data.seedingDate !== undefined)
        addSet('seeding_date', data.seedingDate);
    if (data.fieldId !== undefined)
        addSet('field_id', data.fieldId || null, '::uuid');
    if (data.segment !== undefined)
        addSet('segment', data.segment || null);
    if (data.totalArea !== undefined)
        addSet('total_area', data.totalArea || null);
    if (data.cropId !== undefined)
        addSet('crop_id', data.cropId || null, '::uuid');
    if (data.varietyId !== undefined)
        addSet('variety_id', data.varietyId || null, '::uuid');
    if (data.cropType !== undefined)
        addSet('crop_type', data.cropType || null);
    if (data.breederId !== undefined)
        addSet('breeder_id', data.breederId || null, '::uuid');
    if (data.lotBatchNo !== undefined)
        addSet('lot_batch_no', data.lotBatchNo || null);
    if (data.quantity !== undefined)
        addSet('quantity', data.quantity ? Number(data.quantity) : null);
    if (data.uom !== undefined)
        addSet('uom', data.uom || null);
    if (data.authorizedBy !== undefined)
        addSet('authorized_by', data.authorizedBy || null);
    if (sets.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
    }
    sets.push('updated_at = NOW()');
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE open_field_planting SET ${sets.join(', ')} WHERE id = $${idx}::uuid RETURNING *`, params);
    if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    }
    res.json({ success: true, data: result.rows[0] });
}));
exports.openFieldPlantingRouter.post('/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        entries: zod_1.z.array(recordSchema).min(1),
    });
    const { entries } = schema.parse(req.body);
    const orgId = req.user?.organizationId || null;
    const client = await client_1.dbPool.connect();
    let created = 0;
    try {
        await client.query('BEGIN');
        for (const e of entries) {
            let cropHistoryId = null;
            if (e.fieldId && e.seedingDate && e.cropId) {
                cropHistoryId = await (0, cropHistoryForPlanting_1.createCropHistoryForPlanting)(e.fieldId, e.cropId, e.varietyId || null, e.seedingDate, client);
            }
            const { seasonId, cycleNumber } = await (0, seasons_service_1.preparePlantingInsert)('open_field_planting', {
                fieldId: e.fieldId || null,
                segment: e.segment || null,
                cropId: e.cropId || null,
                occupancyDate: e.seedingDate,
            }, client);
            await client.query(`INSERT INTO open_field_planting
         (organization_id, seeding_date, field_id, segment, total_area,
          crop_id, variety_id, crop_type, breeder_id,
          lot_batch_no, quantity, uom, authorized_by, crop_history_id,
          season_id, cycle_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [
                orgId, e.seedingDate, e.fieldId || null, e.segment || null, e.totalArea || null,
                e.cropId || null, e.varietyId || null, e.cropType || 'Annual',
                e.breederId || null, e.lotBatchNo || null,
                e.quantity ? Number(e.quantity) : null, e.uom || null,
                e.authorizedBy || null, cropHistoryId, seasonId, cycleNumber,
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
    res.json({ success: true, data: { created, total: entries.length } });
}));
exports.openFieldPlantingRouter.post('/sync-fields', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    if (!siteId) {
        return res.status(400).json({ success: false, error: { message: 'site_id is required' } });
    }
    const result = await client_1.dbPool.query(`SELECT ofp.field_id, ofp.crop_id, ofp.variety_id
     FROM open_field_planting ofp
     JOIN fields f ON f.id = ofp.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1 AND ofp.field_id IS NOT NULL AND ofp.crop_id IS NOT NULL`, [siteId]);
    const fieldMap = {};
    for (const row of result.rows) {
        if (!fieldMap[row.field_id]) {
            fieldMap[row.field_id] = { crops: new Set(), varieties: new Set(), cropId: row.crop_id, varietyId: row.variety_id };
        }
        fieldMap[row.field_id].crops.add(row.crop_id);
        if (row.variety_id)
            fieldMap[row.field_id].varieties.add(row.variety_id);
    }
    let synced = 0;
    for (const [fieldId, data] of Object.entries(fieldMap)) {
        const cropId = [...data.crops][0];
        const varietyId = data.varieties.size === 1 ? [...data.varieties][0] : null;
        await client_1.dbPool.query(`UPDATE fields SET current_crop_id = $1, variety_id = $2, updated_at = NOW() WHERE id = $3`, [cropId, varietyId, fieldId]);
        synced++;
    }
    res.json({ success: true, data: { fieldsSynced: synced } });
}));
/**
 * What is still growing on a field.
 *
 * Read-only, so the seeding screen can warn before someone plants onto
 * occupied ground and the uproot dialog can offer only segments that have
 * something in them. Writes also 409 when the chosen segments overlap
 * occupancy in the current season.
 */
exports.openFieldPlantingRouter.get('/occupancy', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const fieldId = req.query.field_id;
    if (!fieldId) {
        return res.status(400).json({ success: false, error: { message: 'field_id is required' } });
    }
    const rows = await (0, plantingUproot_service_1.listActiveOccupancy)('open_field_planting', fieldId);
    const occupied = [...new Set(rows.flatMap((row) => row.segmentTokens))];
    res.json({ success: true, data: { fieldId, occupied, rows } });
}));
/**
 * Free all or part of a field for the next cycle.
 *
 * Nothing is deleted: the finished cycle keeps its row, its harvests and its
 * spray history, and only stops counting as occupancy. Replanting the freed
 * segments on the same day is allowed.
 */
exports.openFieldPlantingRouter.post('/uproot', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = plantingUproot_service_1.uprootSchema.parse(req.body);
    const orgId = req.user?.organizationId || null;
    const userId = req.user?.id || null;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const summary = await (0, plantingUproot_service_1.uprootPlanting)({
            table: 'open_field_planting',
            fieldId: data.fieldId,
            segments: data.segments,
            uprootDate: data.uprootDate,
            reason: data.reason || null,
            userId,
            organizationId: orgId,
        }, client);
        await client.query('COMMIT');
        res.json({ success: true, data: summary });
    }
    catch (err) {
        await client.query('ROLLBACK');
        if (err instanceof plantingSegmentTokens_1.AmbiguousSegmentSplitError) {
            throw new errors_1.AppError(err.message, 'AMBIGUOUS_SEGMENTS', 400);
        }
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.openFieldPlantingRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query('DELETE FROM open_field_planting WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));
