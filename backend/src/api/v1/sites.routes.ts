import { Router } from 'express';
import { z } from 'zod';
import { FarmAreaService } from '../../services/farm-area.service';
import { SiteService } from '../../services/site.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { AuthRequest, requireManager } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { NotFoundError } from '../../utils/errors';
import { buildPaginationMeta, normalizePagination } from '../../utils/pagination';
import { assertCanManageSite, assertCanManageZone } from '../../services/zoneAccess.service';

export const sitesRouter = Router();
const service = new SiteService();
const farmAreaService = new FarmAreaService();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  country_id: z.string().uuid().optional(),
});
const createSchema = z.object({
  countryId: z.string().uuid(),
  name: z.string().min(1),
  location: z.string().optional(),
  totalArea: z.number().optional(),
});
const updateSchema = z.object({
  countryId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  totalArea: z.number().optional(),
});

sitesRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, country_id } = req.query as {
        page?: number;
        limit?: number;
        country_id?: string;
      };
      const user = req.user!;
      const orgId = requireOrgId(req);
      let result;
      if (user.role === 'ceo') {
        result = await service.list({ page, limit, countryId: country_id, organizationId: orgId });
      } else {
        const siteIds = await assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId);
        if (siteIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await service.list({ page, limit, countryId: country_id, siteIds, organizationId: orgId });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

sitesRouter.get('/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const site = await service.getById(req.params.id);
    const user = req.user!;
    const orgId = requireOrgId(req);
    const canAccess = await assignmentRepo.canUserAccessSite(user.userId, user.role, site.id, orgId);
    if (!canAccess) throw new NotFoundError('Site not found');
    res.json({ success: true, data: site });
  } catch (error) {
    next(error);
  }
});

sitesRouter.get(
  '/:id/farm-areas',
  validate({ params: idSchema, query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit } = req.query as { page?: number; limit?: number };
      const user = req.user!;
      const orgId = requireOrgId(req);
      const canAccessSite = await assignmentRepo.canUserAccessSite(user.userId, user.role, req.params.id, orgId);
      if (!canAccessSite) throw new NotFoundError('Site not found');
      let result;
      if (user.role === 'ceo') {
        result = await farmAreaService.list({ page, limit, siteId: req.params.id, organizationId: orgId });
      } else {
        const farmAreaIds = await assignmentRepo.getUserAccessibleFarmAreaIds(user.userId, user.role, orgId);
        if (farmAreaIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await farmAreaService.list({ page, limit, siteId: req.params.id, farmAreaIds });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);


// CEO: any zone in the org. Farm manager: only inside a zone assigned to them.
sitesRouter.post('/', requireManager, validate({ body: createSchema }), async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    await assertCanManageZone(req.user!, req.body.countryId, orgId);
    const site = await service.create({ ...req.body, organizationId: orgId });
    res.status(201).json({ success: true, data: site });
  } catch (error) {
    next(error);
  }
});

sitesRouter.put(
  '/:id',
  requireManager,
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const currentZoneId = await assertCanManageSite(req.user!, req.params.id, orgId);
      // Moving a site to another zone needs rights on the new zone too.
      if (req.body.countryId && req.body.countryId !== currentZoneId) {
        await assertCanManageZone(req.user!, req.body.countryId, orgId);
      }
      const site = await service.update(req.params.id, req.body);
      res.json({ success: true, data: site });
    } catch (error) {
      next(error);
    }
  }
);

sitesRouter.delete('/:id', requireManager, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    await assertCanManageSite(req.user!, req.params.id, orgId);
    await service.remove(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});