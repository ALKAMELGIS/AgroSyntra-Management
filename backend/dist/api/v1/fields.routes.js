"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const field_service_1 = require("../../services/field.service");
const valve_service_1 = require("../../services/valve.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const pagination_1 = require("../../utils/pagination");
const fieldSummary_service_1 = require("../../services/fieldSummary.service");
const auditLog_service_1 = require("../../services/auditLog.service");
const client_1 = require("../../db/client");
exports.fieldsRouter = (0, express_1.Router)();
const service = new field_service_1.FieldService();
const valveService = new valve_service_1.ValveService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    farm_area_id: zod_1.z.string().uuid().optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
const polygonSchema = zod_1.z.array(zod_1.z.tuple([zod_1.z.number(), zod_1.z.number()])).min(3);
const createSchema = zod_1.z.object({
    farmAreaId: zod_1.z.string().uuid(),
    fieldTypeId: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1),
    currentCropId: zod_1.z.string().uuid().optional(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    valveCount: zod_1.z.number().int().nonnegative().optional(),
    area: zod_1.z.number().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    polygon: polygonSchema.optional(),
});
const updateSchema = zod_1.z.object({
    farmAreaId: zod_1.z.string().uuid().optional(),
    fieldTypeId: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1).optional(),
    currentCropId: zod_1.z.string().uuid().optional(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    valveCount: zod_1.z.number().int().nonnegative().optional(),
    area: zod_1.z.number().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    polygon: zod_1.z.union([polygonSchema, zod_1.z.array(zod_1.z.any()).max(0)]).optional(),
});
const changeCropSchema = zod_1.z.object({
    cropId: zod_1.z.string().uuid(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    startDate: zod_1.z.string().min(1),
});
const addHistorySchema = zod_1.z.object({
    cropId: zod_1.z.string().uuid(),
    startDate: zod_1.z.string().min(1),
    endDate: zod_1.z.string().optional().nullable(),
});
const valveSchema = zod_1.z.object({
    number: zod_1.z.coerce.number().int().positive(),
    name: zod_1.z.string().optional(),
});
const valvesSchema = zod_1.z.object({
    valves: zod_1.z.array(valveSchema),
});
/**
 * GET /fields/gis-orphans
 *
 * Returns fields that are linked to a GIS external id (`gis_external_id`)
 * whose corresponding feature has disappeared from every currently-known
 * GIS layer. These are "orphaned" — the polygon they used to reference
 * has been deleted or renamed on the ArcGIS side, and any map-based view
 * won't find them.
 *
 * Why this matters: we match fields by stable external id to survive
 * renames on the GIS source. But if the feature is deleted on the ArcGIS
 * side, the field silently loses its polygon. This endpoint surfaces that
 * state so an operator can either:
 *   a) re-sync from a newer layer that still has the polygon, or
 *   b) decide the field really is retired and soft-delete it.
 *
 * The endpoint does NOT mutate — it's a read-only diagnostic. We don't
 * auto-unlink or auto-delete; the operator has to decide.
 */
exports.fieldsRouter.get('/gis-orphans', async (req, res, next) => {
    try {
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        const q = `
      SELECT f.id,
             f.name,
             f.gis_external_id,
             fa.name AS farm_area_name,
             s.name  AS site_name,
             c.name  AS zone_name,
             f.updated_at
        FROM fields f
        JOIN farm_areas fa ON fa.id = f.farm_area_id
        JOIN sites      s  ON s.id  = fa.site_id
        JOIN countries  c  ON c.id  = s.country_id
       WHERE f.deleted_at IS NULL
         AND f.organization_id = $1
         AND s.organization_id = $1
         AND f.gis_external_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM gis_features gf
            WHERE gf.external_id = f.gis_external_id
         )
       ORDER BY c.name, s.name, fa.name, f.name`;
        const result = await client_1.dbPool.query(q, [orgId]);
        let rows = result.rows;
        if (user.role !== 'ceo') {
            const accessibleIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
            const idSet = new Set(accessibleIds);
            rows = rows.filter((r) => idSet.has(r.id));
        }
        res.json({ success: true, data: rows });
    }
    catch (err) {
        // If gis_features doesn't exist yet (fresh install, no layer synced)
        // just return an empty list — there are no orphans by definition.
        if (err?.code === '42P01') {
            return res.json({ success: true, data: [] });
        }
        next(err);
    }
});
exports.fieldsRouter.get('/phi-status', async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        let data = await (0, fieldSummary_service_1.getPhiStatusBatch)(orgId);
        const user = req.user;
        if (user.role !== 'ceo') {
            const accessibleIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
            const idSet = new Set(accessibleIds);
            data = data.filter((item) => idSet.has(item.fieldId));
        }
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
exports.fieldsRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, farm_area_id, site_id } = req.query;
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        let result;
        if (user.role === 'ceo') {
            result = await service.list({ page, limit, farmAreaId: farm_area_id, siteId: site_id, organizationId: orgId });
        }
        else {
            const fieldIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
            if (fieldIds.length === 0) {
                const { page: p, limit: l } = (0, pagination_1.normalizePagination)({ page, limit });
                result = { items: [], meta: (0, pagination_1.buildPaginationMeta)(0, p, l) };
            }
            else {
                result = await service.list({ page, limit, farmAreaId: farm_area_id, fieldIds, siteId: site_id });
            }
        }
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const field = await service.getById(req.params.id);
        const user = req.user;
        const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, field.id, (0, tenant_1.requireOrgId)(req));
        if (!canAccess)
            throw new errors_1.NotFoundError('Field not found');
        res.json({ success: true, data: field });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.post('/', auth_1.requireOperationManager, (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const field = await service.create({ ...req.body, organizationId: (0, tenant_1.requireOrgId)(req) });
        res.status(201).json({ success: true, data: field });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.put('/:id', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const field = await service.update(req.params.id, req.body);
        res.json({ success: true, data: field });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.delete('/:id', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        // Capture a snapshot of the field before deletion so the audit log
        // remains useful once the row is gone.
        let snapshot = null;
        try {
            snapshot = await service.getById(req.params.id);
        }
        catch { /* non-fatal */ }
        await service.remove(req.params.id);
        await (0, auditLog_service_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'DELETE',
            entity: 'field',
            entityId: req.params.id,
            changes: snapshot
                ? { name: snapshot.name, farmAreaId: snapshot.farmAreaId ?? snapshot.farm_area_id }
                : undefined,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.put('/:id/crop', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema, body: changeCropSchema }), async (req, res, next) => {
    try {
        const { cropId, startDate, varietyId } = req.body;
        const field = await service.changeCrop(req.params.id, cropId, startDate, varietyId);
        res.json({ success: true, data: field });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.get('/:id/crop-history', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const user = req.user;
        const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.id, (0, tenant_1.requireOrgId)(req));
        if (!canAccess)
            throw new errors_1.NotFoundError('Field not found');
        const history = await service.getCropHistory(req.params.id);
        res.json({ success: true, data: history });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.post('/:id/crop-history', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema, body: addHistorySchema }), async (req, res, next) => {
    try {
        const { cropId, startDate, endDate } = req.body;
        await service.addHistory(req.params.id, cropId, startDate, endDate);
        const history = await service.getCropHistory(req.params.id);
        res.status(201).json({ success: true, data: history });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.get('/:id/summary', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const user = req.user;
        const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.id, (0, tenant_1.requireOrgId)(req));
        if (!canAccess)
            throw new errors_1.NotFoundError('Field not found');
        const summary = await (0, fieldSummary_service_1.getFieldSummary)(req.params.id);
        res.json({ success: true, data: summary });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.get('/:id/valves', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const user = req.user;
        const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.id, (0, tenant_1.requireOrgId)(req));
        if (!canAccess)
            throw new errors_1.NotFoundError('Field not found');
        const data = await valveService.listByField(req.params.id);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldsRouter.put('/:id/valves', auth_1.requireOperationManager, (0, validate_1.validate)({ params: idSchema, body: valvesSchema }), async (req, res, next) => {
    try {
        const { valves } = req.body;
        await valveService.replaceForField(req.params.id, valves);
        const data = await valveService.listByField(req.params.id);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
