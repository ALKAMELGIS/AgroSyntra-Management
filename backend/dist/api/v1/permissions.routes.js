"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const permission_service_1 = require("../../services/permission.service");
exports.permissionsRouter = (0, express_1.Router)();
exports.permissionsRouter.use(auth_1.auth);
exports.permissionsRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'));
const grantSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    module: zod_1.z.string().min(1),
    permission: zod_1.z.enum(['read', 'write', 'admin']),
});
exports.permissionsRouter.get('/modules', (_req, res) => {
    res.json({ success: true, data: permission_service_1.AVAILABLE_MODULES });
});
exports.permissionsRouter.get('/user/:userId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const perms = await (0, permission_service_1.listUserPermissions)(req.params.userId);
    res.json({ success: true, data: perms });
}));
exports.permissionsRouter.post('/', (0, validate_1.validate)({ body: grantSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { userId, module, permission } = req.body;
    const perm = await (0, permission_service_1.grantPermission)(userId, module, permission, req.user.userId);
    res.status(201).json({ success: true, data: perm });
}));
exports.permissionsRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, permission_service_1.revokePermission)(req.params.id);
    res.json({ success: true, data: { deleted: true } });
}));
