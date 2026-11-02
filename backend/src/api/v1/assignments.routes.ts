import { Router } from 'express';
import { z } from 'zod';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CountryRepository } from '../../repositories/country.repository';
import { validate } from '../middleware/validate';
import { auth, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { AppError } from '../../utils/errors';
import { ASSIGNABLE_ROLES, ROLE_HIERARCHY, UserRole } from '../../models/user.model';
import { logAuditEvent } from '../../services/auditLog.service';

export const assignmentsRouter = Router();
const assignmentRepo = new AssignmentRepository();
const userRepo = new UserRepository();
const countryRepo = new CountryRepository();

// All routes require authentication
assignmentsRouter.use(auth);

// ============ Zone Assignments (CEO assigns farm managers to zones) ============

const userIdParams = z.object({ id: z.string().uuid() });
const userZoneParams = z.object({ id: z.string().uuid(), countryId: z.string().uuid() });
const assignToZoneSchema = z.object({ countryId: z.string().uuid() });

function requireCeoCaller(req: AuthRequest): void {
  if (req.user?.role !== 'ceo') {
    throw new AppError('Only the CEO can manage zone assignments', 'FORBIDDEN', 403);
  }
}

async function loadUserInOrg(userId: string, orgId: string) {
  const user = await userRepo.findById(userId);
  const userOrg = user ? await userRepo.getOrganizationId(userId) : null;
  if (!user || userOrg !== orgId) {
    throw new AppError('User not found', 'NOT_FOUND', 404);
  }
  return user;
}

async function assertZoneInOrg(countryId: string, orgId: string): Promise<void> {
  const zoneOrg = await countryRepo.getOrganizationId(countryId);
  if (!zoneOrg || zoneOrg !== orgId) {
    throw new AppError('Zone not found', 'NOT_FOUND', 404);
  }
}

assignmentsRouter.get(
  '/users/:id/zones',
  validate({ params: userIdParams }),
  async (req: AuthRequest, res, next) => {
    try {
      requireCeoCaller(req);
      const orgId = requireOrgId(req);
      await loadUserInOrg(req.params.id, orgId);
      const zones = await assignmentRepo.getUserZoneAssignments(req.params.id, orgId);
      res.json({ success: true, data: zones });
    } catch (error) {
      next(error);
    }
  },
);

assignmentsRouter.post(
  '/users/:id/zones',
  validate({ params: userIdParams, body: assignToZoneSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      requireCeoCaller(req);
      const orgId = requireOrgId(req);
      const currentUser = req.user!;
      const { countryId } = req.body as { countryId: string };
      const targetUser = await loadUserInOrg(req.params.id, orgId);
      if (targetUser.role !== 'farm_manager') {
        throw new AppError('Only farm managers can be assigned to zones', 'VALIDATION_ERROR', 400);
      }
      await assertZoneInOrg(countryId, orgId);

      const assignment = await assignmentRepo.assignUserToZone(targetUser.id, countryId, currentUser.userId);

      await logAuditEvent({
        userId: currentUser.userId,
        action: 'CREATE',
        entity: 'assignment',
        entityId: targetUser.id,
        changes: { scope: 'zone', countryId, assignedUserId: targetUser.id },
        metadata: { targetEmail: targetUser.email, targetRole: targetUser.role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  },
);

assignmentsRouter.delete(
  '/users/:id/zones/:countryId',
  validate({ params: userZoneParams }),
  async (req: AuthRequest, res, next) => {
    try {
      requireCeoCaller(req);
      const orgId = requireOrgId(req);
      const currentUser = req.user!;
      const { countryId } = req.params;
      const targetUser = await loadUserInOrg(req.params.id, orgId);
      await assertZoneInOrg(countryId, orgId);

      const removed = await assignmentRepo.removeUserFromZone(targetUser.id, countryId);

      if (removed) {
        await logAuditEvent({
          userId: currentUser.userId,
          action: 'DELETE',
          entity: 'assignment',
          entityId: targetUser.id,
          changes: { scope: 'zone', countryId, unassignedUserId: targetUser.id },
          metadata: { targetEmail: targetUser.email, targetRole: targetUser.role },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      res.json({ success: true, data: { removed } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Removing someone from a site / farm area / field follows the same rule as assigning:
 * the caller must be able to assign the target user's role (CEO can assign every role).
 */
async function assertCanUnassign(currentUser: NonNullable<AuthRequest['user']>, userId: string) {
  const targetUser = await userRepo.findById(userId);
  if (!targetUser) {
    throw new AppError('User not found', 'NOT_FOUND', 404);
  }
  const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
  if (!assignableRoles.includes(targetUser.role as UserRole)) {
    throw new AppError(`You cannot remove users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
  }
  return targetUser;
}

// ============ Site Assignments ============

// Get users assigned to a site
assignmentsRouter.get('/sites/:siteId/users', async (req: AuthRequest, res, next) => {
  try {
    const { siteId } = req.params;
    const currentUser = req.user!;

    // Check if user can view this site
    const canAccess = await assignmentRepo.canUserAccessSite(currentUser.userId, currentUser.role, siteId, requireOrgId(req));
    if (!canAccess && currentUser.role !== 'ceo') {
      throw new AppError('You do not have access to this site', 'FORBIDDEN', 403);
    }

    const users = await assignmentRepo.getSiteUsers(siteId);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// Assign user to site (CEO or Farm Manager only)
const assignToSiteSchema = z.object({
  userId: z.string().uuid(),
});

assignmentsRouter.post(
  '/sites/:siteId/users',
  validate({ body: assignToSiteSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { siteId } = req.params;
      const { userId } = req.body;
      const currentUser = req.user!;

      // Only CEO can assign to any site, Farm Manager can assign to their sites
      if (currentUser.role !== 'ceo') {
        const canAccess = await assignmentRepo.canUserAccessSite(currentUser.userId, currentUser.role, siteId, requireOrgId(req));
        if (!canAccess) {
          throw new AppError('You do not have access to this site', 'FORBIDDEN', 403);
        }
      }

      // Check if current user can assign the target user's role
      const targetUser = await userRepo.findById(userId);
      if (!targetUser) {
        throw new AppError('User not found', 'NOT_FOUND', 404);
      }

      const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
      if (!assignableRoles.includes(targetUser.role as UserRole)) {
        throw new AppError(`You cannot assign users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
      }

      const assignment = await assignmentRepo.assignUserToSite(userId, siteId, currentUser.userId);

      await logAuditEvent({
        userId: currentUser.userId,
        action: 'CREATE',
        entity: 'assignment',
        entityId: userId,
        changes: { scope: 'site', siteId, assignedUserId: userId },
        metadata: { targetEmail: targetUser.email, targetRole: targetUser.role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
);

// Remove user from site
assignmentsRouter.delete('/sites/:siteId/users/:userId', async (req: AuthRequest, res, next) => {
  try {
    const { siteId, userId } = req.params;
    const currentUser = req.user!;

    // Only CEO can remove from any site, Farm Manager can remove from their sites
    if (currentUser.role !== 'ceo') {
      const canAccess = await assignmentRepo.canUserAccessSite(currentUser.userId, currentUser.role, siteId, requireOrgId(req));
      if (!canAccess) {
        throw new AppError('You do not have access to this site', 'FORBIDDEN', 403);
      }
    }

    await assertCanUnassign(currentUser, userId);
    await assignmentRepo.removeUserFromSite(userId, siteId);

    await logAuditEvent({
      userId: currentUser.userId,
      action: 'DELETE',
      entity: 'assignment',
      entityId: userId,
      changes: { scope: 'site', siteId, unassignedUserId: userId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { message: 'User removed from site' } });
  } catch (error) {
    next(error);
  }
});

// ============ Farm Area Assignments ============

// Assign user to farm area
const assignToFarmAreaSchema = z.object({
  userId: z.string().uuid(),
});

assignmentsRouter.post(
  '/farm-areas/:farmAreaId/users',
  validate({ body: assignToFarmAreaSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { farmAreaId } = req.params;
      const { userId } = req.body;
      const currentUser = req.user!;

      // Check access to farm area
      if (currentUser.role !== 'ceo') {
        const canAccess = await assignmentRepo.canUserAccessFarmArea(currentUser.userId, currentUser.role, farmAreaId, requireOrgId(req));
        if (!canAccess) {
          throw new AppError('You do not have access to this farm area', 'FORBIDDEN', 403);
        }
      }

      // Check role hierarchy
      const targetUser = await userRepo.findById(userId);
      if (!targetUser) {
        throw new AppError('User not found', 'NOT_FOUND', 404);
      }

      const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
      if (!assignableRoles.includes(targetUser.role as UserRole)) {
        throw new AppError(`You cannot assign users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
      }

      const assignment = await assignmentRepo.assignUserToFarmArea(userId, farmAreaId, currentUser.userId);
      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
);

// Remove user from farm area
assignmentsRouter.delete('/farm-areas/:farmAreaId/users/:userId', async (req: AuthRequest, res, next) => {
  try {
    const { farmAreaId, userId } = req.params;
    const currentUser = req.user!;

    if (currentUser.role !== 'ceo') {
      const canAccess = await assignmentRepo.canUserAccessFarmArea(currentUser.userId, currentUser.role, farmAreaId, requireOrgId(req));
      if (!canAccess) {
        throw new AppError('You do not have access to this farm area', 'FORBIDDEN', 403);
      }
    }

    await assertCanUnassign(currentUser, userId);
    await assignmentRepo.removeUserFromFarmArea(userId, farmAreaId);
    res.json({ success: true, data: { message: 'User removed from farm area' } });
  } catch (error) {
    next(error);
  }
});

// ============ Field Assignments ============

// Assign user to field
const assignToFieldSchema = z.object({
  userId: z.string().uuid(),
});

assignmentsRouter.post(
  '/fields/:fieldId/users',
  validate({ body: assignToFieldSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { fieldId } = req.params;
      const { userId } = req.body;
      const currentUser = req.user!;

      // Check access to field
      if (currentUser.role !== 'ceo') {
        const canAccess = await assignmentRepo.canUserAccessField(currentUser.userId, currentUser.role, fieldId, requireOrgId(req));
        if (!canAccess) {
          throw new AppError('You do not have access to this field', 'FORBIDDEN', 403);
        }
      }

      // Check role hierarchy
      const targetUser = await userRepo.findById(userId);
      if (!targetUser) {
        throw new AppError('User not found', 'NOT_FOUND', 404);
      }

      const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
      if (!assignableRoles.includes(targetUser.role as UserRole)) {
        throw new AppError(`You cannot assign users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
      }

      const assignment = await assignmentRepo.assignUserToField(userId, fieldId, currentUser.userId);
      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
);

// Remove user from field
assignmentsRouter.delete('/fields/:fieldId/users/:userId', async (req: AuthRequest, res, next) => {
  try {
    const { fieldId, userId } = req.params;
    const currentUser = req.user!;

    if (currentUser.role !== 'ceo') {
      const canAccess = await assignmentRepo.canUserAccessField(currentUser.userId, currentUser.role, fieldId, requireOrgId(req));
      if (!canAccess) {
        throw new AppError('You do not have access to this field', 'FORBIDDEN', 403);
      }
    }

    await assertCanUnassign(currentUser, userId);
    await assignmentRepo.removeUserFromField(userId, fieldId);
    res.json({ success: true, data: { message: 'User removed from field' } });
  } catch (error) {
    next(error);
  }
});

// ============ Get Current User's Assignments ============

assignmentsRouter.get('/my-assignments', async (req: AuthRequest, res, next) => {
  try {
    const currentUser = req.user!;

    const [sites, farmAreas, fields] = await Promise.all([
      assignmentRepo.getUserSiteAssignments(currentUser.userId),
      assignmentRepo.getUserFarmAreaAssignments(currentUser.userId),
      assignmentRepo.getUserFieldAssignments(currentUser.userId),
    ]);

    res.json({
      success: true,
      data: {
        role: currentUser.role,
        sites,
        farmAreas,
        fields,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get user's accessible resources (for filtering dropdowns)
assignmentsRouter.get('/my-access', async (req: AuthRequest, res, next) => {
  try {
    const currentUser = req.user!;

    const [siteIds, farmAreaIds, fieldIds, managedZoneIds] = await Promise.all([
      assignmentRepo.getUserAccessibleSiteIds(currentUser.userId, currentUser.role, requireOrgId(req)),
      assignmentRepo.getUserAccessibleFarmAreaIds(currentUser.userId, currentUser.role, requireOrgId(req)),
      assignmentRepo.getUserAccessibleFieldIds(currentUser.userId, currentUser.role, requireOrgId(req)),
      // Zones a farm manager may rename and add/rename/delete sites in.
      assignmentRepo.getUserAssignedZoneIds(currentUser.userId, currentUser.role, requireOrgId(req)),
    ]);

    res.json({
      success: true,
      data: {
        role: currentUser.role,
        siteIds,
        farmAreaIds,
        fieldIds,
        managedZoneIds,
        isFullAccess: currentUser.role === 'ceo',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get users that can be assigned by current user
assignmentsRouter.get('/assignable-users', async (req: AuthRequest, res, next) => {
  try {
    const currentUser = req.user!;
    const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];

    if (assignableRoles.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const allUsers = await userRepo.list();
    const assignableUsers = allUsers.filter(u => assignableRoles.includes(u.role as UserRole));

    res.json({ success: true, data: assignableUsers });
  } catch (error) {
    next(error);
  }
});
