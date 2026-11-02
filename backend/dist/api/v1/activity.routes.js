"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const activityRouter = (0, express_1.Router)();
exports.activityRouter = activityRouter;
activityRouter.use(auth_1.auth);
/** GET /activity - recent activity for the feed (managers+ see all, workers see own) */
activityRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const role = req.user.role;
    const userId = req.user.userId;
    const isManager = ['ceo', 'farm_manager', 'operation_manager'].includes(role);
    const result = await client_1.dbPool.query(`SELECT
       al.id,
       al.action,
       al.entity AS entity_type,
       al.entity_id,
       al.created_at,
       u.name as user_name,
       u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.action IN ('CREATE', 'UPDATE', 'DELETE')
       AND al.entity IN ('harvest', 'fertigation_entry', 'ecph_entry', 'task', 'field', 'alert_event')
       ${isManager ? '' : 'AND al.user_id = $2'}
     ORDER BY al.created_at DESC
     LIMIT $1`, isManager ? [limit] : [limit, userId]);
    res.json({ success: true, data: result.rows });
}));
