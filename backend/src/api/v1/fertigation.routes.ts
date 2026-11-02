import { Router } from 'express';
import { z } from 'zod';
import { FertigationService } from '../../services/fertigation.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { AppError } from '../../utils/errors';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { emitDataChange } from '../../websocket';
import * as fertigationGroupService from '../../services/fertigationGroup.service';


export const fertigationRouter = Router();
const service = new FertigationService();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
const createSchema = z.object({
  fieldId: z.string().uuid(),
  recipeId: z.string().uuid().optional(),
  cropId: z.string().uuid().optional(),
  date: z.string().min(1),
  weekNumber: z.number().int().optional(),
  flowRate: z.number().optional(),
  frequency: z.number().int().optional(),
  valvesCount: z.number().int().optional(),
  dailyWater: z.number().optional(),
  fertilizers: z.record(z.string(), z.number()).optional(),
  totalFertilizer: z.number().optional(),
  cumulative: z.record(z.string(), z.unknown()).optional(),
  workerId: z.string().uuid().optional(),
});
const updateSchema = createSchema.partial().omit({ fieldId: true });

const groupListQuerySchema = z.object({
  site_id: z.string().uuid(),
});

const groupBodySchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1).max(200),
  fieldIds: z.array(z.string().uuid()).min(1),
  defaultRecipeId: z.string().uuid().nullable().optional(),
});

const groupUpdateSchema = groupBodySchema.partial().omit({ siteId: true });

fertigationRouter.get(
  '/groups',
  validate({ query: groupListQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const siteId = (req.query as { site_id: string }).site_id;
      const groups = await fertigationGroupService.listGroups(siteId, requireOrgId(req));
      res.json({ success: true, data: groups });
    } catch (error) {
      next(error);
    }
  },
);

fertigationRouter.post(
  '/groups',
  validate({ body: groupBodySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      const body = req.body as z.infer<typeof groupBodySchema>;
      const group = await fertigationGroupService.createGroup({
        organizationId: requireOrgId(req),
        siteId: body.siteId,
        name: body.name,
        fieldIds: body.fieldIds,
        defaultRecipeId: body.defaultRecipeId,
      });
      res.status(201).json({ success: true, data: group });
    } catch (error) {
      next(error);
    }
  },
);

fertigationRouter.put(
  '/groups/:id',
  validate({ params: idSchema, body: groupUpdateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      const group = await fertigationGroupService.updateGroup(
        req.params.id,
        requireOrgId(req),
        req.body,
      );
      res.json({ success: true, data: group });
    } catch (error) {
      next(error);
    }
  },
);

fertigationRouter.delete(
  '/groups/:id',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      await fertigationGroupService.deleteGroup(req.params.id, requireOrgId(req));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  },
);

fertigationRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, field_id, site_id, start_date, end_date } = req.query as {
        page?: number;
        limit?: number;
        field_id?: string;
        site_id?: string;
        start_date?: string;
        end_date?: string;
      };
      const result = await service.list({
        page,
        limit,
        fieldId: field_id,
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

fertigationRouter.get(
  '/:id',
  validate({ params: idSchema }),
  async (req, res, next) => {
    try {
      const entry = await service.getById(req.params.id);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

fertigationRouter.post('/bulk', async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    const entries: any[] = req.body?.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new AppError('entries array is required', 'VALIDATION_ERROR', 400);
    }

    const parsed: z.infer<typeof createSchema>[] = [];
    const parseErrors: string[] = [];
    for (let i = 0; i < entries.length; i += 1) {
      try {
        parsed.push(createSchema.parse(entries[i]));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        parseErrors.push(`Entry ${i + 1}: ${message}`);
      }
    }

    const results = await service.bulkImport(parsed);
    results.errors = [...parseErrors, ...results.errors];

    emitDataChange('fertigation', 'create', { bulk: true, count: results.inserted + results.updated });
    res.status(201).json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

fertigationRouter.post('/', validate({ body: createSchema }), async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    const user = req.user!;
    if (user.role !== 'ceo') {
      const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.body.fieldId, requireOrgId(req));
      if (!canAccess) throw new AppError('You do not have access to this field', 'FORBIDDEN', 403);
    }
    const entry = await service.create(req.body);
    emitDataChange('fertigation', 'create', entry);

    // Auto-deduct fertilizers from inventory (best-effort)
    if (req.body.fertilizers && typeof req.body.fertilizers === 'object') {
      const { deductByName } = await import('../../services/inventory.service');
      for (const [fertName, qty] of Object.entries(req.body.fertilizers)) {
        if (typeof qty === 'number' && qty > 0) {
          deductByName(fertName, 'fertilizer', qty, 'fertigation_entry', entry.id, user.userId).catch(() => {});
        }
      }
    }

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

fertigationRouter.put(
  '/:id',
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      // Reject a closed season or a draft/unknown recipe before touching inventory.
      await service.assertUpdateSeasonAllowed(req.params.id, req.body.date);
      await service.assertUpdateRecipeAllowed(req.params.id, req.body.recipeId);
      // Reverse previous inventory deductions then re-deduct with new values
      const { reverseUsageByReference, deductByName } = await import('../../services/inventory.service');
      reverseUsageByReference('fertigation_entry', req.params.id, req.user?.userId).catch(() => {});

      const entry = await service.update(req.params.id, req.body);
      emitDataChange('fertigation', 'update', entry);

      if (req.body.fertilizers && typeof req.body.fertilizers === 'object') {
        for (const [fertName, qty] of Object.entries(req.body.fertilizers)) {
          if (typeof qty === 'number' && qty > 0) {
            deductByName(fertName, 'fertilizer', qty, 'fertigation_entry', entry.id, req.user?.userId).catch(() => {});
          }
        }
      }

      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

fertigationRouter.delete(
  '/:id',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      // A closed season locks the entry; check before touching inventory.
      await service.assertEntryNotClosed(req.params.id);
      // Reverse inventory deductions before deleting
      const { reverseUsageByReference } = await import('../../services/inventory.service');
      await reverseUsageByReference('fertigation_entry', req.params.id, req.user?.userId).catch(() => {});

      await service.remove(req.params.id);
      emitDataChange('fertigation', 'delete', { id: req.params.id });
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);
