"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureFlagsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const featureFlag_service_1 = require("../../services/featureFlag.service");
exports.featureFlagsRouter = (0, express_1.Router)();
exports.featureFlagsRouter.use(auth_1.auth);
exports.featureFlagsRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const flags = await (0, featureFlag_service_1.listFlags)();
    res.json({ success: true, data: flags });
}));
exports.featureFlagsRouter.get('/check/:key', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const enabled = await (0, featureFlag_service_1.isFeatureEnabled)(req.params.key, req.user?.role);
    res.json({ success: true, data: { key: req.params.key, enabled } });
}));
const adminOnly = (0, auth_1.authorize)('ceo', 'farm_manager');
const createSchema = zod_1.z.object({
    key: zod_1.z.string().min(1).regex(/^[a-z0-9_]+$/),
    description: zod_1.z.string().optional().default(''),
    enabled: zod_1.z.boolean().optional().default(false),
});
const updateSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().optional(),
    description: zod_1.z.string().optional(),
    roles: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.featureFlagsRouter.post('/', adminOnly, (0, validate_1.validate)({ body: createSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const flag = await (0, featureFlag_service_1.createFlag)(req.body.key, req.body.description, req.body.enabled);
    res.status(201).json({ success: true, data: flag });
}));
exports.featureFlagsRouter.put('/:id', adminOnly, (0, validate_1.validate)({ body: updateSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const flag = await (0, featureFlag_service_1.updateFlag)(req.params.id, req.body);
    res.json({ success: true, data: flag });
}));
exports.featureFlagsRouter.delete('/:id', adminOnly, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, featureFlag_service_1.deleteFlag)(req.params.id);
    res.json({ success: true, data: { deleted: true } });
}));
