import { Router, Response } from 'express';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { createWebhook, listWebhooks, getDeliveries, deleteWebhook } from '../../services/webhook.service';

const webhooksRouter = Router();
webhooksRouter.use(auth);
webhooksRouter.use(authorize('ceo', 'operation_manager'));

/** GET /webhooks */
webhooksRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const hooks = await listWebhooks(req.user!.userId);
  res.json({ success: true, data: hooks });
}));

/** POST /webhooks */
webhooksRouter.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { url, events } = req.body;
  if (!url || !events?.length) {
    throw new AppError('URL and events are required', 'VALIDATION_ERROR', 400);
  }
  const hook = await createWebhook(req.user!.userId, url, events);
  res.status(201).json({ success: true, data: hook });
}));

/** GET /webhooks/:id/deliveries (verify ownership) */
webhooksRouter.get('/:id/deliveries', asyncHandler(async (req: AuthRequest, res: Response) => {
  const hooks = await listWebhooks(req.user!.userId);
  if (!hooks.some((h: any) => h.id === req.params.id)) {
    throw new AppError('Webhook not found', 'NOT_FOUND', 404);
  }
  const deliveries = await getDeliveries(req.params.id);
  res.json({ success: true, data: deliveries });
}));

/** DELETE /webhooks/:id */
webhooksRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteWebhook(req.params.id, req.user!.userId);
  res.json({ success: true });
}));

export { webhooksRouter };
