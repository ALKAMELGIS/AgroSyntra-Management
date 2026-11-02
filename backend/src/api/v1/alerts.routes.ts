import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  getAlertRules,
  upsertAlertRule,
} from '../../services/alertEngine.service';

const upsertRuleSchema = z.object({
  entity_type: z.string().min(1),
  metric: z.string().min(1),
  operator: z.enum(['>', '<', '>=', '<=', '==', '!=']),
  threshold: z.number(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  is_active: z.boolean().optional(),
});

const alertsRouter = Router();
alertsRouter.use(auth);

/**
 * GET /alerts/notifications
 * Get current user's notifications
 */
alertsRouter.get('/notifications', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const unreadOnly = req.query.unread === 'true';
  const notifications = await getUserNotifications(req.user!.userId, limit, unreadOnly);
  res.json({ success: true, data: notifications });
}));

/**
 * GET /alerts/notifications/count
 * Get unread notification count
 */
alertsRouter.get('/notifications/count', asyncHandler(async (req: AuthRequest, res: Response) => {
  const count = await getUnreadCount(req.user!.userId);
  res.json({ success: true, data: { count } });
}));

/**
 * POST /alerts/notifications/read
 * Mark notification(s) as read
 */
alertsRouter.post('/notifications/read', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ids } = req.body; // optional array of IDs; omit to mark all read
  await markAsRead(req.user!.userId, ids);
  res.json({ success: true });
}));

/**
 * GET /alerts/rules
 * Get all alert rules (manager+)
 */
alertsRouter.get('/rules', authorize('ceo', 'farm_manager', 'operation_manager'), asyncHandler(async (_req: AuthRequest, res: Response) => {
  const rules = await getAlertRules();
  res.json({ success: true, data: rules });
}));

/**
 * POST /alerts/rules
 * Create or update an alert rule (manager+)
 */
alertsRouter.post('/rules', authorize('ceo', 'farm_manager', 'operation_manager'), validate({ body: upsertRuleSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rule = await upsertAlertRule({ ...req.body, created_by: req.user!.userId });
  res.json({ success: true, data: rule });
}));

export { alertsRouter };
