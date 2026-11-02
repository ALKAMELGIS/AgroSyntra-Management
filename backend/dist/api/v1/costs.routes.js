"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.costsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const asyncHandler_1 = require("../../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const cost_service_1 = require("../../services/cost.service");
const createCostSchema = zod_1.z.object({
    field_id: zod_1.z.string().uuid(),
    category: zod_1.z.string().min(1),
    amount: zod_1.z.number().min(0),
    currency: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    date: zod_1.z.string(),
});
const updateCostSchema = zod_1.z.object({
    field_id: zod_1.z.string().uuid().optional(),
    category: zod_1.z.string().min(1).optional(),
    amount: zod_1.z.number().min(0).optional(),
    description: zod_1.z.string().optional(),
    date: zod_1.z.string().optional(),
});
const costsRouter = (0, express_1.Router)();
exports.costsRouter = costsRouter;
costsRouter.use(auth_1.auth);
/** GET /costs - list cost entries with filters + role scoping */
costsRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const role = req.user.role;
    const userId = req.user.userId;
    const result = await (0, cost_service_1.listCosts)({
        organizationId: (0, tenant_1.requireOrgId)(req),
        field_id: req.query.field_id,
        category: req.query.category,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
        created_by: ['worker', 'team_leader'].includes(role) ? userId : undefined,
    });
    res.json({ success: true, data: result.costs, meta: { total: result.total } });
}));
/** GET /costs/summary - aggregated cost summary */
costsRouter.get('/summary', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const summary = await (0, cost_service_1.getCostSummary)({
        organizationId: (0, tenant_1.requireOrgId)(req),
        field_id: req.query.field_id,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
    });
    res.json({ success: true, data: summary });
}));
/** POST /costs - create cost entry */
costsRouter.post('/', (0, validate_1.validate)({ body: createCostSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const cost = await (0, cost_service_1.createCost)({ ...req.body, created_by: req.user.userId });
    res.status(201).json({ success: true, data: cost });
}));
/** PUT /costs/:id - update cost entry (managers+ only) */
costsRouter.put('/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ body: updateCostSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const cost = await (0, cost_service_1.updateCost)(req.params.id, req.body);
    res.json({ success: true, data: cost });
}));
/** DELETE /costs/:id - delete cost entry (managers+ only) */
costsRouter.delete('/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await (0, cost_service_1.deleteCost)(req.params.id);
    res.json({ success: true });
}));
