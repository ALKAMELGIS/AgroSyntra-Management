"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const alertEngine_service_1 = require("../../services/alertEngine.service");
const upsertRuleSchema = zod_1.z.object({
    entity_type: zod_1.z.string().min(1),
    metric: zod_1.z.string().min(1),
    operator: zod_1.z.enum(['>', '<', '>=', '<=', '==', '!=']),
    threshold: zod_1.z.number(),
    severity: zod_1.z.enum(['info', 'warning', 'critical']).optional(),
    is_active: zod_1.z.boolean().optional(),
});
const alertsRouter = (0, express_1.Router)();
exports.alertsRouter = alertsRouter;
alertsRouter.use(auth_1.auth);
/**
 * GET /alerts/notifications
 * Get current user's notifications
 */
alertsRouter.get('/notifications', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const unreadOnly = req.query.unread === 'true';
    const notifications = await (0, alertEngine_service_1.getUserNotifications)(req.user.userId, limit, unreadOnly);
    res.json({ success: true, data: notifications });
}));
/**
 * GET /alerts/notifications/count
 * Get unread notification count
 */
alertsRouter.get('/notifications/count', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const count = await (0, alertEngine_service_1.getUnreadCount)(req.user.userId);
    res.json({ success: true, data: { count } });
}));
/**
 * POST /alerts/notifications/read
 * Mark notification(s) as read
 */
alertsRouter.post('/notifications/read', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { ids } = req.body; // optional array of IDs; omit to mark all read
    await (0, alertEngine_service_1.markAsRead)(req.user.userId, ids);
    res.json({ success: true });
}));
/**
 * GET /alerts/rules
 * Get all alert rules (manager+)
 */
alertsRouter.get('/rules', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const rules = await (0, alertEngine_service_1.getAlertRules)();
    res.json({ success: true, data: rules });
}));
/**
 * POST /alerts/rules
 * Create or update an alert rule (manager+)
 */
alertsRouter.post('/rules', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ body: upsertRuleSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const rule = await (0, alertEngine_service_1.upsertAlertRule)({ ...req.body, created_by: req.user.userId });
    res.json({ success: true, data: rule });
}));
