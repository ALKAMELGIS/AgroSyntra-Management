"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cropsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const crop_service_1 = require("../../services/crop.service");
const validate_1 = require("../middleware/validate");
exports.cropsRouter = (0, express_1.Router)();
const service = new crop_service_1.CropService();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const cropIdSchema = zod_1.z.object({ cropId: zod_1.z.string().uuid() });
const varietyIdSchema = zod_1.z.object({ cropId: zod_1.z.string().uuid(), id: zod_1.z.string().uuid() });
const createVarietySchema = zod_1.z.object({ name: zod_1.z.string().min(1), breederId: zod_1.z.string().uuid().optional() });
const updateVarietySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    isActive: zod_1.z.boolean().optional(),
});
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
});
const createSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    dripperCount: zod_1.z.number().int().nonnegative().optional(),
    dripTestCount: zod_1.z.number().int().nonnegative().optional(),
    plantCount: zod_1.z.number().int().nonnegative().optional(),
});
const updateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    dripperCount: zod_1.z.number().int().nonnegative().optional(),
    dripTestCount: zod_1.z.number().int().nonnegative().optional(),
    plantCount: zod_1.z.number().int().nonnegative().optional(),
});
exports.cropsRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await service.list({ page, limit });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const crop = await service.getById(req.params.id);
        res.json({ success: true, data: crop });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const crop = await service.create(req.body);
        res.status(201).json({ success: true, data: crop });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.put('/:id', (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const crop = await service.update(req.params.id, req.body);
        res.json({ success: true, data: crop });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.delete('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
// ── Variety endpoints ─────────────────────────────────────────
exports.cropsRouter.get('/:cropId/varieties', (0, validate_1.validate)({ params: cropIdSchema }), async (req, res, next) => {
    try {
        const varieties = await service.listVarieties(req.params.cropId);
        res.json({ success: true, data: varieties });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.post('/:cropId/varieties', (0, validate_1.validate)({ params: cropIdSchema, body: createVarietySchema }), async (req, res, next) => {
    try {
        const variety = await service.createVariety(req.params.cropId, req.body.name, req.body.breederId);
        res.status(201).json({ success: true, data: variety });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.put('/:cropId/varieties/:id', (0, validate_1.validate)({ params: varietyIdSchema, body: updateVarietySchema }), async (req, res, next) => {
    try {
        const variety = await service.updateVariety(req.params.id, req.body);
        res.json({ success: true, data: variety });
    }
    catch (error) {
        next(error);
    }
});
exports.cropsRouter.delete('/:cropId/varieties/:id', (0, validate_1.validate)({ params: varietyIdSchema }), async (req, res, next) => {
    try {
        await service.removeVariety(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
