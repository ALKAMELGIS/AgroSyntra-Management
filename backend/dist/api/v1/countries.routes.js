"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countriesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const country_service_1 = require("../../services/country.service");
const site_service_1 = require("../../services/site.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const site_repository_1 = require("../../repositories/site.repository");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const pagination_1 = require("../../utils/pagination");
exports.countriesRouter = (0, express_1.Router)();
const service = new country_service_1.CountryService();
const siteService = new site_service_1.SiteService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const siteRepo = new site_repository_1.SiteRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
});
const createSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    code: zod_1.z.string().min(2).max(10),
});
const updateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    code: zod_1.z.string().min(2).max(10).optional(),
});
exports.countriesRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        let result;
        if (user.role === 'ceo') {
            result = await service.list({ page, limit, organizationId: orgId });
        }
        else {
            const siteIds = await assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId);
            if (siteIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                const countryIds = await siteRepo.getCountryIdsForSiteIds(siteIds);
                result = await service.list({ page, limit, countryIds, organizationId: orgId });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.countriesRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const country = await service.getById(req.params.id);
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        if (user.role !== 'ceo') {
            const siteIds = await assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId);
            const countryIds = siteIds.length ? await siteRepo.getCountryIdsForSiteIds(siteIds) : [];
            if (!countryIds.includes(country.id)) {
                throw new errors_1.NotFoundError('Country not found');
            }
        }
        res.json({ success: true, data: country });
    }
    catch (error) {
        next(error);
    }
});
exports.countriesRouter.get('/:id/sites', (0, validate_1.validate)({ params: idSchema, query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        let result;
        if (user.role === 'ceo') {
            result = await siteService.list({ page, limit, countryId: req.params.id, organizationId: orgId });
        }
        else {
            const siteIds = await assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId);
            if (siteIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                result = await siteService.list({ page, limit, countryId: req.params.id, siteIds, organizationId: orgId });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.countriesRouter.post('/', auth_1.requireManager, (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const country = await service.create(req.body, orgId);
        res.status(201).json({ success: true, data: country });
    }
    catch (error) {
        next(error);
    }
});
exports.countriesRouter.put('/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const country = await service.update(req.params.id, req.body);
        res.json({ success: true, data: country });
    }
    catch (error) {
        next(error);
    }
});
exports.countriesRouter.delete('/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
