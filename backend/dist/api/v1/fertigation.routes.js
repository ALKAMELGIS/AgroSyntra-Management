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
exports.fertigationRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const fertigation_service_1 = require("../../services/fertigation.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const roleAccess_1 = require("../../utils/roleAccess");
const websocket_1 = require("../../websocket");
const fertigationGroupService = __importStar(require("../../services/fertigationGroup.service"));
exports.fertigationRouter = (0, express_1.Router)();
const service = new fertigation_service_1.FertigationService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    site_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
});
const createSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    recipeId: zod_1.z.string().uuid().optional(),
    cropId: zod_1.z.string().uuid().optional(),
    date: zod_1.z.string().min(1),
    weekNumber: zod_1.z.number().int().optional(),
    flowRate: zod_1.z.number().optional(),
    frequency: zod_1.z.number().int().optional(),
    valvesCount: zod_1.z.number().int().optional(),
    dailyWater: zod_1.z.number().optional(),
    fertilizers: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
    totalFertilizer: zod_1.z.number().optional(),
    cumulative: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    workerId: zod_1.z.string().uuid().optional(),
});
const updateSchema = createSchema.partial().omit({ fieldId: true });
const groupListQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
});
const groupBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).max(200),
    fieldIds: zod_1.z.array(zod_1.z.string().uuid()).min(1),
    defaultRecipeId: zod_1.z.string().uuid().nullable().optional(),
});
const groupUpdateSchema = groupBodySchema.partial().omit({ siteId: true });
exports.fertigationRouter.get('/groups', (0, validate_1.validate)({ query: groupListQuerySchema }), async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        const groups = await fertigationGroupService.listGroups(siteId, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data: groups });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.post('/groups', (0, validate_1.validate)({ body: groupBodySchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const body = req.body;
        const group = await fertigationGroupService.createGroup({
            organizationId: (0, tenant_1.requireOrgId)(req),
            siteId: body.siteId,
            name: body.name,
            fieldIds: body.fieldIds,
            defaultRecipeId: body.defaultRecipeId,
        });
        res.status(201).json({ success: true, data: group });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.put('/groups/:id', (0, validate_1.validate)({ params: idSchema, body: groupUpdateSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const group = await fertigationGroupService.updateGroup(req.params.id, (0, tenant_1.requireOrgId)(req), req.body);
        res.json({ success: true, data: group });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.delete('/groups/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        await fertigationGroupService.deleteGroup(req.params.id, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, site_id, start_date, end_date } = req.query;
        const result = await service.list({
            page,
            limit,
            fieldId: field_id,
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
exports.fertigationRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const entry = await service.getById(req.params.id);
        res.json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.post('/bulk', async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const entries = req.body?.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            throw new errors_1.AppError('entries array is required', 'VALIDATION_ERROR', 400);
        }
        const parsed = [];
        const parseErrors = [];
        for (let i = 0; i < entries.length; i += 1) {
            try {
                parsed.push(createSchema.parse(entries[i]));
            }
            catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                parseErrors.push(`Entry ${i + 1}: ${message}`);
            }
        }
        const results = await service.bulkImport(parsed);
        results.errors = [...parseErrors, ...results.errors];
        (0, websocket_1.emitDataChange)('fertigation', 'create', { bulk: true, count: results.inserted + results.updated });
        res.status(201).json({ success: true, data: results });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const user = req.user;
        if (user.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.body.fieldId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess)
                throw new errors_1.AppError('You do not have access to this field', 'FORBIDDEN', 403);
        }
        const entry = await service.create(req.body);
        (0, websocket_1.emitDataChange)('fertigation', 'create', entry);
        // Auto-deduct fertilizers from inventory (best-effort)
        if (req.body.fertilizers && typeof req.body.fertilizers === 'object') {
            const { deductByName } = await Promise.resolve().then(() => __importStar(require('../../services/inventory.service')));
            for (const [fertName, qty] of Object.entries(req.body.fertilizers)) {
                if (typeof qty === 'number' && qty > 0) {
                    deductByName(fertName, 'fertilizer', qty, 'fertigation_entry', entry.id, user.userId).catch(() => { });
                }
            }
        }
        res.status(201).json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.put('/:id', (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        // Reverse previous inventory deductions then re-deduct with new values
        const { reverseUsageByReference, deductByName } = await Promise.resolve().then(() => __importStar(require('../../services/inventory.service')));
        reverseUsageByReference('fertigation_entry', req.params.id, req.user?.userId).catch(() => { });
        const entry = await service.update(req.params.id, req.body);
        (0, websocket_1.emitDataChange)('fertigation', 'update', entry);
        if (req.body.fertilizers && typeof req.body.fertilizers === 'object') {
            for (const [fertName, qty] of Object.entries(req.body.fertilizers)) {
                if (typeof qty === 'number' && qty > 0) {
                    deductByName(fertName, 'fertilizer', qty, 'fertigation_entry', entry.id, req.user?.userId).catch(() => { });
                }
            }
        }
        res.json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.fertigationRouter.delete('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        // Reverse inventory deductions before deleting
        const { reverseUsageByReference } = await Promise.resolve().then(() => __importStar(require('../../services/inventory.service')));
        await reverseUsageByReference('fertigation_entry', req.params.id, req.user?.userId).catch(() => { });
        await service.remove(req.params.id);
        (0, websocket_1.emitDataChange)('fertigation', 'delete', { id: req.params.id });
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
