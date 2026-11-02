"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictionsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const yieldPrediction_service_1 = require("../../services/yieldPrediction.service");
const cropRecommendation_service_1 = require("../../services/cropRecommendation.service");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
const predictionsRouter = (0, express_1.Router)();
exports.predictionsRouter = predictionsRouter;
predictionsRouter.use(auth_1.auth);
predictionsRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist'));
/** GET /predictions/yield/:fieldId */
predictionsRouter.get('/yield/:fieldId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, tenantValidation_1.assertFieldInOrganization)(req.params.fieldId, (0, tenant_1.requireOrgId)(req));
    const prediction = await (0, yieldPrediction_service_1.predictYield)(req.params.fieldId);
    res.json({ success: true, data: prediction });
}));
/** GET /recommendations/crop/:fieldId */
predictionsRouter.get('/crop/:fieldId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, tenantValidation_1.assertFieldInOrganization)(req.params.fieldId, (0, tenant_1.requireOrgId)(req));
    const recommendations = await (0, cropRecommendation_service_1.recommendCrops)(req.params.fieldId);
    res.json({ success: true, data: recommendations });
}));
