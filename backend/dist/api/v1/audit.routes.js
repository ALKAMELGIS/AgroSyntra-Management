"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auditLog_service_1 = require("../../services/auditLog.service");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const auditRouter = (0, express_1.Router)();
// Protect all audit routes - require authentication; only managers and above can view audit logs
auditRouter.use(auth_1.auth);
auditRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'));
/**
 * @swagger
 * /audit:
 *   get:
 *     summary: Query audit logs
 *     tags: [Audit]
 */
auditRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const query = {
        userId: req.query.userId,
        entity: req.query.entity,
        action: req.query.action,
        entityId: req.query.entityId,
        startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
    };
    const result = await (0, auditLog_service_1.queryAuditLogs)(query);
    res.json({
        success: true,
        data: {
            logs: result.logs,
            pagination: {
                total: result.total,
                limit: query.limit,
                offset: query.offset,
            },
        },
    });
}));
/**
 * @swagger
 * /audit/entity/{entity}/{entityId}:
 *   get:
 *     summary: Get audit history for a specific entity
 *     tags: [Audit]
 */
auditRouter.get('/entity/:entity/:entityId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { entity, entityId } = req.params;
    const logs = await (0, auditLog_service_1.getEntityAuditHistory)(entity, entityId);
    res.json({
        success: true,
        data: logs,
    });
}));
/**
 * @swagger
 * /audit/user/{userId}:
 *   get:
 *     summary: Get recent activity for a user
 *     tags: [Audit]
 */
auditRouter.get('/user/:userId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { userId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const logs = await (0, auditLog_service_1.getUserActivity)(userId, limit);
    res.json({
        success: true,
        data: logs,
    });
}));
exports.default = auditRouter;
