"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.irrigationRecordRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
const irrigationRecord_service_1 = require("../../services/irrigationRecord.service");
const roleAccess_1 = require("../../utils/roleAccess");
exports.irrigationRecordRouter = (0, express_1.Router)();
exports.irrigationRecordRouter.use(auth_1.auth);
const sheetQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
    year: zod_1.z.coerce.number().int().min(2000).max(2100),
});
const createSheetSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    year: zod_1.z.coerce.number().int().min(2000).max(2100),
    month: zod_1.z.coerce.number().int().min(1).max(12),
    farmName: zod_1.z.string().optional(),
});
const recordIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const recordBodySchema = zod_1.z.object({
    monthSheetId: zod_1.z.string().uuid(),
    fieldId: zod_1.z.string().uuid(),
    date: zod_1.z.string().min(1),
    segmentId: zod_1.z.string().optional(),
    areaHa: zod_1.z.number().optional(),
    crop: zod_1.z.string().optional(),
    flowRateM3Hr: zod_1.z.number().optional(),
    cycleDurationHr: zod_1.z.number().optional(),
    authorizedBy: zod_1.z.string().optional(),
});
const updateRecordSchema = recordBodySchema.partial().omit({ monthSheetId: true });
const importRecordSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    date: zod_1.z.string().min(1),
    segmentId: zod_1.z.string().optional(),
    areaHa: zod_1.z.number().optional(),
    crop: zod_1.z.string().optional(),
    flowRateM3Hr: zod_1.z.number().optional(),
    cycleDurationHr: zod_1.z.number().optional(),
    authorizedBy: zod_1.z.string().optional(),
});
const importBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    year: zod_1.z.coerce.number().int().min(2000).max(2100),
    farmName: zod_1.z.string().optional(),
    sheets: zod_1.z.array(zod_1.z.object({
        month: zod_1.z.coerce.number().int().min(1).max(12),
        mode: zod_1.z.enum(['merge', 'replace']),
        records: zod_1.z.array(importRecordSchema),
    })),
});
exports.irrigationRecordRouter.get('/sheets', (0, validate_1.validate)({ query: sheetQuerySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { site_id, year } = req.query;
    await (0, tenantValidation_1.assertSiteInOrganization)(site_id, (0, tenant_1.requireOrgId)(req));
    const data = await (0, irrigationRecord_service_1.listSheets)(site_id, year);
    res.json({ success: true, data });
}));
exports.irrigationRecordRouter.post('/sheets', (0, validate_1.validate)({ body: createSheetSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
    const { siteId, year, month, farmName } = req.body;
    await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
    const data = await (0, irrigationRecord_service_1.createSheet)(siteId, year, month, farmName);
    res.status(201).json({ success: true, data });
}));
exports.irrigationRecordRouter.get('/summary', (0, validate_1.validate)({ query: sheetQuerySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { site_id, year } = req.query;
    await (0, tenantValidation_1.assertSiteInOrganization)(site_id, (0, tenant_1.requireOrgId)(req));
    const data = await (0, irrigationRecord_service_1.getSummary)(site_id, year);
    res.json({ success: true, data });
}));
const siteRecordsQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
    field_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
});
exports.irrigationRecordRouter.get('/records-by-site', (0, validate_1.validate)({ query: siteRecordsQuerySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { site_id, field_id, start_date, end_date } = req.query;
    const orgId = (0, tenant_1.requireOrgId)(req);
    await (0, tenantValidation_1.assertSiteInOrganization)(site_id, orgId);
    if (field_id)
        await (0, tenantValidation_1.assertFieldInOrganization)(field_id, orgId);
    const data = await (0, irrigationRecord_service_1.listRecordsForSite)({
        siteId: site_id,
        fieldId: field_id,
        startDate: start_date,
        endDate: end_date,
    });
    res.json({ success: true, data });
}));
exports.irrigationRecordRouter.get('/records', (0, validate_1.validate)({ query: zod_1.z.object({ month_sheet_id: zod_1.z.string().uuid() }) }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { month_sheet_id } = req.query;
    const data = await (0, irrigationRecord_service_1.listRecords)(month_sheet_id);
    res.json({ success: true, data });
}));
exports.irrigationRecordRouter.post('/records', (0, validate_1.validate)({ body: recordBodySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
    const data = await (0, irrigationRecord_service_1.createRecord)(req.body);
    res.status(201).json({ success: true, data });
}));
exports.irrigationRecordRouter.put('/records/:id', (0, validate_1.validate)({ params: recordIdSchema, body: updateRecordSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
    const data = await (0, irrigationRecord_service_1.updateRecord)(req.params.id, req.body);
    res.json({ success: true, data });
}));
exports.irrigationRecordRouter.post('/import', (0, validate_1.validate)({ body: importBodySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
    const { siteId, year, farmName, sheets } = req.body;
    await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
    const data = await (0, irrigationRecord_service_1.bulkImport)(siteId, year, farmName, sheets);
    res.status(201).json({ success: true, data });
}));
exports.irrigationRecordRouter.delete('/records/:id', (0, validate_1.validate)({ params: recordIdSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
    await (0, irrigationRecord_service_1.deleteRecord)(req.params.id);
    res.json({ success: true });
}));
