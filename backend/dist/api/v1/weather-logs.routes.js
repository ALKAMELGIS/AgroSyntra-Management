"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weatherLogsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const weather_log_service_1 = require("../../services/weather-log.service");
const validate_1 = require("../middleware/validate");
exports.weatherLogsRouter = (0, express_1.Router)();
const service = new weather_log_service_1.WeatherLogService();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    site_id: zod_1.z.string().uuid().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
});
const createSchema = zod_1.z.object({
    date: zod_1.z.string().min(1),
    countryId: zod_1.z.string().uuid().optional(),
    siteId: zod_1.z.string().uuid(),
    fieldId: zod_1.z.string().uuid().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    maxTemp: zod_1.z.number().optional(),
    minTemp: zod_1.z.number().optional(),
    avgTemp: zod_1.z.number().optional(),
    feelsLike: zod_1.z.number().optional(),
    avgRH: zod_1.z.number().optional(),
    rainfall: zod_1.z.number().optional(),
    pressure: zod_1.z.number().optional(),
    windSpeed: zod_1.z.number().optional(),
    windDirection: zod_1.z.number().optional(),
    clouds: zod_1.z.number().optional(),
    description: zod_1.z.string().optional(),
    source: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const updateSchema = createSchema.partial().omit({ siteId: true });
exports.weatherLogsRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, site_id, field_id, start_date, end_date } = req.query;
        const result = await service.list({
            page,
            limit,
            siteId: site_id,
            fieldId: field_id,
            startDate: start_date,
            endDate: end_date,
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherLogsRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const entry = await service.getById(req.params.id);
        res.json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherLogsRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        const entry = await service.create(req.body);
        res.status(201).json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherLogsRouter.put('/:id', (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        const entry = await service.update(req.params.id, req.body);
        res.json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherLogsRouter.delete('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        await service.remove(req.params.id);
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
