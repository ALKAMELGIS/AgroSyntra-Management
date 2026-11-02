"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fertilizerApplicationRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const fertilizerApplication_service_1 = require("../../services/fertilizerApplication.service");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
exports.fertilizerApplicationRouter = (0, express_1.Router)();
exports.fertilizerApplicationRouter.use(auth_1.auth);
const getOrgId = (req) => (0, tenant_1.requireOrgId)(req);
const recordsQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
    year: zod_1.z.coerce.number().int().min(2000).max(2100).optional(),
    field_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
});
const recordIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const recordBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    fieldId: zod_1.z.string().uuid(),
    date: zod_1.z.string().min(1),
    segmentId: zod_1.z.string().optional(),
    areaHa: zod_1.z.number().optional(),
    crop: zod_1.z.string().optional(),
    fertilizerProductId: zod_1.z.string().uuid().optional(),
    fertilizerName: zod_1.z.string().min(1),
    fertilizerTypeConc: zod_1.z.string().optional(),
    totalKg: zod_1.z.number().optional(),
    operatorName: zod_1.z.string().optional(),
    authorizedBy: zod_1.z.string().optional(),
    misNo: zod_1.z.string().optional(),
    docNo: zod_1.z.string().optional(),
});
const updateRecordSchema = recordBodySchema.partial().omit({ siteId: true });
const productBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    typeConc: zod_1.z.string().optional(),
});
const workbookBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    farmName: zod_1.z.string().optional(),
});
const importRecordSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    date: zod_1.z.string().min(1),
    segmentId: zod_1.z.string().optional(),
    areaHa: zod_1.z.number().optional(),
    crop: zod_1.z.string().optional(),
    fertilizerName: zod_1.z.string().min(1),
    fertilizerTypeConc: zod_1.z.string().optional(),
    totalKg: zod_1.z.number().optional(),
    operatorName: zod_1.z.string().optional(),
    authorizedBy: zod_1.z.string().optional(),
    misNo: zod_1.z.string().optional(),
    docNo: zod_1.z.string().optional(),
});
const importBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    farmName: zod_1.z.string().optional(),
    mode: zod_1.z.enum(['merge', 'replace']),
    records: zod_1.z.array(importRecordSchema),
});
exports.fertilizerApplicationRouter.get('/fertilizer-products', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = await (0, fertilizerApplication_service_1.listFertilizerProducts)(getOrgId(req));
    res.json({ success: true, data });
}));
exports.fertilizerApplicationRouter.post('/fertilizer-products', (0, validate_1.validate)({ body: productBodySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, typeConc } = req.body;
    const data = await (0, fertilizerApplication_service_1.upsertFertilizerProduct)(getOrgId(req), name, typeConc);
    res.status(201).json({ success: true, data });
}));
exports.fertilizerApplicationRouter.post('/fertilizer-products/sync', (0, validate_1.validate)({ body: zod_1.z.object({ names: zod_1.z.array(zod_1.z.string().min(1)) }) }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { names } = req.body;
    const data = await (0, fertilizerApplication_service_1.syncFertilizerProducts)(getOrgId(req), names);
    res.status(201).json({ success: true, data });
}));
exports.fertilizerApplicationRouter.get('/workbook', (0, validate_1.validate)({ query: zod_1.z.object({ site_id: zod_1.z.string().uuid() }) }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { site_id } = req.query;
    await (0, tenantValidation_1.assertSiteInOrganization)(site_id, (0, tenant_1.requireOrgId)(req));
    const data = await (0, fertilizerApplication_service_1.getWorkbook)(site_id);
    res.json({ success: true, data });
}));
exports.fertilizerApplicationRouter.post('/workbook', (0, validate_1.validate)({ body: workbookBodySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId, farmName } = req.body;
    await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
    const data = await (0, fertilizerApplication_service_1.ensureWorkbook)(siteId, farmName);
    res.status(201).json({ success: true, data });
}));
exports.fertilizerApplicationRouter.get('/records', (0, validate_1.validate)({ query: recordsQuerySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { site_id, year, field_id, start_date, end_date } = req.query;
    const orgId = (0, tenant_1.requireOrgId)(req);
    await (0, tenantValidation_1.assertSiteInOrganization)(site_id, orgId);
    const data = await (0, fertilizerApplication_service_1.listRecords)({
        siteId: site_id,
        organizationId: orgId,
        year,
        fieldId: field_id,
        startDate: start_date,
        endDate: end_date,
    });
    res.json({ success: true, data });
}));
exports.fertilizerApplicationRouter.post('/records', (0, validate_1.validate)({ body: recordBodySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    await (0, tenantValidation_1.assertSiteInOrganization)(req.body.siteId, orgId);
    await (0, tenantValidation_1.assertFieldInOrganization)(req.body.fieldId, orgId);
    const data = await (0, fertilizerApplication_service_1.createRecord)(req.body);
    res.status(201).json({ success: true, data });
}));
exports.fertilizerApplicationRouter.put('/records/:id', (0, validate_1.validate)({ params: recordIdSchema, body: updateRecordSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = await (0, fertilizerApplication_service_1.updateRecord)(req.params.id, req.body);
    res.json({ success: true, data });
}));
exports.fertilizerApplicationRouter.delete('/records/:id', (0, validate_1.validate)({ params: recordIdSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, fertilizerApplication_service_1.deleteRecord)(req.params.id);
    res.json({ success: true });
}));
exports.fertilizerApplicationRouter.post('/import', (0, validate_1.validate)({ body: importBodySchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId, farmName, mode, records } = req.body;
    await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
    const data = await (0, fertilizerApplication_service_1.bulkImport)(getOrgId(req), siteId, farmName, mode, records);
    res.status(201).json({ success: true, data });
}));
