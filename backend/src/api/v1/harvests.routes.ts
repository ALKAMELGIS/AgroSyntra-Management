import { Router } from 'express';
import { z } from 'zod';
import { HarvestService } from '../../services/harvest.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { assertFieldInOrganization, assertSiteInOrganization } from '../../utils/tenantValidation';
import { AppError } from '../../utils/errors';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { emitDataChange } from '../../websocket';
import { deliverWebhooks } from '../../services/webhook.service';
import { evaluateAlerts } from '../../services/alertEngine.service';
import { checkAndNotifyHarvestConflicts, previewHarvestPhiConflicts } from '../../services/phiAuditLog.service';

export const harvestsRouter = Router();
const service = new HarvestService();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });
const phiPreviewQuerySchema = z.object({
  field_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  segment_id: z.string().optional(),
  start_time: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  field_ids: z.string().optional(),
  site_id: z.string().uuid().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const varietySchema = z.object({
  variety: z.string().min(1),
  quantity: z.number().positive(),
  grade: z.string().optional(),
});
const createSchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string().min(1),
  totalQuantity: z.number().positive().optional(),
  notes: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  shiftNumber: z.string().optional(),
  weekNumber: z.string().max(20).optional(),
  batchNumber: z.string().optional(),
  segmentId: z.string().optional(),
  harvestedAreaHa: z.number().optional(),
  packhouse: z.string().optional(),
  authorizedBy: z.string().optional(),
  extraData: z.record(z.string(), z.any()).optional(),
  cropId: z.string().uuid().optional(),
  varieties: z.array(varietySchema).min(1),
});
const updateSchema = z.object({
  date: z.string().min(1).optional(),
  totalQuantity: z.number().positive().optional(),
  notes: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  shiftNumber: z.string().optional(),
  weekNumber: z.string().max(20).optional(),
  batchNumber: z.string().optional(),
  segmentId: z.string().optional(),
  harvestedAreaHa: z.number().optional(),
  packhouse: z.string().optional(),
  authorizedBy: z.string().optional(),
  varieties: z.array(varietySchema).min(1).optional(),
});

harvestsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, field_id, field_ids, site_id, start_date, end_date } = req.query as {
        page?: number;
        limit?: number;
        field_id?: string;
        field_ids?: string;
        site_id?: string;
        start_date?: string;
        end_date?: string;
      };
      const fieldIdsArr = field_ids ? field_ids.split(',').filter(Boolean) : undefined;
      const result = await service.list({
        page,
        limit,
        fieldId: field_id,
        fieldIds: fieldIdsArr,
        siteId: site_id,
        startDate: start_date,
        endDate: end_date,
        organizationId: requireOrgId(req),
      });
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

harvestsRouter.get('/reports/summary', async (req: AuthRequest, res, next) => {
  try {
    const siteId = req.query.site_id as string;
    if (!siteId) return res.status(400).json({ success: false, error: 'site_id required' });
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await service.getSummary(siteId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.get('/reports/daily-worksheet', async (req: AuthRequest, res, next) => {
  try {
    const siteId = req.query.site_id as string;
    if (!siteId) return res.status(400).json({ success: false, error: 'site_id required' });
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await service.getDailyWorksheet(
      siteId,
      req.query.start_date as string | undefined,
      req.query.end_date as string | undefined
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.get('/reports/weekly-summary', async (req: AuthRequest, res, next) => {
  try {
    const siteId = req.query.site_id as string;
    if (!siteId) return res.status(400).json({ success: false, error: 'site_id required' });
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await service.getWeeklySummary(siteId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.get('/phi-preview', validate({ query: phiPreviewQuerySchema }), async (req: AuthRequest, res, next) => {
  try {
    const fieldId = req.query.field_id as string;
    const harvestDate = req.query.date as string;
    const segmentId = (req.query.segment_id as string | undefined) || null;
    const harvestStartTime = (req.query.start_time as string | undefined) || null;
    await assertFieldInOrganization(fieldId, requireOrgId(req));
    const data = await previewHarvestPhiConflicts({
      organizationId: requireOrgId(req),
      fieldId,
      harvestDate,
      harvestStartTime,
      segmentId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.get('/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const harvest = await service.getById(req.params.id);
    await assertFieldInOrganization(harvest.fieldId, requireOrgId(req));
    res.json({ success: true, data: harvest });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.post('/bulk', async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    const entries = req.body.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'entries array required' });
    }
    const result = await service.bulkCreate(entries);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.post('/', validate({ body: createSchema }), async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    const user = req.user!;
    if (user.role !== 'ceo') {
      const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.body.fieldId, requireOrgId(req));
      if (!canAccess) throw new AppError('You do not have access to this field', 'FORBIDDEN', 403);
    }
    const harvest = await service.create(req.body);
    emitDataChange('harvest', 'create', harvest);
    deliverWebhooks('harvest.created', harvest).catch(() => {});
    if (harvest.totalQuantity) {
      evaluateAlerts('harvest', harvest.id, req.body.fieldId, { total_quantity: harvest.totalQuantity }).catch(() => {});
    }
    checkAndNotifyHarvestConflicts(harvest.id).catch(() => {});
    res.status(201).json({ success: true, data: harvest });
  } catch (error) {
    next(error);
  }
});

harvestsRouter.put(
  '/:id',
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      const harvest = await service.update(req.params.id, req.body);
      emitDataChange('harvest', 'update', harvest);
      res.json({ success: true, data: harvest });
    } catch (error) {
      next(error);
    }
  }
);

harvestsRouter.delete('/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    await service.remove(req.params.id);
    emitDataChange('harvest', 'delete', { id: req.params.id });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
