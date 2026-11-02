"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoutingRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const scoutingService = __importStar(require("../../services/scouting.service"));
const scoutingSummaryService = __importStar(require("../../services/scoutingSummary.service"));
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const websocket_1 = require("../../websocket");
const webhook_service_1 = require("../../services/webhook.service");
const auditLog_service_1 = require("../../services/auditLog.service");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const roleAccess_1 = require("../../utils/roleAccess");
exports.scoutingRouter = (0, express_1.Router)();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
// ─── Schemas ──────────────────────────────────────────────────────
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    site_id: zod_1.z.string().uuid().optional(),
    pest_disease_id: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum(['submitted', 'reviewed', 'resolved']).optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
});
const observationSchema = zod_1.z.object({
    pestDiseaseId: zod_1.z.string().uuid().optional(),
    pestName: zod_1.z.string().min(1).max(200),
    category: zod_1.z.enum(['insect', 'disease']),
    samplingUnit: zod_1.z.string().max(100).optional(),
    samplingMethod: zod_1.z.string().max(200).optional(),
    count1: zod_1.z.number().optional(),
    count2: zod_1.z.number().optional(),
    count3: zod_1.z.number().optional(),
    count4: zod_1.z.number().optional(),
    count5: zod_1.z.number().optional(),
    count6: zod_1.z.number().optional(),
    count7: zod_1.z.number().optional(),
    count8: zod_1.z.number().optional(),
    count9: zod_1.z.number().optional(),
    count10: zod_1.z.number().optional(),
    total: zod_1.z.number().optional(),
    average: zod_1.z.number().optional(),
    percent: zod_1.z.number().min(0).max(100).optional(),
});
const growthStageSchema = zod_1.z.object({
    numberOfTrusses: zod_1.z.number().optional(),
    numberOfStems: zod_1.z.number().optional(),
    stemThickness: zod_1.z.number().optional(),
    avgFruitWeight: zod_1.z.number().optional(),
    fruitsPerPlant: zod_1.z.number().optional(),
});
const trapCardSchema = zod_1.z.object({
    cardNumber: zod_1.z.number().int().positive(),
    insectType: zod_1.z.string().max(50).optional(),
    trapLocation: zod_1.z.string().max(200).optional(),
    monday: zod_1.z.number().int().optional(),
    tuesday: zod_1.z.number().int().optional(),
    wednesday: zod_1.z.number().int().optional(),
    thursday: zod_1.z.number().int().optional(),
    friday: zod_1.z.number().int().optional(),
    saturday: zod_1.z.number().int().optional(),
    sunday: zod_1.z.number().int().optional(),
    total: zod_1.z.number().int().optional(),
});
const createReportSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    reportDate: zod_1.z.string().optional(),
    reportTime: zod_1.z.string().optional(),
    cropName: zod_1.z.string().max(100).optional(),
    variety: zod_1.z.string().max(100).optional(),
    areaVariety: zod_1.z.string().max(100).optional(),
    densityPerArea: zod_1.z.number().optional(),
    cropHeight: zod_1.z.number().optional(),
    soilCondition: zod_1.z.enum(['wet', 'dry']).optional(),
    weather: zod_1.z.enum(['sunny', 'cloudy', 'rainy']).optional(),
    wind: zod_1.z.enum(['none', 'light', 'strong']).optional(),
    bedCode: zod_1.z.string().max(255).optional(),
    columnCode: zod_1.z.string().max(255).optional(),
    bayCode: zod_1.z.string().max(255).optional(),
    valveCode: zod_1.z.string().max(255).optional(),
    side: zod_1.z.enum(['fan', 'wet_pad']).optional(),
    previousReportId: zod_1.z.string().uuid().optional(),
    comments: zod_1.z.string().optional(),
    // Legacy single-observation fields
    pestDiseaseId: zod_1.z.string().uuid().optional(),
    customPestName: zod_1.z.string().max(200).optional(),
    infestationPct: zod_1.z.number().min(0).max(100).optional(),
    severity: zod_1.z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
    notes: zod_1.z.string().optional(),
    gpsLat: zod_1.z.number().optional(),
    gpsLng: zod_1.z.number().optional(),
    // New child collections
    observations: zod_1.z.array(observationSchema).optional(),
    growthStage: growthStageSchema.optional(),
    trapCards: zod_1.z.array(trapCardSchema).optional(),
});
const addPhotosSchema = zod_1.z.object({
    photos: zod_1.z.array(zod_1.z.object({
        filePath: zod_1.z.string(),
        fileName: zod_1.z.string().optional(),
        fileSize: zod_1.z.number().optional(),
        mimeType: zod_1.z.string().optional(),
        gpsLat: zod_1.z.number().optional(),
        gpsLng: zod_1.z.number().optional(),
        caption: zod_1.z.string().optional(),
    })).min(1),
});
const updateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['submitted', 'reviewed', 'resolved']),
});
const pestCatalogCreateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200),
    category: zod_1.z.enum(['pest', 'disease', 'other', 'biological_control', 'preventative']),
    description: zod_1.z.string().optional(),
    recommendedAction: zod_1.z.string().optional(),
    warningThreshold: zod_1.z.number().min(0).max(100).optional(),
    criticalThreshold: zod_1.z.number().min(0).max(100).optional(),
    matchPattern: zod_1.z.string().max(100).optional(),
    sortOrder: zod_1.z.number().int().optional(),
    includeInSummary: zod_1.z.boolean().optional(),
    groupIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
const pestCatalogUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200).optional(),
    category: zod_1.z.enum(['pest', 'disease', 'other', 'biological_control', 'preventative']).optional(),
    description: zod_1.z.string().optional(),
    recommendedAction: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().optional(),
    warningThreshold: zod_1.z.number().min(0).max(100).optional(),
    criticalThreshold: zod_1.z.number().min(0).max(100).optional(),
    matchPattern: zod_1.z.string().max(100).optional(),
    sortOrder: zod_1.z.number().int().optional(),
    includeInSummary: zod_1.z.boolean().optional(),
    groupIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    matchToId: zod_1.z.string().uuid().nullable().optional(),
});
const pestCatalogListQuerySchema = zod_1.z.object({
    category: zod_1.z.string().optional(),
    include_inactive: zod_1.z.enum(['true', 'false']).optional(),
});
const fieldIdSchema = zod_1.z.object({ fieldId: zod_1.z.string().uuid() });
const samplingUnitsUpdateSchema = zod_1.z.object({
    samplingUnits: zod_1.z.number().positive(),
});
const samplingUnitsListQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid().optional(),
});
const summaryQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    year: zod_1.z.coerce.number().int().min(2000).max(2100).optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
});
// ─── Field sampling units ─────────────────────────────────────────
exports.scoutingRouter.get('/sampling-units', auth_1.auth, (0, validate_1.validate)({ query: samplingUnitsListQuerySchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const user = req.user;
        const siteId = req.query.site_id;
        let rows;
        if (user.role === 'ceo') {
            rows = await scoutingService.listFieldSamplingUnits({ organizationId: orgId, siteId });
        }
        else {
            const fieldIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
            if (fieldIds.length === 0) {
                rows = [];
            }
            else {
                rows = await scoutingService.listFieldSamplingUnits({
                    organizationId: orgId,
                    siteId,
                    fieldIds,
                });
            }
        }
        res.json({ success: true, data: rows });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.get('/sampling-units/:fieldId', auth_1.auth, (0, validate_1.validate)({ params: fieldIdSchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const user = req.user;
        await (0, tenantValidation_1.assertFieldInOrganization)(req.params.fieldId, orgId);
        const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.fieldId, orgId);
        if (!canAccess) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Field not found' },
            });
        }
        const samplingUnits = await scoutingService.getFieldSamplingUnits(req.params.fieldId);
        res.json({ success: true, data: { fieldId: req.params.fieldId, samplingUnits } });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.put('/sampling-units/:fieldId', auth_1.auth, auth_1.requireAgronomist, (0, validate_1.validate)({ params: fieldIdSchema, body: samplingUnitsUpdateSchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const user = req.user;
        await (0, tenantValidation_1.assertFieldInOrganization)(req.params.fieldId, orgId);
        const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.fieldId, orgId);
        if (!canAccess) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Field not found' },
            });
        }
        const row = await scoutingService.upsertFieldSamplingUnits(req.params.fieldId, req.body.samplingUnits, req.user.userId);
        res.json({ success: true, data: row });
    }
    catch (error) {
        next(error);
    }
});
// ─── Pest Catalog Routes ──────────────────────────────────────────
exports.scoutingRouter.get('/pest-catalog', auth_1.auth, (0, validate_1.validate)({ query: pestCatalogListQuerySchema }), async (req, res, next) => {
    try {
        const query = req.query;
        const catalog = await scoutingService.getPestCatalog((0, tenant_1.requireOrgId)(req), query.category, query.include_inactive === 'true');
        res.json({ success: true, data: catalog });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.post('/pest-catalog', auth_1.auth, auth_1.requireAgronomist, (0, validate_1.validate)({ body: pestCatalogCreateSchema }), async (req, res, next) => {
    try {
        const entry = await scoutingService.createPestCatalogEntry({
            ...req.body,
            isCustom: true,
            createdBy: req.user.userId,
            organizationId: (0, tenant_1.requireOrgId)(req),
            warningThreshold: req.body.warningThreshold,
            criticalThreshold: req.body.criticalThreshold,
            groupIds: req.body.groupIds,
        });
        res.status(201).json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.put('/pest-catalog/:id', auth_1.auth, auth_1.requireAgronomist, (0, validate_1.validate)({ params: idSchema, body: pestCatalogUpdateSchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        if (req.body.matchToId) {
            const merged = await scoutingService.mergePestCatalogEntry(req.params.id, req.body.matchToId, orgId);
            res.json({ success: true, data: merged });
            return;
        }
        const { matchToId: ignoredMatchToId, groupIds, ...rest } = req.body;
        void ignoredMatchToId;
        const entry = await scoutingService.updatePestCatalogEntry(req.params.id, rest);
        if (groupIds) {
            await scoutingService.setPestCatalogGroups(req.params.id, groupIds, orgId);
        }
        const catalog = await scoutingService.getPestCatalog(orgId, undefined, true);
        const latest = catalog.find((row) => row.id === req.params.id) || entry;
        res.json({ success: true, data: latest });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.delete('/pest-catalog/:id', auth_1.auth, auth_1.requireAgronomist, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await scoutingService.deletePestCatalogEntry(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
// ─── Scouting Report Routes ──────────────────────────────────────
exports.scoutingRouter.get('/reports', auth_1.auth, (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, site_id, pest_disease_id, status, start_date, end_date } = req.query;
        const result = await scoutingService.listScoutingReports({
            fieldId: field_id,
            siteId: site_id,
            pestDiseaseId: pest_disease_id,
            status,
            startDate: start_date,
            endDate: end_date,
            page,
            limit,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.get('/reports/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const report = await scoutingService.getScoutingReportById(req.params.id, (0, tenant_1.requireOrgId)(req));
        if (!report) {
            return res.status(404).json({ success: false, error: { message: 'Report not found' } });
        }
        res.json({ success: true, data: report });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.post('/reports', auth_1.auth, (0, validate_1.validate)({ body: createReportSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateScouting)({ userId: req.user.userId, role: req.user.role });
        const orgId = (0, tenant_1.requireOrgId)(req);
        if (req.body.fieldId)
            await (0, tenantValidation_1.assertFieldInOrganization)(req.body.fieldId, orgId);
        const report = await scoutingService.createScoutingReport(req.body, req.user.userId, orgId);
        (0, websocket_1.emitDataChange)('scouting_report', 'create', report);
        (0, webhook_service_1.deliverWebhooks)('scouting_report.created', report).catch(() => { });
        res.status(201).json({ success: true, data: report });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.put('/reports/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema, body: createReportSchema }), async (req, res, next) => {
    try {
        // Access control: the scout themselves may edit their report; anyone
        // agronomist-or-above may edit any report. Workers can't edit other
        // people's reports.
        const orgId = (0, tenant_1.requireOrgId)(req);
        const existing = await scoutingService.getScoutingReportById(req.params.id, orgId);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
            });
        }
        const role = req.user.role;
        const isOwner = existing.scout_user_id === req.user.userId;
        const isElevated = ['agronomist', 'pest_agronomist', 'farm_manager', 'operation_manager', 'ceo'].includes(role);
        if (!(0, roleAccess_1.canOperateScouting)(role)) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You do not have permission to edit scouting reports.' },
            });
        }
        if (role === 'scouter' && !isOwner) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You can only edit reports you created.' },
            });
        }
        if (!isOwner && !isElevated) {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'You can only edit reports you created.' },
            });
        }
        const updated = await scoutingService.updateScoutingReport(req.params.id, req.body, req.user.userId);
        if (!updated) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
            });
        }
        await (0, auditLog_service_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'UPDATE',
            entity: 'report',
            entityId: req.params.id,
            changes: {
                scope: 'scouting',
                fieldId: req.body?.fieldId,
                reportDate: req.body?.reportDate,
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        (0, websocket_1.emitDataChange)('scouting_report', 'update', updated);
        (0, webhook_service_1.deliverWebhooks)('scouting_report.updated', updated).catch(() => { });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.delete('/reports/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        // Deleting a historical record is more consequential than editing it,
        // so we gate delete on agronomist-or-above only. Workers who made a
        // mistake should edit the bad report rather than removing it from the
        // record.
        const role = req.user.role;
        if (!['agronomist', 'pest_agronomist', 'farm_manager', 'operation_manager', 'ceo'].includes(role)) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only agronomists and managers may delete scouting reports.',
                },
            });
        }
        // Capture a quick snapshot for the audit log so the entry stays
        // useful after the row is gone.
        const orgId = (0, tenant_1.requireOrgId)(req);
        let snapshot = null;
        try {
            snapshot = await scoutingService.getScoutingReportById(req.params.id, orgId);
        }
        catch { /* non-fatal */ }
        const deleted = await scoutingService.deleteScoutingReport(req.params.id);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
            });
        }
        await (0, auditLog_service_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'DELETE',
            entity: 'report',
            entityId: req.params.id,
            changes: snapshot
                ? {
                    scope: 'scouting',
                    fieldId: snapshot.field_id,
                    reportDate: snapshot.report_date,
                    scoutUserId: snapshot.scout_user_id,
                }
                : { scope: 'scouting' },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        (0, websocket_1.emitDataChange)('scouting_report', 'delete', { id: req.params.id });
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.post('/reports/:id/photos', auth_1.auth, (0, validate_1.validate)({ params: idSchema, body: addPhotosSchema }), async (req, res, next) => {
    try {
        const photos = await scoutingService.addScoutingPhotos(req.params.id, req.body.photos);
        res.status(201).json({ success: true, data: photos });
    }
    catch (error) {
        next(error);
    }
});
exports.scoutingRouter.patch('/reports/:id/status', auth_1.auth, auth_1.requireAgronomist, (0, validate_1.validate)({ params: idSchema, body: updateStatusSchema }), async (req, res, next) => {
    try {
        const report = await scoutingService.updateScoutingReportStatus(req.params.id, req.body.status, req.user.userId);
        (0, websocket_1.emitDataChange)('scouting_report', 'update', report);
        res.json({ success: true, data: report });
    }
    catch (error) {
        next(error);
    }
});
// ─── Scouting Summary ─────────────────────────────────────────────
exports.scoutingRouter.get('/summary', auth_1.auth, (0, validate_1.validate)({ query: summaryQuerySchema }), async (req, res, next) => {
    try {
        const query = req.query;
        const summary = await scoutingSummaryService.getScoutingSummary({
            organizationId: (0, tenant_1.requireOrgId)(req),
            siteId: query.site_id,
            fieldId: query.field_id,
            year: query.year,
            startDate: query.start_date,
            endDate: query.end_date,
        });
        res.json({ success: true, data: summary });
    }
    catch (error) {
        next(error);
    }
});
// ─── Stats ────────────────────────────────────────────────────────
exports.scoutingRouter.get('/stats', auth_1.auth, async (req, res, next) => {
    try {
        const fieldId = req.query.field_id;
        const siteId = req.query.site_id;
        const stats = await scoutingService.getScoutingStats((0, tenant_1.requireOrgId)(req), fieldId, siteId);
        res.json({ success: true, data: stats });
    }
    catch (error) {
        next(error);
    }
});
