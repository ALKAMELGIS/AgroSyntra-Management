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
exports.ipmRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const ipmService = __importStar(require("../../services/ipm.service"));
const ipmChangeRequestService = __importStar(require("../../services/ipmChangeRequest.service"));
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const websocket_1 = require("../../websocket");
const client_1 = require("../../db/client");
const workOrder_routes_1 = require("./workOrder.routes");
const pppMsds_routes_1 = require("./pppMsds.routes");
const ipmAccess_1 = require("../../utils/ipmAccess");
const changeRequestAccess_1 = require("../../utils/changeRequestAccess");
const seasons_service_1 = require("../../services/seasons.service");
const auditLog_service_1 = require("../../services/auditLog.service");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
exports.ipmRouter = (0, express_1.Router)();
exports.ipmRouter.use(auth_1.auth);
exports.ipmRouter.use('/work-orders', workOrder_routes_1.workOrderRouter);
exports.ipmRouter.use('/product-catalog/gap-pdfs', pppMsds_routes_1.pppMsdsRouter);
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
// ─── Pesticide Products ──────────────────────────────────────────
exports.ipmRouter.get('/pesticide-products/foundation', async (req, res, next) => {
    try {
        const data = await ipmService.listFoundationPesticideProducts();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/pesticide-products/active', async (req, res, next) => {
    try {
        const data = await ipmService.listActivePesticideProducts((0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-products/active/from-foundation/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const product = await ipmService.addPesticideFromFoundation((0, tenant_1.requireOrgId)(req), req.params.id, req.user.userId);
        res.status(201).json({ success: true, data: product });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/pesticide-products', async (req, res, next) => {
    try {
        const data = await ipmService.listActivePesticideProducts((0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-products', auth_1.requireManager, async (req, res, next) => {
    try {
        const product = await ipmService.createPesticideProduct({
            ...req.body,
            organizationId: (0, tenant_1.requireOrgId)(req),
            createdBy: req.user.userId,
        });
        res.status(201).json({ success: true, data: product });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/pesticide-products/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const product = await ipmService.updatePesticideProductForOrg(req.params.id, (0, tenant_1.requireOrgId)(req), req.body, req.user.userId);
        res.json({ success: true, data: product });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.delete('/pesticide-products/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await ipmService.deletePesticideProductForOrg(req.params.id, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
// ─── Site-Scoped Pesticide Products ──────────────────────────────
exports.ipmRouter.get('/pesticide-products/site/:siteId', async (req, res, next) => {
    try {
        const { siteId } = req.params;
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const search = (req.query.search || '').trim();
        let where = `spp.site_id = $1`;
        const params = [siteId];
        if (search) {
            params.push(`%${search}%`);
            where += ` AND (pp.name ILIKE $2 OR pp.active_ingredient ILIKE $2)`;
        }
        const result = await client_1.dbPool.query(`SELECT pp.id, pp.name, pp.active_ingredient, pp.formulation_type,
              pp.phi_days, pp.manufacturer, pp.is_active,
              spp.unit_price AS site_price, spp.is_active AS site_active, spp.id AS site_product_id
       FROM site_pesticide_products spp
       JOIN pesticide_products pp ON pp.id = spp.product_id
       WHERE ${where}
       ORDER BY pp.name`, params);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/pesticide-products/browse', async (req, res, next) => {
    try {
        const data = await ipmService.listFoundationPesticideProducts();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-products/site/:siteId/assign', async (req, res, next) => {
    try {
        const { siteId } = req.params;
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const { productIds, unitPrice } = zod_1.z.object({
            productIds: zod_1.z.array(zod_1.z.string().uuid()),
            unitPrice: zod_1.z.number().optional().nullable(),
        }).parse(req.body);
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            let added = 0;
            for (const pid of productIds) {
                const r = await client.query(`INSERT INTO site_pesticide_products (site_id, product_id, unit_price)
           VALUES ($1, $2, $3)
           ON CONFLICT (site_id, product_id) DO NOTHING
           RETURNING id`, [siteId, pid, unitPrice ?? null]);
                if (r.rowCount && r.rowCount > 0)
                    added++;
            }
            await client.query('COMMIT');
            res.json({ success: true, data: { added } });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/pesticide-products/site/:siteId/:productId', async (req, res, next) => {
    try {
        const { siteId, productId } = req.params;
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        const { unitPrice } = zod_1.z.object({
            unitPrice: zod_1.z.number().optional().nullable(),
        }).parse(req.body);
        const result = await client_1.dbPool.query(`UPDATE site_pesticide_products SET unit_price = $1
       WHERE site_id = $2 AND product_id = $3 RETURNING *`, [unitPrice ?? null, siteId, productId]);
        res.json({ success: true, data: result.rows[0] || null });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.delete('/pesticide-products/site/:siteId/:productId', async (req, res, next) => {
    try {
        const { siteId, productId } = req.params;
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, (0, tenant_1.requireOrgId)(req));
        await client_1.dbPool.query(`DELETE FROM site_pesticide_products WHERE site_id = $1 AND product_id = $2`, [siteId, productId]);
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
// ─── Pesticide Applications ──────────────────────────────────────
const listAppSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    status: zod_1.z.enum(['pending', 'approved', 'rejected']).optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    variety: zod_1.z.string().optional(),
    justification: zod_1.z.string().optional(),
    template_id: zod_1.z.string().uuid().optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
exports.ipmRouter.get('/pesticide-applications', (0, validate_1.validate)({ query: listAppSchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, status, start_date, end_date, search, variety, justification, template_id, site_id } = req.query;
        const result = await ipmService.listPesticideApplications({
            fieldId: field_id, status, startDate: start_date, endDate: end_date, search, variety, justification, templateId: template_id, siteId: site_id, page, limit,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-applications', async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanCreateApplication)(actor);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const siteId = req.body.siteId || null;
        if (req.body.fieldId)
            await (0, tenantValidation_1.assertFieldInOrganization)(req.body.fieldId, orgId);
        if (siteId)
            await (0, tenantValidation_1.assertSiteInOrganization)(siteId, orgId);
        const body = { ...req.body, organizationId: req.body.organizationId || orgId };
        const app = await ipmService.createPesticideApplication(body, actor, siteId);
        (0, websocket_1.emitDataChange)('pesticide_application', 'create', app);
        res.status(201).json({ success: true, data: app });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-applications/bulk', async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanCreateApplication)(actor);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const { rows, siteId } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ success: false, error: 'rows must be a non-empty array' });
        }
        if (rows.length > 1000) {
            return res.status(400).json({ success: false, error: 'Maximum 1000 rows per bulk import' });
        }
        if (siteId)
            await (0, tenantValidation_1.assertSiteInOrganization)(siteId, orgId);
        const fieldIds = [...new Set(rows.map((r) => r.fieldId).filter(Boolean))];
        for (const fieldId of fieldIds) {
            await (0, tenantValidation_1.assertFieldInOrganization)(fieldId, orgId);
        }
        const enriched = rows.map((r) => ({
            ...r,
            organizationId: r.organizationId || orgId,
        }));
        const result = await ipmService.bulkCreatePesticideApplications(enriched, actor, siteId || null);
        if (res.headersSent)
            return;
        res.status(201).json({ success: true, data: result });
    }
    catch (error) {
        if (res.headersSent)
            return;
        next(error);
    }
});
const bulkIdsSchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(2000),
});
const createdTodayQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
    template_id: zod_1.z.string().uuid().optional(),
});
const deleteCreatedTodaySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    templateId: zod_1.z.string().uuid().optional(),
});
exports.ipmRouter.post('/pesticide-applications/bulk-delete', (0, validate_1.validate)({ body: bulkIdsSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanDirectEditDelete)(actor);
        const { ids } = req.body;
        const deleted = await ipmService.bulkDeletePesticideApplications(ids, (0, tenant_1.requireOrgId)(req));
        await (0, auditLog_service_1.logAuditEvent)({
            userId: actor.userId,
            action: 'DELETE',
            entity: 'pesticide_application',
            entityId: ids[0],
            metadata: { type: 'bulk_delete', count: deleted },
        });
        (0, websocket_1.emitDataChange)('pesticide_application', 'delete', { bulk: true, ids });
        res.json({ success: true, data: { deleted } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-applications/bulk-approve', (0, validate_1.validate)({ body: bulkIdsSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanApproveApplication)(actor);
        const { ids } = req.body;
        const approved = await ipmService.bulkApprovePesticideApplications(ids, req.user.userId, (0, tenant_1.requireOrgId)(req));
        (0, websocket_1.emitDataChange)('pesticide_application', 'update', { bulk: true, ids });
        res.json({ success: true, data: { approved } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/pesticide-applications/created-today', (0, validate_1.validate)({ query: createdTodayQuerySchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanDirectEditDelete)(actor);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const query = req.query;
        await (0, tenantValidation_1.assertSiteInOrganization)(query.site_id, orgId);
        const count = await ipmService.countPesticideApplicationsCreatedToday({
            organizationId: orgId,
            siteId: query.site_id,
            templateId: query.template_id,
        });
        res.json({ success: true, data: { count } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/pesticide-applications/delete-created-today', (0, validate_1.validate)({ body: deleteCreatedTodaySchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanDirectEditDelete)(actor);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const { siteId, templateId } = req.body;
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, orgId);
        const deleted = await ipmService.deletePesticideApplicationsCreatedToday({
            organizationId: orgId,
            siteId,
            templateId,
        });
        await (0, auditLog_service_1.logAuditEvent)({
            userId: actor.userId,
            action: 'DELETE',
            entity: 'pesticide_application',
            entityId: siteId,
            metadata: { type: 'delete_created_today', count: deleted, templateId: templateId || null },
        });
        (0, websocket_1.emitDataChange)('pesticide_application', 'delete', { bulk: true, createdToday: true, siteId, templateId });
        res.json({ success: true, data: { deleted } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/pesticide-applications/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanDirectEditDelete)(actor);
        const siteId = req.body.siteId || null;
        const app = await ipmService.updatePesticideApplication(req.params.id, req.body, req.user.userId, siteId);
        await (0, auditLog_service_1.logAuditEvent)({
            userId: actor.userId,
            action: 'UPDATE',
            entity: 'pesticide_application',
            entityId: req.params.id,
            metadata: { type: 'direct_edit' },
        });
        (0, websocket_1.emitDataChange)('pesticide_application', 'update', app);
        res.json({ success: true, data: app });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.delete('/pesticide-applications/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanDirectEditDelete)(actor);
        await ipmService.deletePesticideApplication(req.params.id);
        await (0, auditLog_service_1.logAuditEvent)({
            userId: actor.userId,
            action: 'DELETE',
            entity: 'pesticide_application',
            entityId: req.params.id,
            metadata: { type: 'direct_delete' },
        });
        (0, websocket_1.emitDataChange)('pesticide_application', 'delete', { id: req.params.id });
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
// Approve - pest agronomist or IPM admin only
exports.ipmRouter.post('/pesticide-applications/:id/approve', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanApproveApplication)(actor);
        const app = await ipmService.approvePesticideApplication(req.params.id, req.user.userId);
        (0, websocket_1.emitDataChange)('pesticide_application', 'update', app);
        res.json({ success: true, data: app });
    }
    catch (error) {
        next(error);
    }
});
// Reject - pest agronomist or IPM admin only
exports.ipmRouter.post('/pesticide-applications/:id/reject', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        (0, ipmAccess_1.assertCanApproveApplication)(actor);
        const app = await ipmService.rejectPesticideApplication(req.params.id, req.user.userId, req.body.reason);
        (0, websocket_1.emitDataChange)('pesticide_application', 'update', app);
        res.json({ success: true, data: app });
    }
    catch (error) {
        next(error);
    }
});
// ─── IPM Change Requests (Gate 2) ────────────────────────────────
const changeRequestSchema = zod_1.z.object({
    entityType: zod_1.z.enum(['pesticide_application', 'bumble_bee_box_inspection', 'manpower_record']).optional(),
    entityId: zod_1.z.string().uuid().optional(),
    entityIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).optional(),
    action: zod_1.z.enum(['update', 'delete']),
    reason: zod_1.z.string().min(1),
    proposedPayload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable(),
    siteId: zod_1.z.string().uuid().optional().nullable(),
}).refine((data) => Boolean(data.entityId || data.entityIds?.length), {
    message: 'entityId or entityIds is required',
}).refine((data) => !(data.entityIds && data.entityIds.length > 1 && data.action !== 'delete'), {
    message: 'Bulk change requests are only supported for deletes',
});
const listChangeRequestSchema = zod_1.z.object({
    status: zod_1.z.enum(['pending', 'approved', 'rejected']).optional(),
    entity_id: zod_1.z.string().uuid().optional(),
    entity_type: zod_1.z.enum(['pesticide_application', 'bumble_bee_box_inspection', 'manpower_record']).optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    offset: zod_1.z.coerce.number().int().min(0).optional(),
});
exports.ipmRouter.post('/change-requests', async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        const body = changeRequestSchema.parse(req.body);
        const request = await ipmChangeRequestService.createChangeRequest(actor, {
            entityType: body.entityType,
            entityId: body.entityId || body.entityIds?.[0],
            entityIds: body.entityIds,
            action: body.action,
            reason: body.reason,
            proposedPayload: body.proposedPayload ?? null,
            siteId: body.siteId ?? null,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.status(201).json({ success: true, data: request });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/change-requests', (0, validate_1.validate)({ query: listChangeRequestSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        if (!(0, changeRequestAccess_1.canListChangeRequests)(actor)) {
            return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
        }
        const { status, entity_id, entity_type, limit, offset } = req.query;
        const data = await ipmChangeRequestService.listChangeRequests(actor, {
            status, entityId: entity_id, entityType: entity_type, limit, offset,
        });
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/change-requests/:id/approve', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        const request = await ipmChangeRequestService.reviewChangeRequest(actor, req.params.id, 'approved', req.body.reviewerComment, req.body.siteId);
        const emitEntity = request.entityType === ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION
            ? 'bumble_bee_box_inspection'
            : request.entityType === changeRequestAccess_1.ENTITY_MANPOWER_RECORD
                ? 'manpower_record'
                : 'pesticide_application';
        (0, websocket_1.emitDataChange)(emitEntity, 'update', { id: request.entityId });
        res.json({ success: true, data: request });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/change-requests/:id/reject', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        const request = await ipmChangeRequestService.reviewChangeRequest(actor, req.params.id, 'rejected', req.body.reviewerComment);
        res.json({ success: true, data: request });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/change-requests/pending-count', async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const counts = await ipmChangeRequestService.countPendingChangeRequests(orgId);
        const seasonReopenCount = await (0, seasons_service_1.countPendingSeasonReopenRequests)(orgId);
        const merged = {
            ...counts,
            seasonReopenCount,
            totalCount: counts.totalCount + seasonReopenCount,
        };
        const badgeCount = (0, changeRequestAccess_1.badgeCountForRole)(actor, merged);
        res.json({ success: true, data: { ...merged, badgeCount } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/change-requests/pending/:entityId', async (req, res, next) => {
    try {
        const entityType = req.query.entity_type || 'pesticide_application';
        const data = await ipmChangeRequestService.getPendingRequestForEntity(entityType, req.params.entityId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
// ─── PHI Status ──────────────────────────────────────────────────
exports.ipmRouter.get('/phi-status', async (req, res, next) => {
    try {
        const fieldId = req.query.field_id;
        const siteId = req.query.site_id;
        const orgId = (0, tenant_1.requireOrgId)(req);
        if (siteId)
            await (0, tenantValidation_1.assertSiteInOrganization)(siteId, orgId);
        if (fieldId)
            await (0, tenantValidation_1.assertFieldInOrganization)(fieldId, orgId);
        const data = await ipmService.getPHIStatus(orgId, fieldId, siteId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
// ─── Crop-Specific PHI ───────────────────────────────────────────
exports.ipmRouter.get('/site/:siteId/crop-phi', async (req, res, next) => {
    try {
        await (0, tenantValidation_1.assertSiteInOrganization)(req.params.siteId, (0, tenant_1.requireOrgId)(req));
        const data = await ipmService.listSiteProductCropPhi(req.params.siteId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/site/:siteId/crop-phi', async (req, res, next) => {
    try {
        await (0, tenantValidation_1.assertSiteInOrganization)(req.params.siteId, (0, tenant_1.requireOrgId)(req));
        const { productId, cropName, phiDays } = req.body;
        if (!productId || !cropName || phiDays == null) {
            return res.status(400).json({ success: false, error: 'productId, cropName, and phiDays are required' });
        }
        const entry = await ipmService.upsertSiteProductCropPhi(req.params.siteId, productId, cropName, Number(phiDays), req.user.userId);
        res.status(201).json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/site/:siteId/crop-phi/bulk-copy', async (req, res, next) => {
    try {
        await (0, tenantValidation_1.assertSiteInOrganization)(req.params.siteId, (0, tenant_1.requireOrgId)(req));
        const { entries } = req.body;
        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ success: false, error: 'entries array is required' });
        }
        const copied = await ipmService.bulkCopySiteProductCropPhi(req.params.siteId, entries, req.user.userId);
        res.status(201).json({ success: true, data: { copied } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.delete('/crop-phi/:id', async (req, res, next) => {
    try {
        await ipmService.deleteSiteProductCropPhi(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/pesticide-products/:productId/crop-phi/other-sites', async (req, res, next) => {
    try {
        const excludeSite = req.query.excludeSite;
        if (!excludeSite)
            return res.status(400).json({ success: false, error: 'excludeSite query param required' });
        const orgId = (0, tenant_1.requireOrgId)(req);
        await (0, tenantValidation_1.assertSiteInOrganization)(excludeSite, orgId);
        const data = await ipmService.getOtherSitesCropPhi(req.params.productId, excludeSite, orgId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
// ─── Bio Control Products ────────────────────────────────────────
exports.ipmRouter.get('/bio-products', async (_req, res, next) => {
    try {
        const data = await ipmService.listBioProducts();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/bio-products', auth_1.requireManager, async (req, res, next) => {
    try {
        const product = await ipmService.createBioProduct({ ...req.body, createdBy: req.user.userId });
        res.status(201).json({ success: true, data: product });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/bio-products/:id', auth_1.requireManager, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const product = await ipmService.updateBioProduct(req.params.id, req.body);
        res.json({ success: true, data: product });
    }
    catch (error) {
        next(error);
    }
});
// ─── Bio Control Releases ────────────────────────────────────────
const listReleaseSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    product_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
exports.ipmRouter.get('/bio-releases', (0, validate_1.validate)({ query: listReleaseSchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, product_id, start_date, end_date, site_id } = req.query;
        const result = await ipmService.listBioReleases({
            fieldId: field_id, productId: product_id, startDate: start_date, endDate: end_date, siteId: site_id, page, limit,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/bio-releases', async (req, res, next) => {
    try {
        const release = await ipmService.createBioRelease(req.body, req.user.userId);
        (0, websocket_1.emitDataChange)('bio_release', 'create', release);
        res.status(201).json({ success: true, data: release });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/bio-releases/:id/effectiveness', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const data = await ipmService.getBioReleaseEffectiveness(req.params.id);
        if (!data)
            return res.status(404).json({ success: false, error: { message: 'Release not found' } });
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
// ─── Bumble Bees ─────────────────────────────────────────────────
const bbDeploymentBodySchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    datePlaced: zod_1.z.string().min(1),
    boxesBefore: zod_1.z.coerce.number().int().min(0).optional().nullable(),
    boxesRemoved: zod_1.z.coerce.number().int().min(0).optional(),
    boxesAdded: zod_1.z.coerce.number().int().min(0).optional(),
    boxCount: zod_1.z.coerce.number().int().min(0).optional(),
    notes: zod_1.z.string().optional().nullable(),
});
const bbInspectionBodySchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid().optional(),
    inspectionDate: zod_1.z.string().min(1),
    boxes100: zod_1.z.coerce.number().int().min(0).optional(),
    boxes80: zod_1.z.coerce.number().int().min(0).optional(),
    boxes60: zod_1.z.coerce.number().int().min(0).optional(),
    boxes40: zod_1.z.coerce.number().int().min(0).optional(),
    boxes20: zod_1.z.coerce.number().int().min(0).optional(),
    boxes0: zod_1.z.coerce.number().int().min(0).optional(),
    notes: zod_1.z.string().optional().nullable(),
});
const bbInventoryBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    quantityOnHand: zod_1.z.coerce.number().min(0),
});
const bbIncomingOrderBodySchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    expectedDate: zod_1.z.string().min(1).optional().nullable(),
    quantityExpected: zod_1.z.coerce.number().int().positive(),
    supplier: zod_1.z.string().optional().nullable(),
    notes: zod_1.z.string().optional().nullable(),
});
const listBBSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    active_only: zod_1.z.coerce.boolean().optional(),
    site_id: zod_1.z.string().uuid().optional(),
});
exports.ipmRouter.get('/bumble-bees', (0, validate_1.validate)({ query: listBBSchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, active_only, site_id } = req.query;
        const result = await ipmService.listBumbleBeeDeployments({
            fieldId: field_id, activeOnly: active_only, siteId: site_id, page, limit,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/bumble-bees', (0, validate_1.validate)({ body: bbDeploymentBodySchema }), async (req, res, next) => {
    try {
        const deployment = await ipmService.createBumbleBeeDeployment({ ...req.body, organizationId: (0, tenant_1.requireOrgId)(req) }, req.user.userId);
        (0, websocket_1.emitDataChange)('bumble_bee', 'create', deployment);
        res.status(201).json({ success: true, data: deployment });
    }
    catch (error) {
        next(error);
    }
});
const bbSiteQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid(),
});
exports.ipmRouter.get('/bumble-bees/inventory', (0, validate_1.validate)({ query: bbSiteQuerySchema }), async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        const data = await ipmService.getBumbleBeeInventory(siteId, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/bumble-bees/inventory', (0, validate_1.validate)({ body: bbInventoryBodySchema }), async (req, res, next) => {
    try {
        const { siteId, quantityOnHand } = req.body;
        const row = await ipmService.setBumbleBeeInventory(siteId, (0, tenant_1.requireOrgId)(req), Number(quantityOnHand), req.user.userId);
        res.json({ success: true, data: row });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/bumble-bees/incoming-orders', (0, validate_1.validate)({ query: bbSiteQuerySchema }), async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        const items = await ipmService.listBumbleBeeIncomingOrders(siteId, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data: items });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/bumble-bees/incoming-orders', (0, validate_1.validate)({ body: bbIncomingOrderBodySchema }), async (req, res, next) => {
    try {
        const order = await ipmService.createBumbleBeeIncomingOrder({ ...req.body, organizationId: (0, tenant_1.requireOrgId)(req) }, req.user.userId);
        res.status(201).json({ success: true, data: order });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/bumble-bees/incoming-orders/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const order = await ipmService.updateBumbleBeeIncomingOrder(req.params.id, req.body);
        res.json({ success: true, data: order });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/bumble-bees/incoming-orders/:id/receive', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const { receivedDate, quantityReceived } = req.body || {};
        const result = await ipmService.receiveBumbleBeeIncomingOrder(req.params.id, req.user.userId, { receivedDate, quantityReceived });
        res.json({ success: true, data: result });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/bumble-bees/last-for-field', (0, validate_1.validate)({ query: zod_1.z.object({ field_id: zod_1.z.string().uuid() }) }), async (req, res, next) => {
    try {
        const fieldId = req.query.field_id;
        const last = await ipmService.getBumbleBeeLastForField(fieldId);
        res.json({ success: true, data: last });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.get('/bumble-bees/inspections', (0, validate_1.validate)({ query: bbSiteQuerySchema }), async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        const items = await ipmService.listBumbleBeeInspections({
            siteId,
            organizationId: (0, tenant_1.requireOrgId)(req),
            limit: 500,
        });
        res.json({ success: true, data: items });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.post('/bumble-bees/inspections', (0, validate_1.validate)({ body: bbInspectionBodySchema }), async (req, res, next) => {
    try {
        if (req.user.role !== 'scouter') {
            return res.status(403).json({ success: false, error: { message: 'Only scouters can create bumble bee inspections' } });
        }
        const row = await ipmService.createBumbleBeeBoxInspection({ ...req.body, organizationId: (0, tenant_1.requireOrgId)(req) }, req.user.userId);
        res.status(201).json({ success: true, data: row });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/bumble-bees/inspections/:id', (0, validate_1.validate)({ params: idSchema, body: bbInspectionBodySchema.partial() }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        const existing = await ipmService.getBumbleBeeBoxInspection(req.params.id);
        (0, ipmAccess_1.assertScouterDirectInspectionModify)(actor, existing);
        const row = await ipmService.updateBumbleBeeBoxInspection(req.params.id, req.body);
        res.json({ success: true, data: row });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.delete('/bumble-bees/inspections/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const actor = (0, ipmAccess_1.toIpmActor)(req.user);
        const existing = await ipmService.getBumbleBeeBoxInspection(req.params.id);
        (0, ipmAccess_1.assertScouterDirectInspectionModify)(actor, existing);
        await ipmService.deleteBumbleBeeBoxInspection(req.params.id);
        res.json({ success: true, data: { id: req.params.id } });
    }
    catch (error) {
        next(error);
    }
});
exports.ipmRouter.put('/bumble-bees/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const deployment = await ipmService.updateBumbleBeeDeployment(req.params.id, req.body);
        (0, websocket_1.emitDataChange)('bumble_bee', 'update', deployment);
        res.json({ success: true, data: deployment });
    }
    catch (error) {
        next(error);
    }
});
// ─── Field Overview ──────────────────────────────────────────────
exports.ipmRouter.get('/field-overview', async (req, res, next) => {
    try {
        const siteId = req.query.site_id;
        const dateFrom = req.query.date_from;
        const dateTo = req.query.date_to;
        const data = await ipmService.getFieldOverview((0, tenant_1.requireOrgId)(req), siteId, dateFrom, dateTo);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
