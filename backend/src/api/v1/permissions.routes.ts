import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { validate } from '../middleware/validate';
import { dbPool } from '../../db/client';
import { outranksForManagement } from '../../models/user.model';
import {
  listUserPermissions,
  grantPermission,
  revokePermission,
  AVAILABLE_MODULES,
} from '../../services/permission.service';

export const permissionsRouter = Router();
permissionsRouter.use(auth);
permissionsRouter.use(authorize('ceo', 'farm_manager', 'operation_manager'));

const grantSchema = z.object({
  userId: z.string().uuid(),
  module: z.string().min(1),
  permission: z.enum(['read', 'write', 'admin']),
});
const userParamSchema = z.object({ userId: z.string().uuid() });
const idParamSchema = z.object({ id: z.string().uuid() });

type TargetUser = { id: string; role: string; organization_id: string | null };

async function loadUser(userId: string): Promise<TargetUser | null> {
  const result = await dbPool.query(
    `SELECT id, role, organization_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return result.rows[0] || null;
}

/**
 * Grants and revokes: only for another user in the caller's own organization whose role
 * ranks strictly below the caller's (and is one the caller can assign). Never self.
 */
function assertCanManage(req: AuthRequest, target: TargetUser | null): asserts target is TargetUser {
  const orgId = requireOrgId(req);
  if (!target || target.organization_id !== orgId) {
    throw new AppError('User not found', 'NOT_FOUND', 404);
  }
  if (target.id === req.user!.userId) {
    throw new AppError('You cannot change your own permissions', 'FORBIDDEN', 403);
  }
  if (!outranksForManagement(req.user!.role, target.role)) {
    throw new AppError('You can only manage permissions of users below your role', 'FORBIDDEN', 403);
  }
}

permissionsRouter.get('/modules', (_req, res: Response) => {
  res.json({ success: true, data: AVAILABLE_MODULES });
});

permissionsRouter.get(
  '/user/:userId',
  validate({ params: userParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const target = await loadUser(req.params.userId);
    if (!target || target.organization_id !== requireOrgId(req)) {
      throw new AppError('User not found', 'NOT_FOUND', 404);
    }
    const perms = await listUserPermissions(req.params.userId);
    res.json({ success: true, data: perms });
  }),
);

permissionsRouter.post(
  '/',
  validate({ body: grantSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId, module, permission } = req.body;
    assertCanManage(req, await loadUser(userId));
    const perm = await grantPermission(userId, module, permission, req.user!.userId);
    res.status(201).json({ success: true, data: perm });
  }),
);

permissionsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const found = await dbPool.query(
      `SELECT up.id, up.user_id FROM user_permissions up WHERE up.id = $1`,
      [req.params.id],
    );
    const perm = found.rows[0];
    if (!perm) throw new AppError('Permission not found', 'NOT_FOUND', 404);
    assertCanManage(req, await loadUser(perm.user_id));
    await revokePermission(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
);
