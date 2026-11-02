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
exports.inventoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const inventoryService = __importStar(require("../../services/inventory.service"));
const createItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(300),
    category: zod_1.z.string().min(1),
    unit: zod_1.z.string().min(1),
    current_stock: zod_1.z.number().min(0).optional(),
    min_stock_level: zod_1.z.number().min(0).optional(),
    cost_per_unit: zod_1.z.number().min(0).optional(),
    supplier: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const txSchema = zod_1.z.object({
    type: zod_1.z.enum(['purchase', 'usage', 'adjustment', 'return']),
    quantity: zod_1.z.number(),
    referenceType: zod_1.z.string().optional(),
    referenceId: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const inventoryRouter = (0, express_1.Router)();
exports.inventoryRouter = inventoryRouter;
inventoryRouter.use(auth_1.auth);
// List items
inventoryRouter.get('/', async (req, res, next) => {
    try {
        const result = await inventoryService.listItems({
            category: req.query.category,
            search: req.query.search,
            lowStockOnly: req.query.low_stock === 'true',
            page: req.query.page ? parseInt(req.query.page) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (err) {
        next(err);
    }
});
// Low-stock items
inventoryRouter.get('/low-stock', async (_req, res, next) => {
    try {
        const items = await inventoryService.getLowStockItems();
        res.json({ success: true, data: items });
    }
    catch (err) {
        next(err);
    }
});
// Get single item with transactions
inventoryRouter.get('/:id', async (req, res, next) => {
    try {
        const item = await inventoryService.getItem(req.params.id);
        res.json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Create item
inventoryRouter.post('/', (0, validate_1.validate)({ body: createItemSchema }), async (req, res, next) => {
    try {
        const item = await inventoryService.createItem({ ...req.body, createdBy: req.user.userId });
        res.status(201).json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Update item
inventoryRouter.put('/:id', async (req, res, next) => {
    try {
        const item = await inventoryService.updateItem(req.params.id, req.body);
        res.json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Soft-delete item
inventoryRouter.delete('/:id', async (req, res, next) => {
    try {
        await inventoryService.deleteItem(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// Record a transaction (purchase, adjustment, return)
inventoryRouter.post('/:id/transactions', (0, validate_1.validate)({ body: txSchema }), async (req, res, next) => {
    try {
        const tx = await inventoryService.recordTransaction(req.params.id, req.body.type, req.body.quantity, req.body.referenceType || 'manual', req.body.referenceId || null, req.body.notes || null, req.user.userId);
        res.status(201).json({ success: true, data: tx });
    }
    catch (err) {
        next(err);
    }
});
// Transaction history for an item
inventoryRouter.get('/:id/transactions', async (req, res, next) => {
    try {
        const txs = await inventoryService.getTransactionHistory(req.params.id, req.query.start_date, req.query.end_date);
        res.json({ success: true, data: txs });
    }
    catch (err) {
        next(err);
    }
});
