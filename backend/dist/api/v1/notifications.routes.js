"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const push_notification_service_1 = require("../../services/push-notification.service");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
exports.notificationsRouter = (0, express_1.Router)();
// All routes require authentication
exports.notificationsRouter.use(auth_1.auth);
// ============ Device Token Management ============
// Register push token
const registerTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    deviceType: zod_1.z.enum(['ios', 'android', 'web']),
    deviceName: zod_1.z.string().optional(),
});
exports.notificationsRouter.post('/register-token', (0, validate_1.validate)({ body: registerTokenSchema }), async (req, res, next) => {
    try {
        const { token, deviceType, deviceName } = req.body;
        const userId = req.user.userId;
        const result = await push_notification_service_1.pushNotificationService.registerToken(userId, token, deviceType, deviceName);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        next(error);
    }
});
// Unregister push token
const unregisterTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
});
exports.notificationsRouter.post('/unregister-token', (0, validate_1.validate)({ body: unregisterTokenSchema }), async (req, res, next) => {
    try {
        const { token } = req.body;
        const userId = req.user.userId;
        await push_notification_service_1.pushNotificationService.unregisterToken(userId, token);
        res.json({
            success: true,
            data: { message: 'Token unregistered' },
        });
    }
    catch (error) {
        next(error);
    }
});
// ============ Notification Preferences ============
// Get preferences
exports.notificationsRouter.get('/preferences', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const prefs = await push_notification_service_1.pushNotificationService.getPreferences(userId);
        res.json({
            success: true,
            data: prefs,
        });
    }
    catch (error) {
        next(error);
    }
});
// Update preferences
const updatePrefsSchema = zod_1.z.object({
    pushEnabled: zod_1.z.boolean().optional(),
    emailEnabled: zod_1.z.boolean().optional(),
    alertNotifications: zod_1.z.boolean().optional(),
    reminderNotifications: zod_1.z.boolean().optional(),
    infoNotifications: zod_1.z.boolean().optional(),
    quietHoursStart: zod_1.z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    quietHoursEnd: zod_1.z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});
exports.notificationsRouter.put('/preferences', (0, validate_1.validate)({ body: updatePrefsSchema }), async (req, res, next) => {
    try {
        const userId = req.user.userId;
        await push_notification_service_1.pushNotificationService.updatePreferences(userId, req.body);
        const prefs = await push_notification_service_1.pushNotificationService.getPreferences(userId);
        res.json({
            success: true,
            data: prefs,
        });
    }
    catch (error) {
        next(error);
    }
});
// ============ Notification History ============
// Get user's notifications
exports.notificationsRouter.get('/', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 50;
        const notifications = await push_notification_service_1.pushNotificationService.getUserNotifications(userId, limit);
        const unreadCount = await push_notification_service_1.pushNotificationService.getUnreadCount(userId);
        res.json({
            success: true,
            data: {
                notifications,
                unreadCount,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Mark notification as read
exports.notificationsRouter.post('/:id/read', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const notificationId = req.params.id;
        await push_notification_service_1.pushNotificationService.markAsRead(notificationId, userId);
        res.json({
            success: true,
            data: { message: 'Notification marked as read' },
        });
    }
    catch (error) {
        next(error);
    }
});
// Get unread count
exports.notificationsRouter.get('/unread-count', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const count = await push_notification_service_1.pushNotificationService.getUnreadCount(userId);
        res.json({
            success: true,
            data: { count },
        });
    }
    catch (error) {
        next(error);
    }
});
// ============ Send Notifications (Manager+) ============
// Send notification to specific user
const sendNotificationSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid().optional(),
    userIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    siteId: zod_1.z.string().uuid().optional(),
    broadcast: zod_1.z.boolean().optional(),
    title: zod_1.z.string().min(1),
    body: zod_1.z.string().min(1),
    type: zod_1.z.enum(['alert', 'reminder', 'info', 'warning', 'success']),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
exports.notificationsRouter.post('/send', auth_1.requireManager, (0, validate_1.validate)({ body: sendNotificationSchema }), async (req, res, next) => {
    try {
        const { userId, userIds, siteId, broadcast, title, body, type, data } = req.body;
        const notification = { title, body, type, data };
        if (broadcast) {
            await push_notification_service_1.pushNotificationService.sendToAllUsers(notification);
            return res.json({ success: true, data: { message: 'Broadcast sent' } });
        }
        if (siteId) {
            await push_notification_service_1.pushNotificationService.broadcastToSite(siteId, notification);
            return res.json({ success: true, data: { message: 'Site notification sent' } });
        }
        if (userIds && userIds.length > 0) {
            await push_notification_service_1.pushNotificationService.sendToMultipleUsers(userIds, notification);
            return res.json({ success: true, data: { message: `Notification sent to ${userIds.length} users` } });
        }
        if (userId) {
            const tickets = await push_notification_service_1.pushNotificationService.sendToUser(userId, notification);
            return res.json({ success: true, data: { ticketCount: tickets.length } });
        }
        return res.status(400).json({
            success: false,
            error: { message: 'Must specify userId, userIds, siteId, or broadcast' },
        });
    }
    catch (error) {
        next(error);
    }
});
// Test notification to self
exports.notificationsRouter.post('/test', async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const tickets = await push_notification_service_1.pushNotificationService.sendToUser(userId, {
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
    }
    catch (error) {
        next(error);
    }
});
