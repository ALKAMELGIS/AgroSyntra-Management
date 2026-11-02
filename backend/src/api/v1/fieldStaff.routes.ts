import { Router } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { AppError } from '../../utils/errors';
import { canManageFieldStaff } from '../../utils/roleAccess';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import * as fieldStaffService from '../../services/fieldStaff.service';

/**
 * Field Staff management: pest agronomist, crop agronomist, operation manager
 * and data-entry worker only (see canManageFieldStaff). Every one of them is
 * limited to the sites they are assigned to (user_site_assignments) for
 * listing, linking, creating and PIN resets.
 */
export const fieldStaffRouter = Router();

const assignmentRepo = new AssignmentRepository();

const OTHER_SITE_ERROR = 'You can only manage field staff at your assigned sites';

function requireFieldStaffManager(req: AuthRequest, _res: unknown, next: (err?: unknown) => void) {
  if (!req.user || !canManageFieldStaff(req.user.role)) {
    return next(new AppError('You do not have permission to manage field staff', 'FORBIDDEN', 403));
  }
  next();
}

fieldStaffRouter.use(auth, requireFieldStaffManager);

/** Sites the signed-in manager is assigned to. */
function managerSiteIds(req: AuthRequest, orgId: string): Promise<string[]> {
  return assignmentRepo.getUserAccessibleSiteIds(req.user!.userId, req.user!.role, orgId);
}

async function assertManagerSite(req: AuthRequest, orgId: string, siteId: string): Promise<void> {
  const allowed = await assignmentRepo.canUserAccessSite(req.user!.userId, req.user!.role, siteId, orgId);
  if (!allowed) {
    throw new AppError(OTHER_SITE_ERROR, 'FORBIDDEN', 403);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  employeeId: z.string().min(1).max(20),
  pin: z.string().min(4).max(8),
  role: z.enum(['scouter', 'operator']),
  siteId: z.string().uuid(),
});

const pinSchema = z.object({
  pin: z.string().min(4).max(8),
});

const linkSchema = z.object({
  workerId: z.string().uuid(),
  role: z.enum(['scouter', 'operator']),
  pin: z.string().min(4).max(8),
  siteId: z.string().uuid().optional(),
});

fieldStaffRouter.get('/eligible-workers', async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const siteIds = await managerSiteIds(req, orgId);
    const siteIdFilter = req.query.site_id as string | undefined;
    if (siteIdFilter && !siteIds.includes(siteIdFilter)) {
      throw new AppError('You can only view workers at your assigned sites', 'FORBIDDEN', 403);
    }
    const data = await fieldStaffService.listEligibleWorkers(orgId, siteIds, siteIdFilter);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

fieldStaffRouter.post(
  '/link',
  validate({ body: linkSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      if (req.body.siteId) {
        await assertManagerSite(req, orgId, req.body.siteId);
      }
      // The service also checks the worker's current site (and the site used
      // when none is given) against this list once it has loaded the worker.
      const allowedSiteIds = await managerSiteIds(req, orgId);

      const result = await fieldStaffService.linkWorkerAsFieldStaff({
        ...req.body,
        organizationId: orgId,
        assignedBy: req.user!.userId,
        allowedSiteIds,
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

fieldStaffRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const siteIds = await managerSiteIds(req, orgId);
    const data = await fieldStaffService.listFieldStaff(orgId, siteIds);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

fieldStaffRouter.post(
  '/',
  validate({ body: createSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      await assertManagerSite(req, orgId, req.body.siteId);

      const result = await fieldStaffService.createFieldStaff({
        ...req.body,
        organizationId: orgId,
        assignedBy: req.user!.userId,
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

fieldStaffRouter.put(
  '/:id/pin',
  validate({ params: z.object({ id: z.string().uuid() }), body: pinSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const allowedSiteIds = await managerSiteIds(req, orgId);
      // Loads the staff member's site first: 404 if unknown, 403 if another site.
      await fieldStaffService.updateFieldStaffPin(
        req.params.id,
        req.body.pin,
        orgId,
        allowedSiteIds,
      );
      res.json({ success: true, data: { message: 'PIN updated' } });
    } catch (error) {
      next(error);
    }
  },
);
