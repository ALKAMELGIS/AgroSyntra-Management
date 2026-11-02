import { Router } from 'express';
import { z } from 'zod';
import * as ipmService from '../../services/ipm.service';
import * as ipmChangeRequestService from '../../services/ipmChangeRequest.service';
import { validate } from '../middleware/validate';
import { AuthRequest, auth } from '../middleware/auth';
import { emitDataChange } from '../../websocket';
import { dbPool } from '../../db/client';
import { workOrderRouter } from './workOrder.routes';
import { pppMsdsRouter } from './pppMsds.routes';
import {
  assertCanApproveApplication,
  assertCanCreateApplication,
  assertCanDirectEditDelete,
  canManageBio,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  requireIpmCatalogEditor,
  resolveBumbleBeeWriteMode,
  toIpmActor,
} from '../../utils/ipmAccess';
import {
  badgeCountForRole,
  canListChangeRequests,
  ENTITY_BIO_FIELD_SETUP,
  ENTITY_MANPOWER_RECORD,
  isBumbleBeeEntityType,
} from '../../utils/changeRequestAccess';
import { countPendingSeasonReopenRequests } from '../../services/seasons.service';
import { logAuditEvent } from '../../services/auditLog.service';
import { requireOrgId } from '../middleware/tenant';
import { AppError } from '../../utils/errors';
import { assertFieldInOrganization, assertSiteInOrganization } from '../../utils/tenantValidation';

export const ipmRouter = Router();
ipmRouter.use(auth);

ipmRouter.use('/work-orders', workOrderRouter);
ipmRouter.use('/product-catalog/gap-pdfs', pppMsdsRouter);

const idSchema = z.object({ id: z.string().uuid() });

// ─── Pesticide Products ──────────────────────────────────────────

