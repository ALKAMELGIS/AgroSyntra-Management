"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.workOrderRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const workOrderService = __importStar(require("../../services/workOrder.service"));
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const websocket_1 = require("../../websocket");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
exports.workOrderRouter = (0, express_1.Router)();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const canCreateOrView = (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'operator');
const canApproveReject = (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'pest_agronomist');
// ─── List ─────────────────────────────────────────────────────────
exports.workOrderRouter.get('/', canCreateOrView, async (req, res, next) => {
    try {
        const { site_id, status, page, limit } = req.query;
        const assignedTo = req.user.role === 'operator' ? req.user.userId : undefined;
        const result = await workOrderService.listWorkOrders({
            siteId: site_id, status, assignedTo, page, limit,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
// ─── Get operators list ───────────────────────────────────────────
exports.workOrderRouter.get('/operators', canCreateOrView, async (_req, res, next) => {
    try {
        const data = await workOrderService.getOperators();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
// ─── Get by ID ────────────────────────────────────────────────────
exports.workOrderRouter.get('/:id', canCreateOrView, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const wo = await workOrderService.getWorkOrderById(req.params.id);
        if (!wo)
            return res.status(404).json({ success: false, error: 'Work order not found' });
        res.json({ success: true, data: wo });
    }
    catch (error) {
        next(error);
    }
});
// ─── Create ───────────────────────────────────────────────────────
exports.workOrderRouter.post('/', canCreateOrView, async (req, res, next) => {
    try {
        if (req.body.siteId)
            await (0, tenantValidation_1.assertSiteInOrganization)(req.body.siteId, (0, tenant_1.requireOrgId)(req));
        const wo = await workOrderService.createWorkOrder(req.body, req.user.userId);
        (0, websocket_1.emitDataChange)('work_order', 'create', wo);
        res.status(201).json({ success: true, data: wo });
    }
    catch (error) {
        next(error);
    }
});
// ─── Update (draft/issued only) ──────────────────────────────────
exports.workOrderRouter.put('/:id', canCreateOrView, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const wo = await workOrderService.updateWorkOrder(req.params.id, req.body, req.user.userId);
        (0, websocket_1.emitDataChange)('work_order', 'update', wo);
        res.json({ success: true, data: wo });
    }
    catch (error) {
        next(error);
    }
});
// ─── Operator Submit ──────────────────────────────────────────────
exports.workOrderRouter.put('/:id/operator-submit', canCreateOrView, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const wo = await workOrderService.operatorSubmit(req.params.id, req.body, req.user.userId);
        (0, websocket_1.emitDataChange)('work_order', 'update', wo);
        res.json({ success: true, data: wo });
    }
    catch (error) {
        next(error);
    }
});
// ─── Approve ──────────────────────────────────────────────────────
exports.workOrderRouter.post('/:id/approve', canApproveReject, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const wo = await workOrderService.approveWorkOrder(req.params.id, req.user.userId);
        (0, websocket_1.emitDataChange)('work_order', 'update', wo);
        res.json({ success: true, data: wo });
    }
    catch (error) {
        next(error);
    }
});
// ─── Reject ───────────────────────────────────────────────────────
exports.workOrderRouter.post('/:id/reject', canApproveReject, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const wo = await workOrderService.rejectWorkOrder(req.params.id, req.body.reason, req.user.userId);
        (0, websocket_1.emitDataChange)('work_order', 'update', wo);
        res.json({ success: true, data: wo });
    }
    catch (error) {
        next(error);
    }
});
// ─── Delete (draft/rejected only) ────────────────────────────────
exports.workOrderRouter.delete('/:id', canCreateOrView, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await workOrderService.deleteWorkOrder(req.params.id);
        (0, websocket_1.emitDataChange)('work_order', 'delete', { id: req.params.id });
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
