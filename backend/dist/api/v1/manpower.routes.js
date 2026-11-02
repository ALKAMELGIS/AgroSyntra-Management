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
exports.manpowerRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const manpowerService = __importStar(require("../../services/manpower.service"));
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const workerAuth_1 = require("../middleware/workerAuth");
const roleAccess_1 = require("../../utils/roleAccess");
const changeRequestAccess_1 = require("../../utils/changeRequestAccess");
const ipmAccess_1 = require("../../utils/ipmAccess");
const errors_1 = require("../../utils/errors");
const tenantValidation_1 = require("../../utils/tenantValidation");
const fieldStaffService = __importStar(require("../../services/fieldStaff.service"));
const validate_1 = require("../middleware/validate");
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const workersListQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    is_team_leader: zod_1.z.enum(['true', 'false']).optional(),
    active_only: zod_1.z.enum(['true', 'false']).optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
const recordsListQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    date: zod_1.z.string().optional(),
    worker_id: zod_1.z.string().uuid().optional(),
    submitted_by: zod_1.z.string().uuid().optional(),
    activity: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    approval_status: zod_1.z.string().optional(),
    approved_only: zod_1.z.enum(['true', 'false']).optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    offset: zod_1.z.coerce.number().int().min(0).optional(),
});
const detailPivotQuerySchema = zod_1.z.object({
    start_date: zod_1.z.string().min(1),
    end_date: zod_1.z.string().min(1),
    site_id: zod_1.z.string().uuid().optional(),
    approved_only: zod_1.z.enum(['true', 'false']).optional(),
});
const overlapsQuerySchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    worker_ids: zod_1.z.string().min(1),
});
function parseWorkerIds(raw) {
    return [...new Set(raw.split(',').map((id) => id.trim()).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))];
}
const hoursDetailQuerySchema = zod_1.z.object({
    start_date: zod_1.z.string().min(1),
    end_date: zod_1.z.string().min(1),
    site_id: zod_1.z.string().uuid().optional(),
    crop: zod_1.z.string().optional(),
    activity: zod_1.z.string().min(1),
    variety: zod_1.z.string().optional(),
    group_by: zod_1.z.enum(['crop', 'variety']).optional(),
    approved_only: zod_1.z.enum(['true', 'false']).optional(),
});
const performanceQuerySchema = zod_1.z.object({
    start_date: zod_1.z.string().min(1),
    end_date: zod_1.z.string().min(1),
    site_id: zod_1.z.string().uuid(),
});
const activityReferenceQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
});
const activityReferenceBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    activity: zod_1.z.string().min(1),
    crop: zod_1.z.string().nullable().optional(),
    variety: zod_1.z.string().nullable().optional(),
    unit: zod_1.z.string().nullable().optional(),
    target: zod_1.z.number().nullable().optional(),
    sheet: zod_1.z.string().max(80).nullable().optional(),
});
const activityReferenceUpdateSchema = zod_1.z.object({
    activity: zod_1.z.string().min(1).optional(),
    crop: zod_1.z.string().nullable().optional(),
    variety: zod_1.z.string().nullable().optional(),
    unit: zod_1.z.string().nullable().optional(),
    target: zod_1.z.number().nullable().optional(),
    sheet: zod_1.z.string().max(80).nullable().optional(),
});
const pendingApprovalsQuerySchema = zod_1.z.object({
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
function assertApprovedManpowerRequiresChangeRequest(actor, record) {
    if (record.approval_status === 'approved' && !(0, changeRequestAccess_1.canReviewEntityChangeRequest)(actor, changeRequestAccess_1.ENTITY_MANPOWER_RECORD)) {
        throw new errors_1.AppError('Approved manpower records cannot be modified directly. Submit a change request for review.', 'FORBIDDEN', 403);
    }
}
exports.manpowerRouter = (0, express_1.Router)();
// ─── Worker Auth (public) ───────────────────────────────────────
exports.manpowerRouter.post('/auth/login', async (req, res) => {
    try {
        const { employeeId, pin } = req.body;
        if (!employeeId || !pin) {
            return res.status(400).json({ success: false, error: { message: 'Employee ID and PIN are required' } });
        }
        const result = await manpowerService.workerLogin(employeeId, pin);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
// ─── Team Leader endpoints (worker auth) ────────────────────────
exports.manpowerRouter.get('/workers/search', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const q = req.query.q || '';
        const siteId = req.worker?.siteId;
        if (!siteId) {
            return res.status(403).json({ success: false, error: { message: 'No site assigned to your account. Contact your supervisor.' } });
        }
        const workers = await manpowerService.searchWorkers(q, siteId);
        return res.json({ success: true, data: workers });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/activities', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const ctx = req.worker?.workerId
            ? await manpowerService.getWorkerSprayCalendarContext(req.worker.workerId)
            : { siteId: null, organizationId: null };
        const activities = await manpowerService.listActivities({
            siteId: ctx.siteId || undefined,
            organizationId: ctx.organizationId || undefined,
        });
        return res.json({ success: true, data: activities });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/entry/activity-references', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const ctx = await manpowerService.getWorkerSprayCalendarContext(req.worker.workerId);
        if (!ctx.siteId || !ctx.organizationId) {
            return res.status(403).json({
                success: false,
                error: { message: 'No site assigned to your account. Contact your supervisor.' },
            });
        }
        const data = await manpowerService.listActivityReferences(ctx.organizationId, ctx.siteId);
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/varieties', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const cropId = req.query.crop_id;
        const cropName = req.query.crop_name;
        const varieties = await manpowerService.listVarieties(cropId, cropName);
        return res.json({ success: true, data: varieties });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/fields-with-variety', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const siteId = req.worker?.siteId;
        if (!siteId) {
            return res.status(403).json({ success: false, error: { message: 'No site assigned to your account. Contact your supervisor.' } });
        }
        const fields = await manpowerService.getFieldsWithVariety(siteId);
        return res.json({ success: true, data: fields });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/records/overlaps', workerAuth_1.workerAuth, (0, validate_1.validate)({ query: overlapsQuerySchema }), async (req, res) => {
    try {
        const date = req.query.date;
        const workerIds = parseWorkerIds(req.query.worker_ids);
        if (workerIds.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const orgId = await manpowerService.workerOrganizationId(req.worker.workerId);
        if (!orgId) {
            return res.status(403).json({ success: false, error: { message: 'No organization linked to your account.' } });
        }
        const data = await manpowerService.findManpowerOverlaps({
            organizationId: orgId,
            recordDate: date,
            workerIds,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/spray-calendar/applications', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const ctx = await manpowerService.getWorkerSprayCalendarContext(req.worker.workerId);
        if (!ctx.siteId) {
            return res.status(403).json({ success: false, error: { message: 'No site assigned to your account.' } });
        }
        if (!ctx.organizationId) {
            return res.status(403).json({
                success: false,
                error: { message: 'No organization linked to your site. Contact your supervisor.' },
            });
        }
        const startDate = req.query.start_date;
        const endDate = req.query.end_date;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: { message: 'start_date and end_date are required' } });
        }
        const apps = await manpowerService.getSprayCalendarForSite(ctx.siteId, ctx.organizationId, startDate, endDate);
        return res.json({ success: true, data: apps });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/spray-calendar/fields', workerAuth_1.workerAuth, async (req, res) => {
    try {
        const ctx = await manpowerService.getWorkerSprayCalendarContext(req.worker.workerId);
        if (!ctx.siteId) {
            return res.status(403).json({ success: false, error: { message: 'No site assigned to your account.' } });
        }
        const fields = await manpowerService.getSprayCalendarFields(ctx.siteId);
        return res.json({ success: true, data: fields });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/records/bulk', workerAuth_1.workerAuth, workerAuth_1.requireTeamLeader, async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ success: false, error: { message: 'Records array is required' } });
        }
        const enriched = records.map((r) => ({
            ...r,
            submittedBy: req.worker.workerId,
        }));
        const submissionId = manpowerService.createManpowerSubmissionId();
        const result = await manpowerService.bulkCreateRecords(enriched, {
            approvalStatus: 'pending',
            submissionId,
        });
        if (result.length > 0) {
            const orgId = await manpowerService.workerOrganizationId(enriched[0].workerId);
            if (orgId) {
                manpowerService.notifyApproversForNewSubmission(orgId, submissionId, enriched).catch(() => { });
            }
        }
        return res.json({ success: true, data: { inserted: result.length, submissionId } });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
// ─── Data Entry Worker / Admin endpoints (main auth) ────────────
// Workers management
exports.manpowerRouter.get('/workers', auth_1.auth, (0, validate_1.validate)({ query: workersListQuerySchema }), async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            category: req.query.category,
            isTeamLeader: req.query.is_team_leader === 'true' ? true : req.query.is_team_leader === 'false' ? false : undefined,
            activeOnly: req.query.active_only !== 'false',
            siteId: req.query.site_id,
            organizationId: (0, tenant_1.requireOrgId)(req),
        };
        const workers = await manpowerService.listWorkers(filters);
        return res.json({ success: true, data: workers });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/workers', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const schema = zod_1.z.object({
            employeeId: zod_1.z.string().min(1),
            name: zod_1.z.string().min(1),
            category: zod_1.z.enum(['Permanent', 'Casual']).default('Casual'),
            isTeamLeader: zod_1.z.boolean().optional(),
            siteId: zod_1.z.string().uuid().optional(),
        });
        const data = schema.parse(req.body);
        const isTeamLeader = data.isTeamLeader ?? false;
        if (isTeamLeader && !(0, roleAccess_1.canCreateHarvestTeamLeader)(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: { message: 'Only data entry workers may create harvest/maintenance team leaders' },
            });
        }
        if (isTeamLeader && req.user.role === 'worker') {
            await fieldStaffService.assertHarvestTeamLeaderCreate(req.user.role, true, null);
        }
        const worker = await manpowerService.createWorker({
            ...data,
            isTeamLeader,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        return res.status(201).json({ success: true, data: worker });
    }
    catch (err) {
        return res.status(err.status || 400).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/workers/bulk', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const schema = zod_1.z.object({
            workers: zod_1.z.array(zod_1.z.object({
                employeeId: zod_1.z.string().min(1),
                name: zod_1.z.string().min(1),
                category: zod_1.z.enum(['Permanent', 'Casual']).default('Casual'),
            })).min(1),
            siteId: zod_1.z.string().uuid().optional(),
        });
        const data = schema.parse(req.body);
        const result = await manpowerService.bulkCreateWorkers(data.workers, data.siteId, (0, tenant_1.requireOrgId)(req));
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return res.status(err.status || 400).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.put('/workers/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        await fieldStaffService.assertWorkerUpdateAllowed(req.params.id, {
            isTeamLeader: req.body.isTeamLeader,
        });
        const worker = await manpowerService.updateWorker(req.params.id, req.body);
        if (!worker)
            return res.status(404).json({ success: false, error: { message: 'Worker not found' } });
        return res.json({ success: true, data: worker });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.delete('/workers/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        await manpowerService.deactivateWorker(req.params.id);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.put('/workers/:id/pin', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const { pin } = req.body;
        if (!pin || pin.length < 4) {
            return res.status(400).json({ success: false, error: { message: 'PIN must be at least 4 characters' } });
        }
        await manpowerService.setWorkerPin(req.params.id, pin);
        return res.json({ success: true, data: { message: 'PIN set successfully' } });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
// Activities (admin read)
exports.manpowerRouter.get('/admin/activities', auth_1.auth, async (req, res) => {
    try {
        const siteId = req.query.site_id;
        const orgId = (0, tenant_1.requireOrgId)(req);
        if (siteId)
            await (0, tenantValidation_1.assertSiteInOrganization)(siteId, orgId);
        const activities = await manpowerService.listActivities(siteId ? { siteId, organizationId: orgId } : undefined);
        return res.json({ success: true, data: activities });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/admin/fields-with-variety', auth_1.auth, async (req, res) => {
    try {
        const siteId = req.query.site_id;
        if (!siteId) {
            return res.status(400).json({ success: false, error: { message: 'site_id is required' } });
        }
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const fields = await manpowerService.getFieldsWithVariety(siteId);
        return res.json({ success: true, data: fields });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/admin/records/overlaps', auth_1.auth, (0, validate_1.validate)({ query: overlapsQuerySchema }), async (req, res) => {
    try {
        const date = req.query.date;
        const workerIds = parseWorkerIds(req.query.worker_ids);
        if (workerIds.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const data = await manpowerService.findManpowerOverlaps({
            organizationId: (0, tenant_1.requireOrgId)(req),
            recordDate: date,
            workerIds,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
const activityPivotColumnSchema = zod_1.z.object({
    pivotColumn: zod_1.z.string().nullable(),
});
exports.manpowerRouter.put('/admin/activities/:id/pivot-column', auth_1.auth, (0, validate_1.validate)({ params: idSchema, body: activityPivotColumnSchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const { pivotColumn } = req.body;
        const activity = await manpowerService.updateActivityPivotColumn(req.params.id, pivotColumn);
        return res.json({ success: true, data: activity });
    }
    catch (err) {
        const status = err.status || (err.message?.startsWith('Invalid pivot column') ? 400 : 500);
        return res.status(status).json({ success: false, error: { message: err.message } });
    }
});
// Varieties (admin)
exports.manpowerRouter.get('/admin/varieties', auth_1.auth, async (req, res) => {
    try {
        const cropId = req.query.crop_id;
        const cropName = req.query.crop_name;
        const varieties = await manpowerService.listVarieties(cropId, cropName);
        return res.json({ success: true, data: varieties });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/admin/varieties', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const { name, cropId } = req.body;
        if (!name)
            return res.status(400).json({ success: false, error: { message: 'Name is required' } });
        const variety = await manpowerService.createVariety(name, cropId);
        return res.json({ success: true, data: variety });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
function uniqueReferenceError(err) {
    if (err?.code === '23505') {
        return new errors_1.AppError('A reference already exists for this activity, crop, and variety', 'CONFLICT', 409);
    }
    return err;
}
exports.manpowerRouter.get('/activity-references', auth_1.auth, (0, validate_1.validate)({ query: activityReferenceQuerySchema }), async (req, res) => {
    try {
        const siteId = req.query.site_id;
        const data = await manpowerService.listActivityReferences((0, tenant_1.requireOrgId)(req), siteId);
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/activity-references', auth_1.auth, (0, validate_1.validate)({ body: activityReferenceBodySchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanEditManpowerReference)(req.user);
        const body = req.body;
        const data = await manpowerService.createActivityReference({
            organizationId: (0, tenant_1.requireOrgId)(req),
            siteId: body.siteId,
            activity: body.activity,
            crop: body.crop,
            variety: body.variety,
            unit: body.unit,
            target: body.target,
            sheet: body.sheet,
            createdBy: req.user.userId,
        });
        return res.status(201).json({ success: true, data });
    }
    catch (err) {
        const mapped = uniqueReferenceError(err);
        return res.status(mapped.status || 500).json({ success: false, error: { message: mapped.message } });
    }
});
exports.manpowerRouter.put('/activity-references/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema, body: activityReferenceUpdateSchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanEditManpowerReference)(req.user);
        const data = await manpowerService.updateActivityReference(req.params.id, (0, tenant_1.requireOrgId)(req), req.body);
        return res.json({ success: true, data });
    }
    catch (err) {
        const mapped = uniqueReferenceError(err);
        return res.status(mapped.status || 500).json({ success: false, error: { message: mapped.message } });
    }
});
exports.manpowerRouter.delete('/activity-references/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanEditManpowerReference)(req.user);
        await manpowerService.deleteActivityReference(req.params.id, (0, tenant_1.requireOrgId)(req));
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
// Records management (admin)
exports.manpowerRouter.get('/records', auth_1.auth, (0, validate_1.validate)({ query: recordsListQuerySchema }), async (req, res) => {
    try {
        const filters = {
            organizationId: (0, tenant_1.requireOrgId)(req),
            siteId: req.query.site_id,
            startDate: req.query.start_date,
            endDate: req.query.end_date,
            date: req.query.date,
            workerId: req.query.worker_id,
            activity: req.query.activity,
            location: req.query.location,
            submittedBy: req.query.submitted_by,
            search: req.query.search,
            approvalStatus: req.query.approval_status,
            approvedOnly: req.query.approved_only === 'true',
            limit: req.query.limit ? Math.min(parseInt(req.query.limit), 100) : 50,
            offset: req.query.offset ? parseInt(req.query.offset) : 0,
        };
        const result = await manpowerService.listRecords(filters);
        return res.json({ success: true, data: result.data, meta: { total: result.total } });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/records', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const record = await manpowerService.createRecord({
            ...req.body,
            organizationId: (0, tenant_1.requireOrgId)(req),
            createdBy: req.user?.userId,
        });
        return res.status(201).json({ success: true, data: record });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/admin/records/bulk', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        const { records, approvalStatus } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ success: false, error: { message: 'Records array is required' } });
        }
        const enriched = records.map((r) => ({
            ...r,
            createdBy: req.user?.userId,
        }));
        const pending = approvalStatus === 'pending';
        const submissionId = pending ? manpowerService.createManpowerSubmissionId() : null;
        const result = await manpowerService.bulkCreateRecords(enriched, {
            approvalStatus: pending ? 'pending' : 'approved',
            submissionId,
        });
        if (pending && result.length > 0) {
            manpowerService.notifyApproversForNewSubmission((0, tenant_1.requireOrgId)(req), submissionId, enriched).catch(() => { });
        }
        return res.json({ success: true, data: { inserted: result.length, submissionId } });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.put('/records/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const existing = await manpowerService.getRecordById(req.params.id, orgId);
        (0, roleAccess_1.assertCanModifyManpowerRecord)(req.user, existing);
        assertApprovedManpowerRequiresChangeRequest((0, ipmAccess_1.toIpmActor)(req.user), existing);
        const record = await manpowerService.updateRecord(req.params.id, orgId, req.body);
        if (!record)
            return res.status(404).json({ success: false, error: { message: 'Record not found' } });
        return res.json({ success: true, data: record });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.delete('/records/:id', auth_1.auth, (0, validate_1.validate)({ params: idSchema }), async (req, res) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const existing = await manpowerService.getRecordById(req.params.id, orgId);
        (0, roleAccess_1.assertCanOperateWorkforce)(req.user);
        assertApprovedManpowerRequiresChangeRequest((0, ipmAccess_1.toIpmActor)(req.user), existing);
        await manpowerService.deleteRecord(req.params.id, orgId);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
// Summary
exports.manpowerRouter.get('/summary', auth_1.auth, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const summary = await manpowerService.getDailySummary((0, tenant_1.requireOrgId)(req), date);
        return res.json({ success: true, data: summary });
    }
    catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/summary/detail-pivot', auth_1.auth, (0, validate_1.validate)({ query: detailPivotQuerySchema }), async (req, res) => {
    try {
        const startDate = req.query.start_date;
        const endDate = req.query.end_date;
        const siteId = req.query.site_id;
        const approvedOnly = req.query.approved_only === 'true';
        const data = await manpowerService.getDetailPivotSummary((0, tenant_1.requireOrgId)(req), {
            startDate,
            endDate,
            siteId,
            approvedOnly,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/summary/hours-detail', auth_1.auth, (0, validate_1.validate)({ query: hoursDetailQuerySchema }), async (req, res) => {
    try {
        const startDate = req.query.start_date;
        const endDate = req.query.end_date;
        const siteId = req.query.site_id;
        const crop = req.query.crop;
        const activity = req.query.activity;
        const variety = req.query.variety;
        const groupBy = req.query.group_by || 'crop';
        const approvedOnly = req.query.approved_only !== 'false';
        if (groupBy === 'crop' && !crop) {
            return res.status(400).json({
                success: false,
                error: { message: 'crop is required when group_by is crop' },
            });
        }
        const data = await manpowerService.getHoursDetail((0, tenant_1.requireOrgId)(req), {
            startDate,
            endDate,
            siteId,
            crop,
            variety,
            activity,
            groupBy,
            approvedOnly,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/summary/performance', auth_1.auth, (0, validate_1.validate)({ query: performanceQuerySchema }), async (req, res) => {
    try {
        const data = await manpowerService.getPerformanceSummary((0, tenant_1.requireOrgId)(req), {
            startDate: req.query.start_date,
            endDate: req.query.end_date,
            siteId: req.query.site_id,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/approvals/pending-count', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanApproveManpowerRecords)(req.user);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const count = await manpowerService.countPendingManpowerApprovals(orgId);
        const clashCount = await manpowerService.countPendingManpowerApprovalClashes(orgId);
        const badgeCount = manpowerService.badgeCountForManpowerApprovals(req.user?.role, count);
        return res.json({ success: true, data: { count, badgeCount, clashCount } });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.get('/approvals/pending', auth_1.auth, (0, validate_1.validate)({ query: pendingApprovalsQuerySchema }), async (req, res) => {
    try {
        (0, roleAccess_1.assertCanApproveManpowerRecords)(req.user);
        const data = await manpowerService.listPendingApprovals((0, tenant_1.requireOrgId)(req), {
            startDate: req.query.start_date,
            endDate: req.query.end_date,
            siteId: req.query.site_id,
        });
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/approvals/submissions/:submissionKey/approve', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanApproveManpowerRecords)(req.user);
        const result = await manpowerService.approveManpowerSubmission(req.params.submissionKey, (0, tenant_1.requireOrgId)(req), req.user.userId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/approvals/submissions/:submissionKey/reject', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanApproveManpowerRecords)(req.user);
        const result = await manpowerService.rejectManpowerSubmission(req.params.submissionKey, (0, tenant_1.requireOrgId)(req), req.user.userId, req.body?.reason);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/approvals/submissions/:submissionKey/workers/:workerId/approve', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanApproveManpowerRecords)(req.user);
        const result = await manpowerService.approveManpowerWorkerInSubmission(req.params.submissionKey, req.params.workerId, (0, tenant_1.requireOrgId)(req), req.user.userId);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
exports.manpowerRouter.post('/approvals/submissions/:submissionKey/workers/:workerId/reject', auth_1.auth, async (req, res) => {
    try {
        (0, roleAccess_1.assertCanApproveManpowerRecords)(req.user);
        const result = await manpowerService.rejectManpowerWorkerInSubmission(req.params.submissionKey, req.params.workerId, (0, tenant_1.requireOrgId)(req), req.user.userId, req.body?.reason);
        return res.json({ success: true, data: result });
    }
    catch (err) {
        return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
});
