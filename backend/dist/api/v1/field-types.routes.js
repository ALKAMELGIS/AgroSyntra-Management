"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTypesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const field_type_service_1 = require("../../services/field-type.service");
const validate_1 = require("../middleware/validate");
exports.fieldTypesRouter = (0, express_1.Router)();
const service = new field_type_service_1.FieldTypeService();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
});
const createSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    namingPattern: zod_1.z.string().optional(),
    defaultValveCount: zod_1.z.number().int().nonnegative().optional(),
});
const updateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    namingPattern: zod_1.z.string().optional(),
    defaultValveCount: zod_1.z.number().int().nonnegative().optional(),
});
exports.fieldTypesRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const result = await service.list({ page, limit });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldTypesRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const fieldType = await service.getById(req.params.id);
        res.json({ success: true, data: fieldType });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldTypesRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const fieldType = await service.create(req.body);
        res.status(201).json({ success: true, data: fieldType });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldTypesRouter.put('/:id', (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const fieldType = await service.update(req.params.id, req.body);
        res.json({ success: true, data: fieldType });
    }
    catch (error) {
        next(error);
    }
});
exports.fieldTypesRouter.delete('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