ipmRouter.get('/pesticide-products/foundation', async (req: AuthRequest, res, next) => {
  try {
    const data = await ipmService.listFoundationPesticideProducts();
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.get('/pesticide-products/active', async (req: AuthRequest, res, next) => {
  try {
    const data = await ipmService.listActivePesticideProducts(requireOrgId(req));
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.post('/pesticide-products/active/from-foundation/:id', requireIpmCatalogEditor, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const product = await ipmService.addPesticideFromFoundation(
      requireOrgId(req),
      req.params.id,
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
});

ipmRouter.get('/pesticide-products', async (req: AuthRequest, res, next) => {
  try {
    const data = await ipmService.listActivePesticideProducts(requireOrgId(req));
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.post('/pesticide-products', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    const product = await ipmService.createPesticideProduct({
      ...req.body,
      organizationId: requireOrgId(req),
      createdBy: req.user!.userId,
    });
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
});

ipmRouter.put('/pesticide-products/:id', requireIpmCatalogEditor, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const product = await ipmService.updatePesticideProductForOrg(
      req.params.id,
      requireOrgId(req),
      req.body,
      req.user!.userId,
    );
    res.json({ success: true, data: product });
  } catch (error) { next(error); }
});

ipmRouter.delete('/pesticide-products/:id', requireIpmCatalogEditor, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    await ipmService.deletePesticideProductForOrg(req.params.id, requireOrgId(req));
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

// ─── Site-Scoped Pesticide Products ──────────────────────────────

ipmRouter.get('/pesticide-products/site/:siteId', async (req: AuthRequest, res, next) => {
  try {
    const { siteId } = req.params;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const search = ((req.query.search as string) || '').trim();
    let where = `spp.site_id = $1`;
    const params: any[] = [siteId];
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (pp.name ILIKE $2 OR pp.active_ingredient ILIKE $2)`;
    }
    const result = await dbPool.query(
      `SELECT pp.id, pp.name, pp.active_ingredient, pp.formulation_type,
              pp.phi_days, pp.manufacturer, pp.is_active,
              spp.unit_price AS site_price, spp.is_active AS site_active, spp.id AS site_product_id
       FROM site_pesticide_products spp
       JOIN pesticide_products pp ON pp.id = spp.product_id
       WHERE ${where}
       ORDER BY pp.name`,
      params,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

ipmRouter.get('/pesticide-products/browse', async (req: AuthRequest, res, next) => {
  try {
    const data = await ipmService.listFoundationPesticideProducts();
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.post('/pesticide-products/site/:siteId/assign', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    const { siteId } = req.params;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const { productIds, unitPrice } = z.object({
      productIds: z.array(z.string().uuid()),
      unitPrice: z.number().optional().nullable(),
    }).parse(req.body);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      let added = 0;
      for (const pid of productIds) {
        const r = await client.query(
          `INSERT INTO site_pesticide_products (site_id, product_id, unit_price)
           VALUES ($1, $2, $3)
           ON CONFLICT (site_id, product_id) DO NOTHING
           RETURNING id`,
          [siteId, pid, unitPrice ?? null],
        );
        if (r.rowCount && r.rowCount > 0) added++;
      }
      await client.query('COMMIT');
      res.json({ success: true, data: { added } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

ipmRouter.put('/pesticide-products/site/:siteId/:productId', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    const { siteId, productId } = req.params;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const { unitPrice } = z.object({
      unitPrice: z.number().optional().nullable(),
    }).parse(req.body);

    const result = await dbPool.query(
      `UPDATE site_pesticide_products SET unit_price = $1
       WHERE site_id = $2 AND product_id = $3 RETURNING *`,
      [unitPrice ?? null, siteId, productId],
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) { next(error); }
});

ipmRouter.delete('/pesticide-products/site/:siteId/:productId', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    const { siteId, productId } = req.params;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    await dbPool.query(
      `DELETE FROM site_pesticide_products WHERE site_id = $1 AND product_id = $2`,
      [siteId, productId],
    );
    res.json({ success: true });
  } catch (error) { next(error); }
});

// ─── Pesticide Applications ──────────────────────────────────────

const listAppSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  search: z.string().optional(),
  variety: z.string().optional(),
  justification: z.string().optional(),
  template_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
});

ipmRouter.get('/pesticide-applications', validate({ query: listAppSchema }), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, field_id, status, start_date, end_date, search, variety, justification, template_id, site_id } = req.query as any;
    const result = await ipmService.listPesticideApplications({
      fieldId: field_id, status, startDate: start_date, endDate: end_date, search, variety, justification, templateId: template_id, siteId: site_id, page, limit,
      organizationId: requireOrgId(req),
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) { next(error); }
});

ipmRouter.post('/pesticide-applications', async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    assertCanCreateApplication(actor);
    const orgId = requireOrgId(req);
    const siteId = req.body.siteId || null;
    if (req.body.fieldId) await assertFieldInOrganization(req.body.fieldId, orgId);
    if (siteId) await assertSiteInOrganization(siteId, orgId);
    const body = { ...req.body, organizationId: req.body.organizationId || orgId };
    const app = await ipmService.createPesticideApplication(body, actor, siteId);
    emitDataChange('pesticide_application', 'create', app);
    res.status(201).json({ success: true, data: app });
  } catch (error) { next(error); }
});

ipmRouter.post('/pesticide-applications/bulk', async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    assertCanCreateApplication(actor);
    const orgId = requireOrgId(req);
    const { rows, siteId } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'rows must be a non-empty array' });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ success: false, error: 'Maximum 1000 rows per bulk import' });
    }
    if (siteId) await assertSiteInOrganization(siteId, orgId);
    const fieldIds = [...new Set(rows.map((r: { fieldId?: string }) => r.fieldId).filter(Boolean))] as string[];
    for (const fieldId of fieldIds) {
      await assertFieldInOrganization(fieldId, orgId);
    }
    const enriched = rows.map((r: any) => ({
      ...r,
      organizationId: r.organizationId || orgId,
    }));
    const result = await ipmService.bulkCreatePesticideApplications(enriched, actor, siteId || null);
    if (res.headersSent) return;
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (res.headersSent) return;
    next(error);
  }
});

const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
});

const createdTodayQuerySchema = z.object({
  site_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
});

const deleteCreatedTodaySchema = z.object({
  siteId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
});

ipmRouter.post('/pesticide-applications/bulk-delete', validate({ body: bulkIdsSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    assertCanDirectEditDelete(actor);
    const { ids } = req.body as z.infer<typeof bulkIdsSchema>;
    const deleted = await ipmService.bulkDeletePesticideApplications(ids, requireOrgId(req));
    await logAuditEvent({
      userId: actor.userId,
      action: 'DELETE',
      entity: 'pesticide_application',
      entityId: ids[0],
      metadata: { type: 'bulk_delete', count: deleted },
    });
    emitDataChange('pesticide_application', 'delete', { bulk: true, ids });
    res.json({ success: true, data: { deleted } });
  } catch (error) { next(error); }
});

ipmRouter.post('/pesticide-applications/bulk-approve', validate({ body: bulkIdsSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    assertCanApproveApplication(actor);
    const { ids } = req.body as z.infer<typeof bulkIdsSchema>;
    const approved = await ipmService.bulkApprovePesticideApplications(ids, req.user!.userId, requireOrgId(req));
    emitDataChange('pesticide_application', 'update', { bulk: true, ids });
    res.json({ success: true, data: { approved } });
  } catch (error) { next(error); }
});

ipmRouter.get(
  '/pesticide-applications/created-today',
  validate({ query: createdTodayQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const actor = toIpmActor(req.user!);
      assertCanDirectEditDelete(actor);
      const orgId = requireOrgId(req);
      const query = req.query as z.infer<typeof createdTodayQuerySchema>;
      await assertSiteInOrganization(query.site_id, orgId);
      const count = await ipmService.countPesticideApplicationsCreatedToday({
        organizationId: orgId,
        siteId: query.site_id,
        templateId: query.template_id,
      });
      res.json({ success: true, data: { count } });
    } catch (error) { next(error); }
  },
);

ipmRouter.post(
  '/pesticide-applications/delete-created-today',
  validate({ body: deleteCreatedTodaySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const actor = toIpmActor(req.user!);
      assertCanDirectEditDelete(actor);
      const orgId = requireOrgId(req);
      const { siteId, templateId } = req.body as z.infer<typeof deleteCreatedTodaySchema>;
      await assertSiteInOrganization(siteId, orgId);
      const deleted = await ipmService.deletePesticideApplicationsCreatedToday({
        organizationId: orgId,
        siteId,
        templateId,
      });
      await logAuditEvent({
        userId: actor.userId,
        action: 'DELETE',
        entity: 'pesticide_application',
        entityId: siteId,
        metadata: { type: 'delete_created_today', count: deleted, templateId: templateId || null },
      });
      emitDataChange('pesticide_application', 'delete', { bulk: true, createdToday: true, siteId, templateId });
      res.json({ success: true, data: { deleted } });
    } catch (error) { next(error); }
  },
);

ipmRouter.put('/pesticide-applications/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    assertCanDirectEditDelete(actor);
    const siteId = req.body.siteId || null;
    const app = await ipmService.updatePesticideApplication(req.params.id, req.body, req.user!.userId, siteId);
    await logAuditEvent({
      userId: actor.userId,
      action: 'UPDATE',
      entity: 'pesticide_application',
      entityId: req.params.id,
      metadata: { type: 'direct_edit' },
    });
    emitDataChange('pesticide_application', 'update', app);
    res.json({ success: true, data: app });
  } catch (error) { next(error); }
});

ipmRouter.delete('/pesticide-applications/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    assertCanDirectEditDelete(actor);
    await ipmService.deletePesticideApplication(req.params.id);
    await logAuditEvent({
      userId: actor.userId,
      action: 'DELETE',
      entity: 'pesticide_application',
      entityId: req.params.id,
      metadata: { type: 'direct_delete' },
    });
    emitDataChange('pesticide_application', 'delete', { id: req.params.id });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// Approve - pest agronomist or IPM admin only
ipmRouter.post('/pesticide-applications/:id/approve',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const actor = toIpmActor(req.user!);
      assertCanApproveApplication(actor);
      const app = await ipmService.approvePesticideApplication(req.params.id, req.user!.userId);
      emitDataChange('pesticide_application', 'update', app);
      res.json({ success: true, data: app });
    } catch (error) { next(error); }
  }
);

// Reject - pest agronomist or IPM admin only
ipmRouter.post('/pesticide-applications/:id/reject',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const actor = toIpmActor(req.user!);
      assertCanApproveApplication(actor);
      const app = await ipmService.rejectPesticideApplication(req.params.id, req.user!.userId, req.body.reason);
      emitDataChange('pesticide_application', 'update', app);
      res.json({ success: true, data: app });
    } catch (error) { next(error); }
  }
);

// ─── IPM Change Requests (Gate 2) ────────────────────────────────

const CHANGE_REQUEST_ENTITY_TYPES = [
  'pesticide_application',
  'bumble_bee_box_inspection',
  'manpower_record',
  'bio_field_setup',
  'bumble_bee_deployment',
  'bumble_bee_inventory',
  'bumble_bee_order',
] as const;

const changeRequestSchema = z.object({
  entityType: z.enum(CHANGE_REQUEST_ENTITY_TYPES).optional(),
  entityId: z.string().uuid().optional(),
  entityIds: z.array(z.string().uuid()).min(1).optional(),
  // create / set have no existing record: a new bumble-bee deployment or order, a boxes-on-hand count.
  action: z.enum(['update', 'delete', 'create', 'set', 'receive']),
  reason: z.string().min(1),
  proposedPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
  resubmitOf: z.string().uuid().optional().nullable(),
}).refine((data) => Boolean(data.entityId || data.entityIds?.length || data.action === 'create' || data.action === 'set'), {
  message: 'entityId or entityIds is required',
}).refine((data) => !(data.entityIds && data.entityIds.length > 1 && data.action !== 'delete'), {
  message: 'Bulk change requests are only supported for deletes',
});

const listChangeRequestSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  entity_id: z.string().uuid().optional(),
  entity_type: z.enum(CHANGE_REQUEST_ENTITY_TYPES).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

ipmRouter.post('/change-requests', async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    const body = changeRequestSchema.parse(req.body);
    const request = await ipmChangeRequestService.createChangeRequest(actor, {
      entityType: body.entityType,
      entityId: body.entityId || body.entityIds?.[0],
      entityIds: body.entityIds,
      action: body.action,
      reason: body.reason,
      proposedPayload: body.proposedPayload ?? null,
      siteId: body.siteId ?? null,
      organizationId: requireOrgId(req),
      resubmitOf: body.resubmitOf ?? null,
    });
    res.status(201).json({ success: true, data: request });
  } catch (error) { next(error); }
});

ipmRouter.get('/change-requests', validate({ query: listChangeRequestSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    if (!canListChangeRequests(actor)) {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    const { status, entity_id, entity_type, limit, offset } = req.query as any;
    const data = await ipmChangeRequestService.listChangeRequests(actor, {
      organizationId: requireOrgId(req),
      status, entityId: entity_id, entityType: entity_type, limit, offset,
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.post('/change-requests/:id/approve', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    const request = await ipmChangeRequestService.reviewChangeRequest(
      actor, req.params.id, 'approved', req.body.reviewerComment, req.body.siteId, requireOrgId(req),
    );
    const emitEntity = request.entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION
      ? 'bumble_bee_box_inspection'
      : isBumbleBeeEntityType(request.entityType)
        ? 'bumble_bee'
      : request.entityType === ENTITY_MANPOWER_RECORD
        ? 'manpower_record'
        : request.entityType === ENTITY_BIO_FIELD_SETUP
          ? 'bio_record'
          : 'pesticide_application';
    emitDataChange(emitEntity, 'update', { id: request.entityId });
    res.json({ success: true, data: request });
  } catch (error) { next(error); }
});

ipmRouter.post('/change-requests/:id/reject', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    const request = await ipmChangeRequestService.reviewChangeRequest(
      actor, req.params.id, 'rejected', req.body.reviewerComment, null, requireOrgId(req),
    );
    res.json({ success: true, data: request });
  } catch (error) { next(error); }
});

ipmRouter.get('/change-requests/pending-count', async (req: AuthRequest, res, next) => {
  try {
    const actor = toIpmActor(req.user!);
    const orgId = requireOrgId(req);
    const counts = await ipmChangeRequestService.countPendingChangeRequests(orgId);
    const seasonReopenCount = await countPendingSeasonReopenRequests(orgId);
    const merged = {
      ...counts,
      seasonReopenCount,
      totalCount: counts.totalCount + seasonReopenCount,
    };
    const badgeCount = badgeCountForRole(actor, merged);
    res.json({ success: true, data: { ...merged, badgeCount } });
  } catch (error) { next(error); }
});

ipmRouter.get('/change-requests/pending/:entityId', validate({ params: z.object({ entityId: z.string().uuid() }) }), async (req: AuthRequest, res, next) => {
  try {
    const entityType = (req.query.entity_type as string) || 'pesticide_application';
    const data = await ipmChangeRequestService.getPendingRequestForEntity(
      entityType,
      req.params.entityId,
      requireOrgId(req),
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// ─── PHI Status ──────────────────────────────────────────────────

ipmRouter.get('/phi-status', async (req: AuthRequest, res, next) => {
  try {
    const fieldId = req.query.field_id as string | undefined;
    const siteId = req.query.site_id as string | undefined;
    const orgId = requireOrgId(req);
    if (siteId) await assertSiteInOrganization(siteId, orgId);
    if (fieldId) await assertFieldInOrganization(fieldId, orgId);
    const data = await ipmService.getPHIStatus(orgId, fieldId, siteId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// ─── Crop-Specific PHI ───────────────────────────────────────────

ipmRouter.get('/site/:siteId/crop-phi', async (req: AuthRequest, res, next) => {
  try {
    await assertSiteInOrganization(req.params.siteId, requireOrgId(req));
    const data = await ipmService.listSiteProductCropPhi(req.params.siteId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.post('/site/:siteId/crop-phi', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    await assertSiteInOrganization(req.params.siteId, requireOrgId(req));
    const { productId, cropName, phiDays } = req.body;
    if (!productId || !cropName || phiDays == null) {
      return res.status(400).json({ success: false, error: 'productId, cropName, and phiDays are required' });
    }
    const entry = await ipmService.upsertSiteProductCropPhi(req.params.siteId, productId, cropName, Number(phiDays), req.user!.userId);
    res.status(201).json({ success: true, data: entry });
  } catch (error) { next(error); }
});

ipmRouter.post('/site/:siteId/crop-phi/bulk-copy', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    await assertSiteInOrganization(req.params.siteId, requireOrgId(req));
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'entries array is required' });
    }
    const copied = await ipmService.bulkCopySiteProductCropPhi(req.params.siteId, entries, req.user!.userId);
    res.status(201).json({ success: true, data: { copied } });
  } catch (error) { next(error); }
});

ipmRouter.delete('/crop-phi/:id', requireIpmCatalogEditor, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    await ipmService.deleteSiteProductCropPhi(req.params.id, requireOrgId(req));
    res.json({ success: true });
  } catch (error) { next(error); }
});

ipmRouter.get('/pesticide-products/:productId/crop-phi/other-sites', async (req: AuthRequest, res, next) => {
  try {
    const excludeSite = req.query.excludeSite as string;
    if (!excludeSite) return res.status(400).json({ success: false, error: 'excludeSite query param required' });
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(excludeSite, orgId);
    const data = await ipmService.getOtherSitesCropPhi(req.params.productId, excludeSite, orgId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// ─── Bio Control Products ────────────────────────────────────────

ipmRouter.get('/bio-products', async (_req, res, next) => {
  try {
    const data = await ipmService.listBioProducts();
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.post('/bio-products', requireIpmCatalogEditor, async (req: AuthRequest, res, next) => {
  try {
    const product = await ipmService.createBioProduct({ ...req.body, createdBy: req.user!.userId });
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
});

ipmRouter.put('/bio-products/:id', requireIpmCatalogEditor, validate({ params: idSchema }), async (req, res, next) => {
  try {
    const product = await ipmService.updateBioProduct(req.params.id, req.body);
    res.json({ success: true, data: product });
  } catch (error) { next(error); }
});

// ─── Bio Control Releases ────────────────────────────────────────

const listReleaseSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  site_id: z.string().uuid().optional(),
});

ipmRouter.get('/bio-releases', validate({ query: listReleaseSchema }), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, field_id, product_id, start_date, end_date, site_id } = req.query as any;
    const result = await ipmService.listBioReleases({
      fieldId: field_id, productId: product_id, startDate: start_date, endDate: end_date, siteId: site_id, page, limit,
      organizationId: requireOrgId(req),
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) { next(error); }
});

const bioReleaseBodySchema = z.object({
  fieldId: z.string().uuid(),
}).passthrough();

/** Bio-control releases: the pest agronomist and the IPM admin only, on a field of their own organization. */
ipmRouter.post('/bio-releases', validate({ body: bioReleaseBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    if (!canManageBio(req.user!)) {
      throw new AppError('Only the pest agronomist may record bio-control releases', 'FORBIDDEN', 403);
    }
    const orgId = requireOrgId(req);
    await assertFieldInOrganization(req.body.fieldId, orgId);
    // The organization comes from the session, never from the body.
    const release = await ipmService.createBioRelease(
      { ...req.body, organizationId: orgId },
      req.user!.userId,
    );
    emitDataChange('bio_release', 'create', release);
    res.status(201).json({ success: true, data: release });
  } catch (error) { next(error); }
});

ipmRouter.get('/bio-releases/:id/effectiveness', validate({ params: idSchema }), async (req, res, next) => {
  try {
    const data = await ipmService.getBioReleaseEffectiveness(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: { message: 'Release not found' } });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// ─── Bumble Bees ─────────────────────────────────────────────────
//
// Who may change bumble-bee data:
//   pest agronomist / IPM admin → written live;
//   scouter → saved as a change request (202, nothing written until approved),
//             except filing a new inspection, which stays a direct save;
//   everyone else → 403 (they only watch).

/** Optional on every bumble-bee write: why (shown to the reviewer) and which rejected request it corrects. */
const bbProposalMetaSchema = z.object({
  reason: z.string().max(2000).optional().nullable(),
  resubmitOf: z.string().uuid().optional().nullable(),
});

const bbDeploymentBodySchema = z.object({
  fieldId: z.string().uuid(),
  datePlaced: z.string().min(1),
  boxesBefore: z.coerce.number().int().min(0).optional().nullable(),
  boxesRemoved: z.coerce.number().int().min(0).optional(),
  boxesAdded: z.coerce.number().int().min(0).optional(),
  boxCount: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
}).merge(bbProposalMetaSchema);

const bbDeploymentUpdateSchema = z.object({
  boxCount: z.coerce.number().int().min(0).optional(),
  dateRemoved: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).merge(bbProposalMetaSchema);

const bbInspectionBodySchema = z.object({
  fieldId: z.string().uuid().optional(),
  inspectionDate: z.string().min(1),
  boxes100: z.coerce.number().int().min(0).optional(),
  boxes80: z.coerce.number().int().min(0).optional(),
  boxes60: z.coerce.number().int().min(0).optional(),
  boxes40: z.coerce.number().int().min(0).optional(),
  boxes20: z.coerce.number().int().min(0).optional(),
  boxes0: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
});

const bbInventoryBodySchema = z.object({
  siteId: z.string().uuid(),
  quantityOnHand: z.coerce.number().int().min(0),
}).merge(bbProposalMetaSchema);

// The page sends expectedDeliveryDate; expectedDate is still accepted.
const bbIncomingOrderBodySchema = z.object({
  siteId: z.string().uuid(),
  expectedDeliveryDate: z.string().min(1).optional().nullable(),
  expectedDate: z.string().min(1).optional().nullable(),
  orderDate: z.string().min(1).optional().nullable(),
  quantityExpected: z.coerce.number().int().positive(),
  supplier: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).merge(bbProposalMetaSchema).refine((d) => Boolean(d.expectedDeliveryDate || d.expectedDate), {
  message: 'Expected delivery date is required',
  path: ['expectedDeliveryDate'],
});

const bbIncomingOrderUpdateSchema = z.object({
  quantityExpected: z.coerce.number().int().positive().optional(),
  expectedDeliveryDate: z.string().min(1).optional(),
  expectedDate: z.string().min(1).optional(),
  orderDate: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  status: z.literal('cancelled').optional(),
}).merge(bbProposalMetaSchema);

const bbReceiveBodySchema = z.object({
  receivedDate: z.string().min(1).optional(),
  quantityReceived: z.coerce.number().int().positive().optional(),
  // Corrections to the order made in the same step.
  quantityExpected: z.coerce.number().int().positive().optional(),
  orderDate: z.string().min(1).optional(),
  expectedDeliveryDate: z.string().min(1).optional(),
}).merge(bbProposalMetaSchema);

const listBBSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  active_only: z.coerce.boolean().optional(),
  site_id: z.string().uuid().optional(),
});

/** Remove the proposal-only keys before the body reaches a service. */
function withoutProposalMeta<T extends Record<string, unknown>>(body: T): Omit<T, 'reason' | 'resubmitOf'> {
  const { reason: _reason, resubmitOf: _resubmitOf, ...rest } = body;
  return rest;
}

/** The scouter's write becomes a change request; 202 tells the page it is waiting for approval. */
async function sendBumbleBeeProposal(
  req: AuthRequest,
  res: import('express').Response,
  input: {
    entityType: 'bumble_bee_deployment' | 'bumble_bee_inventory' | 'bumble_bee_order' | 'bumble_bee_box_inspection';
    action: 'create' | 'update' | 'set' | 'receive' | 'delete';
    entityId?: string;
    proposedPayload?: Record<string, unknown> | null;
    defaultReason: string;
  },
) {
  const actor = toIpmActor(req.user!);
  const body = (req.body || {}) as { reason?: string | null; resubmitOf?: string | null };
  const changeRequest = await ipmChangeRequestService.createChangeRequest(actor, {
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    reason: String(body.reason || '').trim() || input.defaultReason,
    proposedPayload: input.proposedPayload ?? null,
    organizationId: requireOrgId(req),
    resubmitOf: body.resubmitOf ?? null,
  });
  emitDataChange('bumble_bee', 'update', { pendingApproval: true, changeRequestId: changeRequest.id });
  res.status(202).json({ success: true, pendingApproval: true, data: { pendingApproval: true, changeRequest } });
}

ipmRouter.get('/bumble-bees', validate({ query: listBBSchema }), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, field_id, active_only, site_id } = req.query as any;
    const result = await ipmService.listBumbleBeeDeployments({
      fieldId: field_id, activeOnly: active_only, siteId: site_id, page, limit,
      organizationId: requireOrgId(req),
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) { next(error); }
});

ipmRouter.post('/bumble-bees', validate({ body: bbDeploymentBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
    const orgId = requireOrgId(req);
    await assertFieldInOrganization(req.body.fieldId, orgId);
    const data = withoutProposalMeta(req.body);
    if (mode === 'propose') {
      await sendBumbleBeeProposal(req, res, {
        entityType: 'bumble_bee_deployment',
        action: 'create',
        proposedPayload: data,
        defaultReason: 'New deployment',
      });
      return;
    }
    const deployment = await ipmService.createBumbleBeeDeployment(
      { ...data, organizationId: orgId },
      req.user!.userId,
    );
    emitDataChange('bumble_bee', 'create', deployment);
    res.status(201).json({ success: true, data: deployment });
  } catch (error) { next(error); }
});

const bbSiteQuerySchema = z.object({
  site_id: z.string().uuid(),
});

ipmRouter.get('/bumble-bees/inventory', validate({ query: bbSiteQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const siteId = (req.query as any).site_id;
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(siteId, orgId);
    const data = await ipmService.getBumbleBeeInventory(siteId, orgId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.put('/bumble-bees/inventory', validate({ body: bbInventoryBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
    const orgId = requireOrgId(req);
    const { siteId, quantityOnHand } = req.body;
    await assertSiteInOrganization(siteId, orgId);
    if (mode === 'propose') {
      await sendBumbleBeeProposal(req, res, {
        entityType: 'bumble_bee_inventory',
        action: 'set',
        proposedPayload: { siteId, quantityOnHand: Number(quantityOnHand) },
        defaultReason: 'Boxes on hand count',
      });
      return;
    }
    const row = await ipmService.setBumbleBeeInventory(
      siteId,
      orgId,
      Number(quantityOnHand),
      req.user!.userId,
    );
    emitDataChange('bumble_bee', 'update', { siteId });
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
});

ipmRouter.get('/bumble-bees/incoming-orders', validate({ query: bbSiteQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const siteId = (req.query as any).site_id;
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(siteId, orgId);
    const items = await ipmService.listBumbleBeeIncomingOrders(siteId, orgId);
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
});

ipmRouter.post('/bumble-bees/incoming-orders', validate({ body: bbIncomingOrderBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(req.body.siteId, orgId);
    const data = withoutProposalMeta(req.body);
    if (mode === 'propose') {
      await sendBumbleBeeProposal(req, res, {
        entityType: 'bumble_bee_order',
        action: 'create',
        proposedPayload: data,
        defaultReason: 'New order',
      });
      return;
    }
    const order = await ipmService.createBumbleBeeIncomingOrder(
      { ...data, organizationId: orgId },
      req.user!.userId,
    );
    emitDataChange('bumble_bee', 'update', { orderId: order.id });
    res.status(201).json({ success: true, data: order });
  } catch (error) { next(error); }
});

ipmRouter.put('/bumble-bees/incoming-orders/:id', validate({ params: idSchema, body: bbIncomingOrderUpdateSchema }), async (req: AuthRequest, res, next) => {
  try {
    const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
    const orgId = requireOrgId(req);
    const data = withoutProposalMeta(req.body);
    if (mode === 'propose') {
      await sendBumbleBeeProposal(req, res, {
        entityType: 'bumble_bee_order',
        action: 'update',
        entityId: req.params.id,
        proposedPayload: data,
        defaultReason: data.status === 'cancelled' ? 'Cancel order' : 'Order correction',
      });
      return;
    }
    const order = await ipmService.updateBumbleBeeIncomingOrder(req.params.id, data, orgId);
    emitDataChange('bumble_bee', 'update', { orderId: req.params.id });
    res.json({ success: true, data: order });
  } catch (error) { next(error); }
});

ipmRouter.post('/bumble-bees/incoming-orders/:id/receive', validate({ params: idSchema, body: bbReceiveBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
    const orgId = requireOrgId(req);
    const data = withoutProposalMeta(req.body);
    if (mode === 'propose') {
      await sendBumbleBeeProposal(req, res, {
        entityType: 'bumble_bee_order',
        action: 'receive',
        entityId: req.params.id,
        proposedPayload: data,
        defaultReason: 'Delivery received',
      });
      return;
    }
    const result = await ipmService.receiveBumbleBeeIncomingOrder(
      req.params.id,
      req.user!.userId,
      data,
      orgId,
    );
    emitDataChange('bumble_bee', 'update', { orderId: req.params.id });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

ipmRouter.get('/bumble-bees/last-for-field', validate({ query: z.object({ field_id: z.string().uuid() }) }), async (req: AuthRequest, res, next) => {
  try {
    const fieldId = (req.query as any).field_id;
    await assertFieldInOrganization(fieldId, requireOrgId(req));
    const last = await ipmService.getBumbleBeeLastForField(fieldId);
    res.json({ success: true, data: last });
  } catch (error) { next(error); }
});

// Proposals the page highlights: all pending ones for the site, plus the caller's own
// rejected ones (with the reviewer's reason) until they are corrected and resubmitted.
ipmRouter.get('/bumble-bees/proposals', validate({ query: bbSiteQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const siteId = (req.query as any).site_id;
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(siteId, orgId);
    const data = await ipmChangeRequestService.listBumbleBeePageProposals(toIpmActor(req.user!), orgId, siteId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

ipmRouter.get('/bumble-bees/inspections', validate({ query: bbSiteQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const siteId = (req.query as any).site_id;
    const items = await ipmService.listBumbleBeeInspections({
      siteId,
      organizationId: requireOrgId(req),
      limit: 500,
    });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
});

// Filing a new inspection stays a direct save by the scouter.
ipmRouter.post('/bumble-bees/inspections', validate({ body: bbInspectionBodySchema }), async (req: AuthRequest, res, next) => {
  try {
    if (req.user!.role !== 'scouter') {
      return res.status(403).json({ success: false, error: { message: 'Only scouters can create bumble bee inspections' } });
    }
    const orgId = requireOrgId(req);
    if (req.body.fieldId) await assertFieldInOrganization(req.body.fieldId, orgId);
    const row = await ipmService.createBumbleBeeBoxInspection(
      { ...req.body, organizationId: orgId },
      req.user!.userId,
    );
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

// Edit / delete of a saved inspection: pest agronomist live; scouter always through
// approval (there is no direct-edit window any more).
ipmRouter.put(
  '/bumble-bees/inspections/:id',
  validate({ params: idSchema, body: bbInspectionBodySchema.partial().merge(bbProposalMetaSchema) }),
  async (req: AuthRequest, res, next) => {
    try {
      const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
      const orgId = requireOrgId(req);
      const existing = await ipmService.getBumbleBeeBoxInspection(req.params.id, orgId);
      const { fieldId: _fieldId, ...data } = withoutProposalMeta(req.body);
      if (mode === 'propose') {
        await sendBumbleBeeProposal(req, res, {
          entityType: 'bumble_bee_box_inspection',
          action: 'update',
          entityId: existing.id,
          proposedPayload: {
            inspectionDate: data.inspectionDate || String(existing.inspection_date || '').split('T')[0],
            boxes100: data.boxes100 ?? existing.boxes_100 ?? 0,
            boxes80: data.boxes80 ?? existing.boxes_80 ?? 0,
            boxes60: data.boxes60 ?? existing.boxes_60 ?? 0,
            boxes40: data.boxes40 ?? existing.boxes_40 ?? 0,
            boxes20: data.boxes20 ?? existing.boxes_20 ?? 0,
            boxes0: data.boxes0 ?? existing.boxes_0 ?? 0,
            notes: data.notes !== undefined ? (data.notes ?? '') : (existing.notes ?? ''),
          },
          defaultReason: 'Inspection correction',
        });
        return;
      }
      const row = await ipmService.updateBumbleBeeBoxInspection(existing.id, data);
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'bumble_bee_box_inspection',
        entityId: existing.id,
        metadata: { type: 'direct_edit' },
      });
      res.json({ success: true, data: row });
    } catch (error) { next(error); }
  },
);

ipmRouter.delete(
  '/bumble-bees/inspections/:id',
  validate({ params: idSchema, query: z.object({ reason: z.string().max(2000).optional() }) }),
  async (req: AuthRequest, res, next) => {
    try {
      const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
      const orgId = requireOrgId(req);
      const existing = await ipmService.getBumbleBeeBoxInspection(req.params.id, orgId);
      if (mode === 'propose') {
        req.body = { ...(req.body || {}), reason: (req.query as { reason?: string }).reason || req.body?.reason };
        await sendBumbleBeeProposal(req, res, {
          entityType: 'bumble_bee_box_inspection',
          action: 'delete',
          entityId: existing.id,
          defaultReason: 'Delete inspection',
        });
        return;
      }
      await ipmService.deleteBumbleBeeBoxInspection(existing.id);
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'bumble_bee_box_inspection',
        entityId: existing.id,
        metadata: { type: 'direct_delete' },
      });
      res.json({ success: true, data: { id: existing.id } });
    } catch (error) { next(error); }
  },
);

ipmRouter.put('/bumble-bees/:id', validate({ params: idSchema, body: bbDeploymentUpdateSchema }), async (req: AuthRequest, res, next) => {
  try {
    const mode = resolveBumbleBeeWriteMode(toIpmActor(req.user!));
    const orgId = requireOrgId(req);
    const data = withoutProposalMeta(req.body);
    if (mode === 'propose') {
      await sendBumbleBeeProposal(req, res, {
        entityType: 'bumble_bee_deployment',
        action: 'update',
        entityId: req.params.id,
        proposedPayload: data,
        defaultReason: 'Deployment correction',
      });
      return;
    }
    const deployment = await ipmService.updateBumbleBeeDeployment(req.params.id, data, orgId);
    emitDataChange('bumble_bee', 'update', deployment);
    res.json({ success: true, data: deployment });
  } catch (error) { next(error); }
});

// ─── Field Overview ──────────────────────────────────────────────

ipmRouter.get('/field-overview', async (req: AuthRequest, res, next) => {
  try {
    const siteId = req.query.site_id as string | undefined;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;
    const data = await ipmService.getFieldOverview(requireOrgId(req), siteId, dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});
