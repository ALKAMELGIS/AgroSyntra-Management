"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.farmAreasRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const farm_area_service_1 = require("../../services/farm-area.service");
const field_service_1 = require("../../services/field.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const pagination_1 = require("../../utils/pagination");
exports.farmAreasRouter = (0, express_1.Router)();
const service = new farm_area_service_1.FarmAreaService();
const fieldService = new field_service_1.FieldService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
const createSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    size: zod_1.z.number().optional(),
    description: zod_1.z.string().optional(),
});
const updateSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1).optional(),
    size: zod_1.z.number().optional(),
    description: zod_1.z.string().optional(),
});
const cropAssignSchema = zod_1.z.object({
    cropIds: zod_1.z.array(zod_1.z.string().uuid()).default([]),
});
exports.farmAreasRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, site_id } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        let result;
        if (user.role === 'ceo') {
            result = await service.list({ page, limit, siteId: site_id, organizationId: orgId });
        }
        else {
            const farmAreaIds = await assignmentRepo.getUserAccessibleFarmAreaIds(user.userId, user.role, orgId);
            if (farmAreaIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                result = await service.list({ page, limit, siteId: site_id, farmAreaIds });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.farmAreasRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const farmArea = await service.getById(req.params.id);
        const user = req.user;
        const canAccess = await assignmentRepo.canUserAccessFarmArea(user.userId, user.role, farmArea.id, (0, tenant_1.requireOrgId)(req));
        if (!canAccess)
            throw new errors_1.NotFoundError('Farm area not found');
        res.json({ success: true, data: farmArea });
    }
    catch (error) {
        next(error);
    }
});
exports.farmAreasRouter.get('/:id/fields', (0, validate_1.validate)({ params: idSchema, query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        const canAccessFarmArea = await assignmentRepo.canUserAccessFarmArea(user.userId, user.role, req.params.id, orgId);
        if (!canAccessFarmArea)
            throw new errors_1.NotFoundError('Farm area not found');
        let result;
        if (user.role === 'ceo') {
            result = await fieldService.list({ page, limit, farmAreaId: req.params.id, organizationId: orgId });
        }
        else {
            const fieldIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
            if (fieldIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                result = await fieldService.list({ page, limit, farmAreaId: req.params.id, fieldIds });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.farmAreasRouter.post('/', auth_1.requireOperationManager, (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const farmArea = await service.create(req.body);
        res.status(201).json({ success: true, data: farmArea });
    }
    catch (error) {
        next(error);
    }
});
exports.farmAreasRouter.put('/:id', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const farmArea = await service.update(req.params.id, req.body);
        res.json({ success: true, data: farmArea });
    }
    catch (error) {
        next(error);
    }
});
exports.farmAreasRouter.put('/:id/crops', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema, body: cropAssignSchema }), async (req, res, next) => {
    try {
        const { cropIds } = req.body;
        await service.setCrops(req.params.id, cropIds);
        res.json({ success: true, data: { updated: true } });
    }
    catch (error) {
        next(error);
    }
});
exports.farmAreasRouter.delete('/:id', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
