"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weatherRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const weather_service_1 = require("../../services/weather.service");
const validate_1 = require("../middleware/validate");
exports.weatherRouter = (0, express_1.Router)();
const service = new weather_service_1.WeatherService();
const latLonSchema = zod_1.z.object({
    lat: zod_1.z.coerce.number(),
    lon: zod_1.z.coerce.number(),
    source: zod_1.z.enum(['openweather']).optional(),
    refresh: zod_1.z.coerce.boolean().optional(),
});
const stationIdSchema = zod_1.z.object({
    stationId: zod_1.z.string().min(1),
});
const fieldParamsSchema = zod_1.z.object({ fieldId: zod_1.z.string().uuid() });
const fieldQuerySchema = zod_1.z.object({
    type: zod_1.z.enum(['current', 'forecast']).optional(),
    source: zod_1.z.enum(['openweather']).optional(),
});
const ndviQuerySchema = zod_1.z.object({
    polyid: zod_1.z.string().min(1),
    start: zod_1.z.string().min(1),
    end: zod_1.z.string().min(1),
});
const imageSearchQuerySchema = zod_1.z.object({
    polyid: zod_1.z.string().min(1),
    date: zod_1.z.string().min(1),
});
const soilQuerySchema = zod_1.z.object({
    polyid: zod_1.z.string().min(1),
});
exports.weatherRouter.get('/status', async (_req, res, next) => {
    try {
        const configured = await service.isOpenWeatherConfigured();
        res.json({ success: true, data: { configured } });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/current', (0, validate_1.validate)({ query: latLonSchema }), async (req, res, next) => {
    try {
        const { lat, lon, source, refresh } = req.query;
        const data = await service.getCurrent(lat, lon, source ?? 'openweather', !!refresh);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/forecast', (0, validate_1.validate)({ query: latLonSchema }), async (req, res, next) => {
    try {
        const { lat, lon, source } = req.query;
        const data = await service.getForecast(lat, lon, source ?? 'openweather');
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/field/:fieldId', (0, validate_1.validate)({ params: fieldParamsSchema, query: fieldQuerySchema }), async (req, res, next) => {
    try {
        const { type, source } = req.query;
        const data = await service.getForField(req.params.fieldId, type ?? 'current', source ?? 'openweather');
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/station/:stationId/current', (0, validate_1.validate)({ params: stationIdSchema }), async (req, res, next) => {
    try {
        const data = await service.getStationCurrent(req.params.stationId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/station/:stationId/forecast', (0, validate_1.validate)({ params: stationIdSchema }), async (req, res, next) => {
    try {
        const data = await service.getStationForecast(req.params.stationId);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/agro/polygons', async (_req, res, next) => {
    try {
        const data = await service.listAgroPolygons();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.post('/agro/polygons', async (req, res, next) => {
    try {
        const data = await service.createAgroPolygon(req.body);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/agro/ndvi/history', (0, validate_1.validate)({ query: ndviQuerySchema }), async (req, res, next) => {
    try {
        const { polyid, start, end } = req.query;
        const data = await service.getAgroNdviHistory(polyid, start, end);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/agro/image/search', (0, validate_1.validate)({ query: imageSearchQuerySchema }), async (req, res, next) => {
    try {
        const { polyid, date } = req.query;
        const data = await service.searchAgroImages(polyid, date);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.weatherRouter.get('/agro/soil', (0, validate_1.validate)({ query: soilQuerySchema }), async (req, res, next) => {
    try {
        const { polyid } = req.query;
        const data = await service.getAgroSoil(polyid);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
