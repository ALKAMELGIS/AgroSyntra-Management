"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recipesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const recipe_service_1 = require("../../services/recipe.service");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
exports.recipesRouter = (0, express_1.Router)();
const service = new recipe_service_1.RecipeService();
const canEditRecipes = (0, auth_1.checkPermission)('recipes', 'write');
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
});
const fertilizerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    dose: zod_1.z.number().optional(),
    kgPerLiter: zod_1.z.number().optional(),
    tankVolume: zod_1.z.number().optional(),
    quantityPer1000L: zod_1.z.number().optional(),
    elementPpm: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
    element: zod_1.z.string().optional(),
    concentration: zod_1.z.number().optional(),
});
const createSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    tankVolume: zod_1.z.number().optional(),
    cycles: zod_1.z.number().int().optional(),
    elementPpm: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
    fertilizers: zod_1.z.array(fertilizerSchema).optional(),
});
const updateSchema = createSchema.partial();
exports.recipesRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await service.list({ page, limit });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.recipesRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const recipe = await service.getById(req.params.id);
        res.json({ success: true, data: recipe });
    }
    catch (error) {
        next(error);
    }
});
exports.recipesRouter.post('/', canEditRecipes, (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const recipe = await service.create(req.body);
        res.status(201).json({ success: true, data: recipe });
    }
    catch (error) {
        next(error);
    }
});
exports.recipesRouter.put('/:id', canEditRecipes, (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const recipe = await service.update(req.params.id, req.body);
        res.json({ success: true, data: recipe });
    }
    catch (error) {
        next(error);
    }
});
exports.recipesRouter.delete('/:id', canEditRecipes, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
