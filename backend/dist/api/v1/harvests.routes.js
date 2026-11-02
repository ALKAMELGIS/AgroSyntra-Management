"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.harvestsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const harvest_service_1 = require("../../services/harvest.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
const errors_1 = require("../../utils/errors");
const roleAccess_1 = require("../../utils/roleAccess");
const websocket_1 = require("../../websocket");
const webhook_service_1 = require("../../services/webhook.service");
const alertEngine_service_1 = require("../../services/alertEngine.service");
const phiAuditLog_service_1 = require("../../services/phiAuditLog.service");
exports.harvestsRouter = (0, express_1.Router)();
const service = new harvest_service_1.HarvestService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const phiPreviewQuerySchema = zod_1.z.object({
    field_id: zod_1.z.string().uuid(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    segment_id: zod_1.z.string().optional(),
    start_time: zod_1.z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).optional(),
});
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    field_ids: zod_1.z.string().optional(),
    site_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const varietySchema = zod_1.z.object({
    variety: zod_1.z.string().min(1),
    quantity: zod_1.z.number().positive(),
    grade: zod_1.z.string().optional(),
});
const createSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    date: zod_1.z.string().min(1),
    totalQuantity: zod_1.z.number().positive().optional(),
    notes: zod_1.z.string().optional(),
    startTime: zod_1.z.string().optional(),
    endTime: zod_1.z.string().optional(),
    shiftNumber: zod_1.z.string().optional(),
    weekNumber: zod_1.z.string().max(20).optional(),
    batchNumber: zod_1.z.string().optional(),
    segmentId: zod_1.z.string().optional(),
    harvestedAreaHa: zod_1.z.number().optional(),
    packhouse: zod_1.z.string().optional(),
    authorizedBy: zod_1.z.string().optional(),
    extraData: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    cropId: zod_1.z.string().uuid().optional(),
    varieties: zod_1.z.array(varietySchema).min(1),
});
const updateSchema = zod_1.z.object({
    date: zod_1.z.string().min(1).optional(),
    totalQuantity: zod_1.z.number().positive().optional(),
    notes: zod_1.z.string().optional(),
    startTime: zod_1.z.string().optional(),
    endTime: zod_1.z.string().optional(),
    shiftNumber: zod_1.z.string().optional(),
    weekNumber: zod_1.z.string().max(20).optional(),
    batchNumber: zod_1.z.string().optional(),
    segmentId: zod_1.z.string().optional(),
    harvestedAreaHa: zod_1.z.number().optional(),
    packhouse: zod_1.z.string().optional(),
    authorizedBy: zod_1.z.string().optional(),
    varieties: zod_1.z.array(varietySchema).min(1).optional(),
});
exports.harvestsRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, field_ids, site_id, start_date, end_date } = req.query;
        const fieldIdsArr = field_ids ? field_ids.split(',').filter(Boolean) : undefined;
        const result = await service.list({
            page,
            limit,
            fieldId: field_id,
            fieldIds: fieldIdsArr,
            siteId: site_id,
            startDate: start_date,
            endDate: end_date,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.get('/reports/summary', async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        if (!siteId)
            return res.status(400).json({ success: false, error: 'site_id required' });
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const data = await service.getSummary(siteId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.get('/reports/daily-worksheet', async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        if (!siteId)
            return res.status(400).json({ success: false, error: 'site_id required' });
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const data = await service.getDailyWorksheet(siteId, req.query.start_date, req.query.end_date);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.get('/reports/weekly-summary', async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        if (!siteId)
            return res.status(400).json({ success: false, error: 'site_id required' });
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const data = await service.getWeeklySummary(siteId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.get('/phi-preview', (0, validate_1.validate)({ query: phiPreviewQuerySchema }), async (req, res, next) => {
    try {
        const fieldId = req.query.field_id;
        const harvestDate = req.query.date;
        const segmentId = req.query.segment_id || null;
        const harvestStartTime = req.query.start_time || null;
        await (0, tenantValidation_1.assertFieldInOrganization)(fieldId, (0, tenant_1.requireOrgId)(req));
        const data = await (0, phiAuditLog_service_1.previewHarvestPhiConflicts)({
            organizationId: (0, tenant_1.requireOrgId)(req),
            fieldId,
            harvestDate,
            harvestStartTime,
            segmentId,
        });
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const harvest = await service.getById(req.params.id);
        await (0, tenantValidation_1.assertFieldInOrganization)(harvest.fieldId, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data: harvest });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.post('/bulk', async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const entries = req.body.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ success: false, error: 'entries array required' });
        }
        const result = await service.bulkCreate(entries);
        res.status(201).json({ success: true, data: result });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const user = req.user;
        if (user.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.body.fieldId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess)
                throw new errors_1.AppError('You do not have access to this field', 'FORBIDDEN', 403);
        }
        const harvest = await service.create(req.body);
        (0, websocket_1.emitDataChange)('harvest', 'create', harvest);
        (0, webhook_service_1.deliverWebhooks)('harvest.created', harvest).catch(() => { });
        if (harvest.totalQuantity) {
            (0, alertEngine_service_1.evaluateAlerts)('harvest', harvest.id, req.body.fieldId, { total_quantity: harvest.totalQuantity }).catch(() => { });
        }
        (0, phiAuditLog_service_1.checkAndNotifyHarvestConflicts)(harvest.id).catch(() => { });
        res.status(201).json({ success: true, data: harvest });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.put('/:id', (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const harvest = await service.update(req.params.id, req.body);
        (0, websocket_1.emitDataChange)('harvest', 'update', harvest);
        res.json({ success: true, data: harvest });
    }
    catch (error) {
        next(error);
    }
});
exports.harvestsRouter.delete('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        await service.remove(req.params.id);
        (0, websocket_1.emitDataChange)('harvest', 'delete', { id: req.params.id });
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
