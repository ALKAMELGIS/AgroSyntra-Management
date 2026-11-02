import { Router } from 'express';
import { z } from 'zod';
import { CountryService } from '../../services/country.service';
import { SiteService } from '../../services/site.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { CountryRepository } from '../../repositories/country.repository';
import { validate } from '../middleware/validate';
import { AuthRequest, requireCeo, requireManager } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { AppError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta, normalizePagination } from '../../utils/pagination';
import { assertCanManageZone } from '../../services/zoneAccess.service';

export const countriesRouter = Router();
const service = new CountryService();
const siteService = new SiteService();
const assignmentRepo = new AssignmentRepository();
const countryRepo = new CountryRepository();

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2).max(10),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(2).max(10).optional(),
});

/**
 * Zones the caller can see. CEO: every zone in the org. Farm manager: the
 * zones assigned to them (even ones with no sites yet) plus the zones of
 * sites assigned to them directly. Everyone else: the zones of their sites.
 */
countriesRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit } = req.query as { page?: number; limit?: number };
      const user = req.user!;
      const orgId = requireOrgId(req);
      let result;
      if (user.role === 'ceo') {
        result = await service.list({ page, limit, organizationId: orgId });
      } else {
        const countryIds = await assignmentRepo.getUserAccessibleZoneIds(user.userId, user.role, orgId);
        if (countryIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await service.list({ page, limit, countryIds, organizationId: orgId });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

countriesRouter.get(
  '/:id',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const user = req.user!;
      const orgId = requireOrgId(req);
      const zoneOrg = await countryRepo.getOrganizationId(req.params.id);
      if (!zoneOrg || zoneOrg !== orgId) {
        throw new NotFoundError('Country not found');
      }
      if (user.role !== 'ceo') {
        const countryIds = await assignmentRepo.getUserAccessibleZoneIds(user.userId, user.role, orgId);
        if (!countryIds.includes(req.params.id)) {
          throw new NotFoundError('Country not found');
        }
      }
      const country = await service.getById(req.params.id);
      res.json({ success: true, data: country });
    } catch (error) {
      next(error);
    }
  }
);

countriesRouter.get(
  '/:id/sites',
  validate({ params: idSchema, query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit } = req.query as { page?: number; limit?: number };
      const user = req.user!;
      const orgId = requireOrgId(req);
      let result;
      if (user.role === 'ceo') {
        result = await siteService.list({ page, limit, countryId: req.params.id, organizationId: orgId });
      } else {
        const siteIds = await assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId);
        if (siteIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await siteService.list({ page, limit, countryId: req.params.id, siteIds, organizationId: orgId });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

// Only the CEO creates zones.
countriesRouter.post(
  '/',
  requireCeo,
  validate({ body: createSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const country = await service.create(req.body, orgId);
      res.status(201).json({ success: true, data: country });
    } catch (error) {
      next(error);
    }
  }
);

// CEO: any zone in the org. Farm manager: rename a zone assigned to them.
countriesRouter.put(
  '/:id',
  requireManager,
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const user = req.user!;
      await assertCanManageZone(user, req.params.id, orgId);
      if (user.role !== 'ceo' && req.body.code !== undefined) {
        throw new AppError('Only the CEO can change a zone code', 'FORBIDDEN', 403);
      }
      const country = await service.update(req.params.id, req.body);
      res.json({ success: true, data: country });
    } catch (error) {
      next(error);
    }
  }
);

// Only the CEO deletes zones, and only in their own organization.
countriesRouter.delete(
  '/:id',
  requireCeo,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      await assertCanManageZone(req.user!, req.params.id, orgId);
      await service.remove(req.params.id);
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);
