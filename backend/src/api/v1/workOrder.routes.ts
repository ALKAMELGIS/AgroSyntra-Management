import { Router } from 'express';
import { z } from 'zod';
import * as workOrderService from '../../services/workOrder.service';
import { validate } from '../middleware/validate';
import { AuthRequest, authorize } from '../middleware/auth';
import { emitDataChange } from '../../websocket';
import { requireOrgId } from '../middleware/tenant';
import { assertSiteInOrganization } from '../../utils/tenantValidation';
import { assertCanApproveApplication, canApprovePesticideApplication, toIpmActor } from '../../utils/ipmAccess';

export const workOrderRouter = Router();

const idSchema = z.object({ id: z.string().uuid() });

// CEO and farm manager can view only. Approving a completed order is limited to
// whoever may approve pesticide applications (pest agronomist / IPM admin).
const MANAGE_ROLES = ['operation_manager', 'agronomist', 'pest_agronomist'] as const;

const canView = authorize(
  'ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'operator',
);

const canManage = authorize(...MANAGE_ROLES);

const isManager = (req: AuthRequest) => (MANAGE_ROLES as readonly string[]).includes(req.user!.role);

// ─── List ─────────────────────────────────────────────────────────

workOrderRouter.get('/', canView, async (req: AuthRequest, res, next) => {
  try {
    const { site_id, status, page, limit } = req.query as any;
    const assignedTo = req.user!.role === 'operator' ? req.user!.userId : undefined;
    const result = await workOrderService.listWorkOrders({
      siteId: site_id, status, assignedTo, page, limit,
      organizationId: requireOrgId(req),
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) { next(error); }
});

// ─── Get operators / workers list ─────────────────────────────────

workOrderRouter.get('/operators', canView, async (req: AuthRequest, res, next) => {
  try {
    const data = await workOrderService.getOperators(requireOrgId(req));
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// ─── Fields of the order's site (for rows the operator adds) ─────

workOrderRouter.get('/:id/fields', canView, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const wo = await workOrderService.getWorkOrderById(req.params.id, orgId);
    const hidden = wo && req.user!.role === 'operator' && wo.assigned_to !== req.user!.userId;
    if (!wo || hidden) return res.status(404).json({ success: false, error: 'Work order not found' });
    const data = await workOrderService.listSiteFields(wo.site_id);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// ─── Get by ID ────────────────────────────────────────────────────

workOrderRouter.get('/:id', canView, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const wo = await workOrderService.getWorkOrderById(req.params.id, requireOrgId(req));
    const hidden = wo && req.user!.role === 'operator' && wo.assigned_to !== req.user!.userId;
    if (!wo || hidden) return res.status(404).json({ success: false, error: 'Work order not found' });
    res.json({ success: true, data: wo });
  } catch (error) { next(error); }
});

// ─── Create ───────────────────────────────────────────────────────

workOrderRouter.post('/', canManage, async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    if (req.body.siteId) await assertSiteInOrganization(req.body.siteId, orgId);
    const wo = await workOrderService.createWorkOrder(req.body, req.user!.userId, orgId);
    emitDataChange('work_order', 'create', wo);
    res.status(201).json({ success: true, data: wo });
  } catch (error) { next(error); }
});

// ─── Update (draft/issued only) ──────────────────────────────────

workOrderRouter.put('/:id', canManage, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    if (req.body.siteId) await assertSiteInOrganization(req.body.siteId, orgId);
    const wo = await workOrderService.updateWorkOrder(req.params.id, req.body, req.user!.userId, orgId);
    emitDataChange('work_order', 'update', wo);
    res.json({ success: true, data: wo });
  } catch (error) { next(error); }
});

// ─── Operator Save (without completing) / Submit ─────────────────

workOrderRouter.put('/:id/operator-save', authorize('operator'), validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const wo = await workOrderService.operatorSave(req.params.id, req.body, req.user!.userId, requireOrgId(req));
    emitDataChange('work_order', 'update', wo);
    res.json({ success: true, data: wo });
  } catch (error) { next(error); }
});

workOrderRouter.put('/:id/operator-submit', authorize('operator'), validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const wo = await workOrderService.operatorSubmit(req.params.id, req.body, req.user!.userId, requireOrgId(req));
    emitDataChange('work_order', 'update', wo);
    res.json({ success: true, data: wo });
  } catch (error) { next(error); }
});

// ─── Approve (pest agronomist / IPM admin) ────────────────────────

workOrderRouter.post('/:id/approve', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    assertCanApproveApplication(toIpmActor(req.user!));
    const wo = await workOrderService.approveWorkOrder(req.params.id, req.user!.userId, requireOrgId(req));
    emitDataChange('work_order', 'update', wo);
    emitDataChange('pesticide_application', 'create', { workOrderId: wo.id });
    res.json({ success: true, data: wo });
  } catch (error) { next(error); }
});

// ─── Reject: send back a completed order, or cancel an issued one ──

workOrderRouter.post('/:id/reject', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const wo = await workOrderService.rejectWorkOrder(
      req.params.id, req.body.reason, req.user!.userId, requireOrgId(req),
      { canReview: canApprovePesticideApplication(toIpmActor(req.user!)), canManage: isManager(req) },
    );
    emitDataChange('work_order', 'update', wo);
    res.json({ success: true, data: wo });
  } catch (error) { next(error); }
});

// ─── Delete (draft/rejected only) ────────────────────────────────

workOrderRouter.delete('/:id', canManage, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    await workOrderService.deleteWorkOrder(req.params.id, requireOrgId(req));
    emitDataChange('work_order', 'delete', { id: req.params.id });
    res.json({ success: true });
  } catch (error) { next(error); }
});
