import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { AuthService } from '../../services/auth.service';
import { UserRole } from '../../models/user.model';
import { AppError } from '../../utils/errors';
import { dbPool } from '../../db/client';
import { tenantMiddleware } from './tenant';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    organizationId?: string;
  };
  organizationId?: string;
  isSuperAdmin?: boolean;
}

const authService = new AuthService();

/**
 * Authentication middleware - verifies JWT token
 */
export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    // Try Bearer token first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyAccessToken(token);

      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      };

      return tenantMiddleware(req, res, next);
    }

    // Fallback to API key
    if (apiKey) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      dbPool.query(
        `SELECT ak.*, u.role, u.email, u.organization_id
         FROM api_keys ak JOIN users u ON u.id = ak.user_id
         WHERE ak.key_hash = $1 AND ak.is_active = true
           AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
        [keyHash]
      ).then((result) => {
        if (result.rows.length === 0) {
          return next(new AppError('Invalid or expired API key', 'UNAUTHORIZED', 401));
        }
        const key = result.rows[0];
        dbPool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [key.id]).catch(() => {});
        req.user = {
          userId: key.user_id,
          email: key.email,
          role: key.role,
          organizationId: key.organization_id ?? undefined,
        };
        tenantMiddleware(req, res, next);
      }).catch(next);
      return;
    }

    throw new AppError('Authorization header missing or invalid', 'UNAUTHORIZED', 401);
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyAccessToken(token);
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      };
    }

    next();
  } catch {
    // Token invalid but optional, continue without user
    next();
  }
}

/**
 * Role-based authorization middleware
 * Must be used after auth middleware
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          'FORBIDDEN',
          403
        )
      );
    }

    next();
  };
}

/**
 * Require CEO role
 */
export const requireCeo = authorize('ceo');

/**
 * Require admin role (CEO) - legacy alias
 */
export const requireAdmin = authorize('ceo');

/**
 * Require manager or admin role (CEO or Farm Manager)
 */
export const requireManager = authorize('ceo', 'farm_manager');

/**
 * Require operation-level access
 */
export const requireOperationManager = authorize('ceo', 'farm_manager', 'operation_manager');

/** Roles with field-level data entry and IPM read access (includes pest agronomist). */
export const FIELD_STAFF_ROLES = [
  'ceo', 'farm_manager', 'operation_manager',
  'agronomist', 'pest_agronomist', 'scouter', 'worker',
] as const satisfies readonly UserRole[];

export const authorizeFieldStaff = authorize(...FIELD_STAFF_ROLES);

const authorizeFieldStaffOrOperator = authorize(...FIELD_STAFF_ROLES, 'operator');

/**
 * Field staff for everything; operators may additionally read (GET/HEAD) so the IPM
 * pages they use can show planting / bio-control context. Writes stay field staff only.
 */
export function authorizeFieldStaffRead(req: AuthRequest, res: Response, next: NextFunction) {
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  return (isRead ? authorizeFieldStaffOrOperator : authorizeFieldStaff)(req, res, next);
}

/**
 * Require agronomist-level access (can view but not manage)
 */
export const requireAgronomist = authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist');

export const requirePestAgronomist = authorize('pest_agronomist');

export const requireAuditor = authorize('auditor');

/**
 * PHI audit log review (confirm / dismiss a PHI conflict) is the auditor's job alone.
 * CEO and farm manager can read the log but not change a conflict's status.
 */
export const requirePhiAuditReviewer = authorize('auditor');

/**
 * Allow any authenticated user
 */
export const requireAuth = auth;

/**
 * Permission-based authorization middleware.
 * Checks role defaults first, then falls back to user_permissions table.
 */
export function checkPermission(module: string, permission: 'read' | 'write' | 'admin') {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
    }
    try {
      const { hasPermission } = await import('../../services/permission.service');
      const allowed = await hasPermission(req.user.userId, req.user.role, module, permission);
      if (!allowed) {
        return next(new AppError(
          `Access denied. You need '${permission}' permission on '${module}'.`,
          'FORBIDDEN', 403,
        ));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
