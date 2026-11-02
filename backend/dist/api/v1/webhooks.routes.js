"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhooksRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const webhook_service_1 = require("../../services/webhook.service");
const webhooksRouter = (0, express_1.Router)();
exports.webhooksRouter = webhooksRouter;
webhooksRouter.use(auth_1.auth);
webhooksRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'));
/** GET /webhooks */
webhooksRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const hooks = await (0, webhook_service_1.listWebhooks)(req.user.userId);
    res.json({ success: true, data: hooks });
}));
/** POST /webhooks */
webhooksRouter.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { url, events } = req.body;
    if (!url || !events?.length) {
        throw new errors_1.AppError('URL and events are required', 'VALIDATION_ERROR', 400);
    }
    const hook = await (0, webhook_service_1.createWebhook)(req.user.userId, url, events);
    res.status(201).json({ success: true, data: hook });
}));
/** GET /webhooks/:id/deliveries (verify ownership) */
webhooksRouter.get('/:id/deliveries', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const hooks = await (0, webhook_service_1.listWebhooks)(req.user.userId);
    if (!hooks.some((h) => h.id === req.params.id)) {
        throw new errors_1.AppError('Webhook not found', 'NOT_FOUND', 404);
    }
    const deliveries = await (0, webhook_service_1.getDeliveries)(req.params.id);
    res.json({ success: true, data: deliveries });
}));
/** DELETE /webhooks/:id */
webhooksRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, webhook_service_1.deleteWebhook)(req.params.id, req.user.userId);
    res.json({ success: true });
}));
