"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.irrigationRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const irrigationAdvisor_service_1 = require("../../services/irrigationAdvisor.service");
const irrigationRouter = (0, express_1.Router)();
exports.irrigationRouter = irrigationRouter;
irrigationRouter.use(auth_1.auth);
/** GET /irrigation-advice/:fieldId -- get irrigation advice for a field */
irrigationRouter.get('/:fieldId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const advice = await (0, irrigationAdvisor_service_1.getIrrigationAdvice)(req.params.fieldId);
    res.json({ success: true, data: advice });
}));
