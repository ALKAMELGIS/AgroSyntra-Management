import { Router } from 'express';
import { z } from 'zod';
import { FarmAreaService } from '../../services/farm-area.service';
import { FieldService } from '../../services/field.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { AuthRequest, authorize } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { NotFoundError } from '../../utils/errors';
import { buildPaginationMeta, normalizePagination } from '../../utils/pagination';

export const farmAreasRouter = Router();
const service = new FarmAreaService();
const fieldService = new FieldService();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  site_id: z.string().uuid().optional(),
});
const createSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1),
  size: z.number().optional(),
  description: z.string().optional(),
});
const updateSchema = z.object({
  siteId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  size: z.number().optional(),
  description: z.string().optional(),
});
const cropAssignSchema = z.object({
  cropIds: z.array(z.string().uuid()).default([]),
});

farmAreasRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, site_id } = req.query as {
        page?: number;
        limit?: number;
        site_id?: string;
      };
      const user = req.user!;
      const orgId = requireOrgId(req);
      let result;
      if (user.role === 'ceo') {
        result = await service.list({ page, limit, siteId: site_id, organizationId: orgId });
      } else {
        const farmAreaIds = await assignmentRepo.getUserAccessibleFarmAreaIds(user.userId, user.role, orgId);
        if (farmAreaIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await service.list({ page, limit, siteId: site_id, farmAreaIds });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

farmAreasRouter.get('/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const farmArea = await service.getById(req.params.id);
    const user = req.user!;
    const canAccess = await assignmentRepo.canUserAccessFarmArea(user.userId, user.role, farmArea.id, requireOrgId(req));
    if (!canAccess) throw new NotFoundError('Farm area not found');
    res.json({ success: true, data: farmArea });
  } catch (error) {
    next(error);
  }
});

farmAreasRouter.get(
  '/:id/fields',
  validate({ params: idSchema, query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit } = req.query as { page?: number; limit?: number };
      const user = req.user!;
      const orgId = requireOrgId(req);
      const canAccessFarmArea = await assignmentRepo.canUserAccessFarmArea(user.userId, user.role, req.params.id, orgId);
      if (!canAccessFarmArea) throw new NotFoundError('Farm area not found');
      let result;
      if (user.role === 'ceo') {
        result = await fieldService.list({ page, limit, farmAreaId: req.params.id, organizationId: orgId });
      } else {
        const fieldIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
        if (fieldIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await fieldService.list({ page, limit, farmAreaId: req.params.id, fieldIds });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Farm area writes: operation managers and data-entry workers manage farm
 * areas on the sites they can access. The farm manager (no data entry) and the
 * CEO only watch (403); the agronomist and every other role stay read-only. A
 * site or farm area the caller cannot reach in their organization answers 404.
 */
const requireFarmAreaEditor = authorize('operation_manager', 'worker');

async function assertSiteAccess(req: AuthRequest, siteId: string) {
  const user = req.user!;
  const ok = await assignmentRepo.canUserAccessSite(user.userId, user.role, siteId, requireOrgId(req));
  if (!ok) throw new NotFoundError('Site not found');
}

async function assertFarmAreaAccess(req: AuthRequest, farmAreaId: string) {
  const user = req.user!;
  const ok = await assignmentRepo.canUserAccessFarmArea(user.userId, user.role, farmAreaId, requireOrgId(req));
  if (!ok) throw new NotFoundError('Farm area not found');
}

farmAreasRouter.post('/', requireFarmAreaEditor, validate({ body: createSchema }), async (req: AuthRequest, res, next) => {
  try {
    await assertSiteAccess(req, req.body.siteId);
    const farmArea = await service.create(req.body);
    res.status(201).json({ success: true, data: farmArea });
  } catch (error) {
    next(error);
  }
});

farmAreasRouter.put(
  '/:id',
  requireFarmAreaEditor,
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      await assertFarmAreaAccess(req, req.params.id);
      const { siteId } = req.body as { siteId?: string };
      if (siteId !== undefined) {
        // Moving to another site needs access to the destination too.
        const current = await service.getById(req.params.id);
        if (current.siteId !== siteId) await assertSiteAccess(req, siteId);
      }
      const farmArea = await service.update(req.params.id, req.body);
      res.json({ success: true, data: farmArea });
    } catch (error) {
      next(error);
    }
  }
);

farmAreasRouter.put(
  '/:id/crops',
  requireFarmAreaEditor,
  validate({ params: idSchema, body: cropAssignSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      await assertFarmAreaAccess(req, req.params.id);
      const { cropIds } = req.body as { cropIds: string[] };
      await service.setCrops(req.params.id, cropIds);
      res.json({ success: true, data: { updated: true } });
    } catch (error) {
      next(error);
    }
  }
);

farmAreasRouter.delete('/:id', requireFarmAreaEditor, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    await assertFarmAreaAccess(req, req.params.id);
    await service.remove(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
