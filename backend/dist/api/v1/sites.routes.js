"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sitesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const farm_area_service_1 = require("../../services/farm-area.service");
const site_service_1 = require("../../services/site.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const pagination_1 = require("../../utils/pagination");
exports.sitesRouter = (0, express_1.Router)();
const service = new site_service_1.SiteService();
const farmAreaService = new farm_area_service_1.FarmAreaService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    country_id: zod_1.z.string().uuid().optional(),
});
const createSchema = zod_1.z.object({
    countryId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    location: zod_1.z.string().optional(),
    totalArea: zod_1.z.number().optional(),
});
const updateSchema = zod_1.z.object({
    countryId: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1).optional(),
    location: zod_1.z.string().optional(),
    totalArea: zod_1.z.number().optional(),
});
exports.sitesRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, country_id } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        let result;
        if (user.role === 'ceo') {
            result = await service.list({ page, limit, countryId: country_id, organizationId: orgId });
        }
        else {
            const siteIds = await assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId);
            if (siteIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                result = await service.list({ page, limit, countryId: country_id, siteIds, organizationId: orgId });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.sitesRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const site = await service.getById(req.params.id);
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        const canAccess = await assignmentRepo.canUserAccessSite(user.userId, user.role, site.id, orgId);
        if (!canAccess)
            throw new errors_1.NotFoundError('Site not found');
        res.json({ success: true, data: site });
    }
    catch (error) {
        next(error);
    }
});
exports.sitesRouter.get('/:id/farm-areas', (0, validate_1.validate)({ params: idSchema, query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        const canAccessSite = await assignmentRepo.canUserAccessSite(user.userId, user.role, req.params.id, orgId);
        if (!canAccessSite)
            throw new errors_1.NotFoundError('Site not found');
        let result;
        if (user.role === 'ceo') {
            result = await farmAreaService.list({ page, limit, siteId: req.params.id, organizationId: orgId });
        }
        else {
            const farmAreaIds = await assignmentRepo.getUserAccessibleFarmAreaIds(user.userId, user.role, orgId);
            if (farmAreaIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                result = await farmAreaService.list({ page, limit, siteId: req.params.id, farmAreaIds });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.sitesRouter.post('/', auth_1.requireManager, (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const site = await service.create({ ...req.body, organizationId: orgId });
        res.status(201).json({ success: true, data: site });
    }
    catch (error) {
        next(error);
    }
});
exports.sitesRouter.put('/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const site = await service.update(req.params.id, req.body);
        res.json({ success: true, data: site });
    }
    catch (error) {
        next(error);
    }
});
exports.sitesRouter.delete('/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
