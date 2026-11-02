import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { listFlags, updateFlag, createFlag, deleteFlag, isFeatureEnabled } from '../../services/featureFlag.service';

export const featureFlagsRouter = Router();
featureFlagsRouter.use(auth);

featureFlagsRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const flags = await listFlags();
    res.json({ success: true, data: flags });
  }),
);

featureFlagsRouter.get(
  '/check/:key',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const enabled = await isFeatureEnabled(req.params.key, req.user?.role);
    res.json({ success: true, data: { key: req.params.key, enabled } });
  }),
);

/** Feature flag create/update/delete: CEO only. */
export const adminOnly = authorize('ceo');

const createSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  description: z.string().optional().default(''),
  enabled: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  roles: z.array(z.string()).optional(),
});

featureFlagsRouter.post(
  '/',
  adminOnly,
  validate({ body: createSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const flag = await createFlag(req.body.key, req.body.description, req.body.enabled);
    res.status(201).json({ success: true, data: flag });
  }),
);

featureFlagsRouter.put(
  '/:id',
  adminOnly,
  validate({ body: updateSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const flag = await updateFlag(req.params.id, req.body);
    res.json({ success: true, data: flag });
  }),
);

featureFlagsRouter.delete(
  '/:id',
  adminOnly,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await deleteFlag(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
);
