"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plantationWorkbookRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const fieldCropSync_1 = require("../../utils/fieldCropSync");
const seasons_service_1 = require("../../services/seasons.service");
exports.plantationWorkbookRouter = (0, express_1.Router)();
exports.plantationWorkbookRouter.use(auth_1.auth);
exports.plantationWorkbookRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
async function createCropHistoryForOpening(fieldId, cropId, varietyId, startDate, client) {
    await (0, fieldCropSync_1.autoClosePrevious)(fieldId, startDate, undefined, client);
    const seasonId = await (0, seasons_service_1.seasonIdForWritableField)(fieldId, startDate, client);
    const r = await client.query(`INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, season_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`, [fieldId, cropId, varietyId, startDate, seasonId]);
    if (r.rows.length > 0) {
        await (0, fieldCropSync_1.syncFieldCrop)(fieldId, client);
        return r.rows[0].id;
    }
    return null;
}
async function ensureClosingSheets(siteId, orgId, cropIds, client) {
    const unique = [...new Set(cropIds.filter(Boolean))];
    for (const cropId of unique) {
        await client.query(`INSERT INTO plantation_closing_sheets (organization_id, site_id, crop_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, crop_id) DO NOTHING`, [orgId, siteId, cropId]);
    }
}
async function resolveClosingSheetId(body, orgId, client) {
    if (body.closingSheetId)
        return body.closingSheetId;
    if (!body.siteId || !body.cropId) {
        throw new errors_1.AppError('closingSheetId or siteId and cropId is required', 'VALIDATION_ERROR', 400);
    }
    await ensureClosingSheets(body.siteId, orgId, [body.cropId], client);
    const found = await client.query(`SELECT id FROM plantation_closing_sheets
     WHERE site_id = $1 AND crop_id = $2
       AND COALESCE(organization_id, $3) = $3
     LIMIT 1`, [body.siteId, body.cropId, orgId]);
    const id = found.rows[0]?.id;
    if (!id) {
        throw new errors_1.AppError('Closing sheet not found', 'NOT_FOUND', 404);
    }
    return id;
}
const openingSchema = zod_1.z.object({
    requestedDate: zod_1.z.string().optional().nullable(),
    siteCode: zod_1.z.string().optional().nullable(),
    fiscalYear: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    structureType: zod_1.z.string().optional().nullable(),
    farmName: zod_1.z.string().optional().nullable(),
    fieldId: zod_1.z.string().uuid().optional().nullable(),
    section: zod_1.z.string().optional().nullable(),
    cropId: zod_1.z.string().uuid().optional().nullable(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    plantsOrKg: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    surfaceUnit: zod_1.z.string().optional().nullable(),
    surfaceArea: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    budgeted: zod_1.z.string().optional().nullable(),
    remarks: zod_1.z.string().optional().nullable(),
    requestorName: zod_1.z.string().optional().nullable(),
    requestorRole: zod_1.z.string().optional().nullable(),
    requestorEndorsed: zod_1.z.string().optional().nullable(),
    plantationCode: zod_1.z.string().optional().nullable(),
});
const closingSchema = openingSchema.extend({
    financeEndorsed: zod_1.z.string().optional().nullable(),
    financeName: zod_1.z.string().optional().nullable(),
    financeAddedDate: zod_1.z.string().optional().nullable(),
    sageCreatedDate: zod_1.z.string().optional().nullable(),
    sageCreatedBy: zod_1.z.string().optional().nullable(),
    plantationDescription: zod_1.z.string().optional().nullable(),
    closureRequestDate: zod_1.z.string().optional().nullable(),
    closureRequestBy: zod_1.z.string().optional().nullable(),
    closureFmEndorsed: zod_1.z.string().optional().nullable(),
    closureFmName: zod_1.z.string().optional().nullable(),
    closureHooEndorsed: zod_1.z.string().optional().nullable(),
    closureHooName: zod_1.z.string().optional().nullable(),
    closureFinanceEndorsed: zod_1.z.string().optional().nullable(),
    closureFinanceName: zod_1.z.string().optional().nullable(),
    closedDate: zod_1.z.string().optional().nullable(),
    sageClosedBy: zod_1.z.string().optional().nullable(),
});
function parseNum(v) {
    if (v === null || v === undefined || v === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function parseIntYear(v) {
    if (v === null || v === undefined || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
}
const OPENING_INSERT_COLS = `
  organization_id, site_id, requested_date, site_code, fiscal_year, structure_type, farm_name,
  field_id, section, crop_id, variety_id, plants_or_kg, surface_unit, surface_area,
  budgeted, remarks, requestor_name, requestor_role, requestor_endorsed,
  farm_manager_name, farm_manager_date, plantation_code, crop_history_id
`;
async function insertOpeningRow(data, siteId, orgId, client) {
    const startDate = data.requestedDate || null;
    let cropHistoryId = null;
    if (data.fieldId && data.cropId && startDate) {
        cropHistoryId = await createCropHistoryForOpening(data.fieldId, data.cropId, data.varietyId || null, startDate, client);
    }
    const result = await client.query(`INSERT INTO plantation_opening_records (${OPENING_INSERT_COLS})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING id, crop_id`, [
        orgId,
        siteId,
        data.requestedDate || null,
        data.siteCode || null,
        parseIntYear(data.fiscalYear),
        data.structureType || null,
        data.farmName || null,
        data.fieldId || null,
        data.section || null,
        data.cropId || null,
        data.varietyId || null,
        parseNum(data.plantsOrKg),
        data.surfaceUnit || null,
        parseNum(data.surfaceArea),
        data.budgeted || null,
        data.remarks || null,
        data.requestorName || null,
        data.requestorRole || null,
        data.requestorEndorsed || null,
        null,
        null,
        data.plantationCode || null,
        cropHistoryId,
    ]);
    return result.rows[0];
}
exports.plantationWorkbookRouter.get('/workbook', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    if (!siteId) {
        res.status(400).json({ success: false, message: 'site_id required' });
        return;
    }
    const orgId = (0, tenant_1.requireOrgId)(req);
    const opening = await client_1.dbPool.query(`SELECT por.*,
              f.name AS field_name, c.name AS crop_name, cv.name AS variety_name
       FROM plantation_opening_records por
       LEFT JOIN fields f ON f.id = por.field_id
       LEFT JOIN crops c ON c.id = por.crop_id
       LEFT JOIN crop_varieties cv ON cv.id = por.variety_id
       WHERE por.site_id = $1 AND (por.organization_id IS NULL OR por.organization_id = $2)
       ORDER BY por.requested_date ASC NULLS LAST, por.created_at ASC`, [siteId, orgId]);
    const sheets = await client_1.dbPool.query(`SELECT pcs.*, c.name AS crop_name
       FROM plantation_closing_sheets pcs
       JOIN crops c ON c.id = pcs.crop_id
       WHERE pcs.site_id = $1 AND (pcs.organization_id IS NULL OR pcs.organization_id = $2)
       ORDER BY c.name ASC`, [siteId, orgId]);
    const sheetIds = sheets.rows.map((r) => r.id);
    let closingRows = [];
    if (sheetIds.length > 0) {
        const closing = await client_1.dbPool.query(`SELECT pcr.*,
                f.name AS field_name, c.name AS crop_name, cv.name AS variety_name
         FROM plantation_closing_records pcr
         LEFT JOIN fields f ON f.id = pcr.field_id
         LEFT JOIN crops c ON c.id = pcr.crop_id
         LEFT JOIN crop_varieties cv ON cv.id = pcr.variety_id
         WHERE pcr.closing_sheet_id = ANY($1)
         ORDER BY pcr.requested_date ASC NULLS LAST, pcr.created_at ASC`, [sheetIds]);
        closingRows = closing.rows;
    }
    res.json({
        success: true,
        data: {
            opening: opening.rows,
            closingSheets: sheets.rows,
            closingRecords: closingRows,
        },
    });
}));
exports.plantationWorkbookRouter.post('/opening', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = zod_1.z.string().uuid().parse(req.body.siteId);
    const data = openingSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const row = await insertOpeningRow(data, siteId, orgId, client);
        if (row.crop_id) {
            await ensureClosingSheets(siteId, orgId, [row.crop_id], client);
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: { id: row.id } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.plantationWorkbookRouter.put('/opening/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const siteId = zod_1.z.string().uuid().parse(req.body.siteId);
    const data = openingSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const startDate = data.requestedDate || null;
        let cropHistoryId = null;
        if (data.fieldId && data.cropId && startDate) {
            cropHistoryId = await createCropHistoryForOpening(data.fieldId, data.cropId, data.varietyId || null, startDate, client);
        }
        await client.query(`UPDATE plantation_opening_records SET
          requested_date = $1, site_code = $2, fiscal_year = $3, structure_type = $4, farm_name = $5,
          field_id = $6, section = $7, crop_id = $8, variety_id = $9, plants_or_kg = $10,
          surface_unit = $11, surface_area = $12, budgeted = $13, remarks = $14,
          requestor_name = $15, requestor_role = $16, requestor_endorsed = $17,
          plantation_code = $18,
          crop_history_id = COALESCE($19, crop_history_id), updated_at = NOW()
         WHERE id = $20 AND site_id = $21 AND (organization_id IS NULL OR organization_id = $22)`, [
            data.requestedDate || null,
            data.siteCode || null,
            parseIntYear(data.fiscalYear),
            data.structureType || null,
            data.farmName || null,
            data.fieldId || null,
            data.section || null,
            data.cropId || null,
            data.varietyId || null,
            parseNum(data.plantsOrKg),
            data.surfaceUnit || null,
            parseNum(data.surfaceArea),
            data.budgeted || null,
            data.remarks || null,
            data.requestorName || null,
            data.requestorRole || null,
            data.requestorEndorsed || null,
            data.plantationCode || null,
            cropHistoryId,
            id,
            siteId,
            orgId,
        ]);
        if (data.cropId) {
            await ensureClosingSheets(siteId, orgId, [data.cropId], client);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.plantationWorkbookRouter.delete('/opening/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const orgId = (0, tenant_1.requireOrgId)(req);
    await client_1.dbPool.query(`DELETE FROM plantation_opening_records
       WHERE id = $1 AND COALESCE(organization_id, $2) = $2`, [id, orgId]);
    res.json({ success: true });
}));
exports.plantationWorkbookRouter.post('/opening/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = zod_1.z.string().uuid().parse(req.body.siteId);
    const records = zod_1.z.array(openingSchema).parse(req.body.records);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const cropIds = [];
        for (const rec of records) {
            const row = await insertOpeningRow(rec, siteId, orgId, client);
            if (row.crop_id)
                cropIds.push(row.crop_id);
        }
        await ensureClosingSheets(siteId, orgId, cropIds, client);
        await client.query('COMMIT');
        res.json({ success: true, data: { count: records.length } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.plantationWorkbookRouter.post('/closing', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const closingSheetId = zod_1.z.string().uuid().parse(req.body.closingSheetId);
    const data = closingSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const result = await client_1.dbPool.query(`INSERT INTO plantation_closing_records (
        organization_id, closing_sheet_id, requested_date, site_code, fiscal_year, structure_type,
        farm_name, field_id, section, crop_id, variety_id, plants_or_kg, surface_unit, surface_area,
        budgeted, remarks, requestor_role, requestor_endorsed, finance_endorsed, finance_name,
        finance_added_date, sage_created_date, sage_created_by, plantation_code, plantation_description,
        closure_request_date, closure_request_by, closure_fm_endorsed, closure_fm_name,
        closure_hoo_endorsed, closure_hoo_name, closure_finance_endorsed, closure_finance_name,
        closed_date, sage_closed_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
      ) RETURNING id`, [
        orgId,
        closingSheetId,
        data.requestedDate || null,
        data.siteCode || null,
        parseIntYear(data.fiscalYear),
        data.structureType || null,
        data.farmName || null,
        data.fieldId || null,
        data.section || null,
        data.cropId || null,
        data.varietyId || null,
        parseNum(data.plantsOrKg),
        data.surfaceUnit || null,
        parseNum(data.surfaceArea),
        data.budgeted || null,
        data.remarks || null,
        data.requestorRole || null,
        data.requestorEndorsed || null,
        data.financeEndorsed || null,
        data.financeName || null,
        data.financeAddedDate || null,
        data.sageCreatedDate || null,
        data.sageCreatedBy || null,
        data.plantationCode || null,
        data.plantationDescription || null,
        data.closureRequestDate || null,
        data.closureRequestBy || null,
        data.closureFmEndorsed || null,
        data.closureFmName || null,
        data.closureHooEndorsed || null,
        data.closureHooName || null,
        data.closureFinanceEndorsed || null,
        data.closureFinanceName || null,
        data.closedDate || null,
        data.sageClosedBy || null,
    ]);
    res.status(201).json({ success: true, data: { id: result.rows[0].id } });
}));
exports.plantationWorkbookRouter.put('/closing/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = closingSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    await client_1.dbPool.query(`UPDATE plantation_closing_records SET
        requested_date = $1, site_code = $2, fiscal_year = $3, structure_type = $4, farm_name = $5,
        field_id = $6, section = $7, crop_id = $8, variety_id = $9, plants_or_kg = $10,
        surface_unit = $11, surface_area = $12, budgeted = $13, remarks = $14,
        requestor_role = $15, requestor_endorsed = $16, finance_endorsed = $17, finance_name = $18,
        finance_added_date = $19, sage_created_date = $20, sage_created_by = $21,
        plantation_code = $22, plantation_description = $23, closure_request_date = $24,
        closure_request_by = $25, closure_fm_endorsed = $26, closure_fm_name = $27,
        closure_hoo_endorsed = $28, closure_hoo_name = $29, closure_finance_endorsed = $30,
        closure_finance_name = $31, closed_date = $32, sage_closed_by = $33, updated_at = NOW()
       WHERE id = $34 AND COALESCE(organization_id, $35) = $35`, [
        data.requestedDate || null,
        data.siteCode || null,
        parseIntYear(data.fiscalYear),
        data.structureType || null,
        data.farmName || null,
        data.fieldId || null,
        data.section || null,
        data.cropId || null,
        data.varietyId || null,
        parseNum(data.plantsOrKg),
        data.surfaceUnit || null,
        parseNum(data.surfaceArea),
        data.budgeted || null,
        data.remarks || null,
        data.requestorRole || null,
        data.requestorEndorsed || null,
        data.financeEndorsed || null,
        data.financeName || null,
        data.financeAddedDate || null,
        data.sageCreatedDate || null,
        data.sageCreatedBy || null,
        data.plantationCode || null,
        data.plantationDescription || null,
        data.closureRequestDate || null,
        data.closureRequestBy || null,
        data.closureFmEndorsed || null,
        data.closureFmName || null,
        data.closureHooEndorsed || null,
        data.closureHooName || null,
        data.closureFinanceEndorsed || null,
        data.closureFinanceName || null,
        data.closedDate || null,
        data.sageClosedBy || null,
        id,
        orgId,
    ]);
    res.json({ success: true });
}));
exports.plantationWorkbookRouter.delete('/closing/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const orgId = (0, tenant_1.requireOrgId)(req);
    await client_1.dbPool.query(`DELETE FROM plantation_closing_records WHERE id = $1 AND COALESCE(organization_id, $2) = $2`, [id, orgId]);
    res.json({ success: true });
}));
exports.plantationWorkbookRouter.post('/closing/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = zod_1.z.object({
        closingSheetId: zod_1.z.string().uuid().optional(),
        siteId: zod_1.z.string().uuid().optional(),
        cropId: zod_1.z.string().uuid().optional(),
        records: zod_1.z.array(closingSchema),
    }).parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const closingSheetId = await resolveClosingSheetId(body, orgId, client);
        for (const data of body.records) {
            await client.query(`INSERT INTO plantation_closing_records (
            organization_id, closing_sheet_id, requested_date, site_code, fiscal_year, structure_type,
            farm_name, field_id, section, crop_id, variety_id, plants_or_kg, surface_unit, surface_area,
            budgeted, remarks, requestor_role, requestor_endorsed, finance_endorsed, finance_name,
            finance_added_date, sage_created_date, sage_created_by, plantation_code, plantation_description,
            closure_request_date, closure_request_by, closure_fm_endorsed, closure_fm_name,
            closure_hoo_endorsed, closure_hoo_name, closure_finance_endorsed, closure_finance_name,
            closed_date, sage_closed_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
          )`, [
                orgId,
                closingSheetId,
                data.requestedDate || null,
                data.siteCode || null,
                parseIntYear(data.fiscalYear),
                data.structureType || null,
                data.farmName || null,
                data.fieldId || null,
                data.section || null,
                data.cropId || null,
                data.varietyId || null,
                parseNum(data.plantsOrKg),
                data.surfaceUnit || null,
                parseNum(data.surfaceArea),
                data.budgeted || null,
                data.remarks || null,
                data.requestorRole || null,
                data.requestorEndorsed || null,
                data.financeEndorsed || null,
                data.financeName || null,
                data.financeAddedDate || null,
                data.sageCreatedDate || null,
                data.sageCreatedBy || null,
                data.plantationCode || null,
                data.plantationDescription || null,
                data.closureRequestDate || null,
                data.closureRequestBy || null,
                data.closureFmEndorsed || null,
                data.closureFmName || null,
                data.closureHooEndorsed || null,
                data.closureHooName || null,
                data.closureFinanceEndorsed || null,
                data.closureFinanceName || null,
                data.closedDate || null,
                data.sageClosedBy || null,
            ]);
        }
        await client.query('COMMIT');
        res.json({ success: true, data: { count: body.records.length } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
async function userCanApproveAsOperationManager(userId, role, siteId) {
    if (role !== 'operation_manager')
        return false;
    const r = await client_1.dbPool.query(`SELECT 1 FROM user_site_assignments WHERE user_id = $1 AND site_id = $2 LIMIT 1`, [userId, siteId]);
    return r.rowCount !== null && r.rowCount > 0;
}
async function approveOpeningRecord(req, res) {
    const { id } = req.params;
    const orgId = (0, tenant_1.requireOrgId)(req);
    const user = req.user;
    if (!user?.userId) {
        throw new errors_1.AppError('Unauthorized', 'UNAUTHORIZED', 401);
    }
    const existing = await client_1.dbPool.query(`SELECT id, site_id, farm_manager_approved FROM plantation_opening_records
     WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`, [id, orgId]);
    if (existing.rows.length === 0) {
        throw new errors_1.AppError('Record not found', 'NOT_FOUND', 404);
    }
    const row = existing.rows[0];
    if (row.farm_manager_approved) {
        res.json({ success: true, data: { alreadyApproved: true } });
        return;
    }
    const allowed = await userCanApproveAsOperationManager(user.userId, user.role, row.site_id);
    if (!allowed) {
        throw new errors_1.AppError('Only an Operation Manager assigned to this site can approve', 'FORBIDDEN', 403);
    }
    const nameRow = await client_1.dbPool.query(`SELECT name FROM users WHERE id = $1`, [user.userId]);
    const omName = nameRow.rows[0]?.name || user.email || 'Operation Manager';
    await client_1.dbPool.query(`UPDATE plantation_opening_records SET
      farm_manager_approved = TRUE,
      farm_manager_approved_at = NOW(),
      farm_manager_approved_by = $1,
      farm_manager_name = $2,
      farm_manager_date = CURRENT_DATE,
      updated_at = NOW()
     WHERE id = $3`, [user.userId, omName, id]);
    res.json({ success: true, data: { farmManagerName: omName } });
}
exports.plantationWorkbookRouter.put('/opening/:id/farm-manager-approval', (0, asyncHandler_1.asyncHandler)(approveOpeningRecord));
exports.plantationWorkbookRouter.put('/opening/:id/operation-manager-approval', (0, asyncHandler_1.asyncHandler)(approveOpeningRecord));
