"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchTraceRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const batchTrace_service_1 = require("../../services/batchTrace.service");
const tenant_1 = require("../middleware/tenant");
exports.batchTraceRouter = (0, express_1.Router)();
exports.batchTraceRouter.use(auth_1.auth);
const batchTraceQuerySchema = zod_1.z.object({
    batch_number: zod_1.z.string().trim().min(1, 'Batch number is required'),
});
exports.batchTraceRouter.get('/', async (req, res, next) => {
    try {
        const parsed = batchTraceQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: parsed.error.issues[0]?.message ?? 'Invalid query parameters',
            });
        }
        const data = await (0, batchTrace_service_1.traceByBatchNumber)(parsed.data.batch_number, (0, tenant_1.requireOrgId)(req));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
