"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agronomicRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const agronomicReference_service_1 = require("../../services/agronomicReference.service");
exports.agronomicRouter = (0, express_1.Router)();
exports.agronomicRouter.use(auth_1.auth);
const thresholdQuerySchema = zod_1.z.object({
    crop_id: zod_1.z.string().uuid().optional(),
});
exports.agronomicRouter.get('/thresholds', (0, validate_1.validate)({ query: thresholdQuerySchema }), async (req, res, next) => {
    try {
        const cropId = req.query.crop_id;
        const data = await (0, agronomicReference_service_1.listThresholds)(cropId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
exports.agronomicRouter.get('/parameters', (_req, res) => {
    res.json({ success: true, data: (0, agronomicReference_service_1.getValidParameters)() });
});
const upsertSchema = zod_1.z.object({
    cropId: zod_1.z.string().uuid(),
    parameter: zod_1.z.string().min(1),
    warningMin: zod_1.z.number().nullable().optional().default(null),
    warningMax: zod_1.z.number().nullable().optional().default(null),
    criticalMin: zod_1.z.number().nullable().optional().default(null),
    criticalMax: zod_1.z.number().nullable().optional().default(null),
    enabled: zod_1.z.boolean().default(true),
});
exports.agronomicRouter.post('/thresholds', auth_1.requireOperationManager, (0, validate_1.validate)({ body: upsertSchema }), async (req, res, next) => {
    try {
        const { cropId, parameter, warningMin, warningMax, criticalMin, criticalMax, enabled } = req.body;
        const data = await (0, agronomicReference_service_1.upsertThreshold)(cropId, parameter, warningMin ?? null, warningMax ?? null, criticalMin ?? null, criticalMax ?? null, enabled);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
const deleteParamsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.agronomicRouter.delete('/thresholds/:id', auth_1.requireOperationManager, (0, validate_1.validate)({ params: deleteParamsSchema }), async (req, res, next) => {
    try {
        await (0, agronomicReference_service_1.deleteThreshold)(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
