import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { AppError } from '../../utils/errors';
import { isSuperAdminEmail } from '../../utils/superAdmin';
import { getOrganizationById, getUserOrganizationId } from '../../services/organization.service';
import { logger } from '../../utils/logger';

export interface TenantRequest extends AuthRequest {
  organizationId?: string;
  isSuperAdmin?: boolean;
  isActingAsOrg?: boolean;
}

const ACT_AS_ORG_HEADER = 'x-act-as-organization';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrgId(req: TenantRequest): string | null {
  return req.organizationId || req.user?.organizationId || null;
}

export function requireOrgId(req: TenantRequest): string {
  const orgId = getOrgId(req);
  if (!orgId) {
    throw new AppError('Organization membership required', 'FORBIDDEN', 403);
  }
  return orgId;
}

/**
 * Attach organization context after auth. JWT claim is preferred; DB is fallback
 * for legacy tokens. Super-admins may act-as another org via X-Act-As-Organization.
 */
export async function tenantMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      next();
      return;
    }

    if (isSuperAdminEmail(req.user.email)) {
      req.isSuperAdmin = true;
    }

    const actAsHeader = req.headers[ACT_AS_ORG_HEADER];
    const actAsOrgId = typeof actAsHeader === 'string' ? actAsHeader.trim() : null;

    if (actAsOrgId) {
      if (!req.isSuperAdmin) {
        next(new AppError('Super admin access required', 'FORBIDDEN', 403));
        return;
      }
      if (!UUID_REGEX.test(actAsOrgId)) {
        next(new AppError('Invalid organization id', 'VALIDATION_ERROR', 400));
        return;
      }
      await getOrganizationById(actAsOrgId);
      req.organizationId = actAsOrgId;
      req.user.organizationId = actAsOrgId;
      req.isActingAsOrg = true;
      logger.info(
        { userId: req.user.userId, email: req.user.email, actAsOrgId },
        'Super admin acting as organization',
      );
      next();
      return;
    }

    let orgId = req.user.organizationId ?? null;
    if (!orgId) {
      orgId = await getUserOrganizationId(req.user.userId);
    }

    if (orgId) {
      req.organizationId = orgId;
      req.user.organizationId = orgId;
      next();
      return;
    }

    if (req.isSuperAdmin) {
      next();
      return;
    }

    next(new AppError('Organization membership required', 'FORBIDDEN', 403));
  } catch (error) {
    next(error);
  }
}
