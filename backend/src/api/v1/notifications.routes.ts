import { Router } from 'express';
import { z } from 'zod';
import { pushNotificationService } from '../../services/push-notification.service';
import { validate } from '../middleware/validate';
import { auth, AuthRequest, requireManager } from '../middleware/auth';

export const notificationsRouter = Router();

// All routes require authentication
notificationsRouter.use(auth);

// ============ Device Token Management ============

// Register push token
const registerTokenSchema = z.object({
  token: z.string().min(1),
  deviceType: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().optional(),
});

notificationsRouter.post(
  '/register-token',
  validate({ body: registerTokenSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { token, deviceType, deviceName } = req.body;
      const userId = req.user!.userId;

      const result = await pushNotificationService.registerToken(userId, token, deviceType, deviceName);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Unregister push token
const unregisterTokenSchema = z.object({
  token: z.string().min(1),
});

notificationsRouter.post(
  '/unregister-token',
  validate({ body: unregisterTokenSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { token } = req.body;
      const userId = req.user!.userId;

      await pushNotificationService.unregisterToken(userId, token);

      res.json({
        success: true,
        data: { message: 'Token unregistered' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============ Notification Preferences ============

// Get preferences
notificationsRouter.get('/preferences', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const prefs = await pushNotificationService.getPreferences(userId);

    res.json({
      success: true,
      data: prefs,
    });
  } catch (error) {
    next(error);
  }
});

// Update preferences
const updatePrefsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  alertNotifications: z.boolean().optional(),
  reminderNotifications: z.boolean().optional(),
  infoNotifications: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

notificationsRouter.put(
  '/preferences',
  validate({ body: updatePrefsSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.userId;
      await pushNotificationService.updatePreferences(userId, req.body);

      const prefs = await pushNotificationService.getPreferences(userId);

      res.json({
        success: true,
        data: prefs,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============ Notification History ============

// Get user's notifications
notificationsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 50;

    const notifications = await pushNotificationService.getUserNotifications(userId, limit);
    const unreadCount = await pushNotificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
notificationsRouter.post('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const notificationId = req.params.id;

    await pushNotificationService.markAsRead(notificationId, userId);

    res.json({
      success: true,
      data: { message: 'Notification marked as read' },
    });
  } catch (error) {
    next(error);
  }
});

// Get unread count
notificationsRouter.get('/unread-count', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const count = await pushNotificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
});

// ============ Send Notifications (Manager+) ============

// Send notification to specific user
const sendNotificationSchema = z.object({
  userId: z.string().uuid().optional(),
  userIds: z.array(z.string().uuid()).optional(),
  siteId: z.string().uuid().optional(),
  broadcast: z.boolean().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  type: z.enum(['alert', 'reminder', 'info', 'warning', 'success']),
  data: z.record(z.string(), z.any()).optional(),
});

notificationsRouter.post(
  '/send',
  requireManager,
  validate({ body: sendNotificationSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { userId, userIds, siteId, broadcast, title, body, type, data } = req.body;

      const notification = { title, body, type, data };

      if (broadcast) {
        await pushNotificationService.sendToAllUsers(notification);
        return res.json({ success: true, data: { message: 'Broadcast sent' } });
      }

      if (siteId) {
        await pushNotificationService.broadcastToSite(siteId, notification);
        return res.json({ success: true, data: { message: 'Site notification sent' } });
      }

      if (userIds && userIds.length > 0) {
        await pushNotificationService.sendToMultipleUsers(userIds, notification);
        return res.json({ success: true, data: { message: `Notification sent to ${userIds.length} users` } });
      }

      if (userId) {
        const tickets = await pushNotificationService.sendToUser(userId, notification);
        return res.json({ success: true, data: { ticketCount: tickets.length } });
      }

      return res.status(400).json({
        success: false,
        error: { message: 'Must specify userId, userIds, siteId, or broadcast' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Test notification to self
notificationsRouter.post('/test', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.userId;

    const tickets = await pushNotificationService.sendToUser(userId, {
      title: 'Test Notification',
      body: 'This is a test notification from Al Maha Farm',
      type: 'info',
      data: { test: true },
    });

    res.json({
      success: true,
      data: {
        message: tickets.length > 0 ? 'Test notification sent' : 'No registered devices found',
        ticketCount: tickets.length,
      },
    });
  } catch (error) {
    next(error);
  }
});
