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
exports.fieldStaffRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../../utils/errors");
const roleAccess_1 = require("../../utils/roleAccess");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const fieldStaffService = __importStar(require("../../services/fieldStaff.service"));
exports.fieldStaffRouter = (0, express_1.Router)();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
function requireFieldStaffManager(req, _res, next) {
    if (!req.user || !(0, roleAccess_1.canManageFieldStaff)(req.user.role)) {
        return next(new errors_1.AppError('You do not have permission to manage field staff', 'FORBIDDEN', 403));
    }
    next();
}
exports.fieldStaffRouter.use(auth_1.auth, requireFieldStaffManager);
const createSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    employeeId: zod_1.z.string().min(1).max(20),
    pin: zod_1.z.string().min(4).max(8),
    role: zod_1.z.enum(['scouter', 'operator']),
    siteId: zod_1.z.string().uuid(),
});
const pinSchema = zod_1.z.object({
    pin: zod_1.z.string().min(4).max(8),
});
const linkSchema = zod_1.z.object({
    workerId: zod_1.z.string().uuid(),
    role: zod_1.z.enum(['scouter', 'operator']),
    pin: zod_1.z.string().min(4).max(8),
    siteId: zod_1.z.string().uuid().optional(),
});
exports.fieldStaffRouter.get('/eligible-workers', async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        let siteIds;
        if (req.user.role === 'pest_agronomist') {
            siteIds = await assignmentRepo.getUserAccessibleSiteIds(req.user.userId, req.user.role, orgId);
        }
        const siteIdFilter = req.query.site_id;
        if (siteIdFilter && req.user.role === 'pest_agronomist' && siteIds && !siteIds.includes(siteIdFilter)) {
            throw new errors_1.AppError('You can only view workers at your assigned sites', 'FORBIDDEN', 403);
        }
        const data = await fieldStaffService.listEligibleWorkers(orgId, siteIds, siteIdFilter);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldStaffRouter.post('/link', (0, validate_1.validate)({ body: linkSchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        if (req.body.siteId && req.user.role === 'pest_agronomist') {
            const allowedSites = await assignmentRepo.getUserAccessibleSiteIds(req.user.userId, req.user.role, orgId);
            if (!allowedSites.includes(req.body.siteId)) {
                throw new errors_1.AppError('You can only assign field staff to your sites', 'FORBIDDEN', 403);
            }
        }
        const result = await fieldStaffService.linkWorkerAsFieldStaff({
            ...req.body,
            organizationId: orgId,
            assignedBy: req.user.userId,
        });
        res.status(201).json({ success: true, data: result });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldStaffRouter.get('/', async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        let siteIds;
        if (req.user.role === 'pest_agronomist') {
            siteIds = await assignmentRepo.getUserAccessibleSiteIds(req.user.userId, req.user.role, orgId);
        }
        const data = await fieldStaffService.listFieldStaff(orgId, siteIds);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldStaffRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        if (req.user.role === 'pest_agronomist') {
            const allowedSites = await assignmentRepo.getUserAccessibleSiteIds(req.user.userId, req.user.role, (0, tenant_1.requireOrgId)(req));
            if (!allowedSites.includes(req.body.siteId)) {
                throw new errors_1.AppError('You can only assign field staff to your sites', 'FORBIDDEN', 403);
            }
        }
        const result = await fieldStaffService.createFieldStaff({
            ...req.body,
            organizationId: (0, tenant_1.requireOrgId)(req),
            assignedBy: req.user.userId,
        });
        res.status(201).json({ success: true, data: result });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldStaffRouter.put('/:id/pin', (0, validate_1.validate)({ params: zod_1.z.object({ id: zod_1.z.string().uuid() }), body: pinSchema }), async (req, res, next) => {
    try {
        await fieldStaffService.updateFieldStaffPin(req.params.id, req.body.pin, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data: { message: 'PIN updated' } });
    }
    catch (error) {
        next(error);
    }
});
