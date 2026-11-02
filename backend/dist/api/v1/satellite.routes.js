"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.satelliteRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const satellite_service_1 = require("../../services/satellite.service");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../../utils/errors");
const config_1 = require("../../config");
exports.satelliteRouter = (0, express_1.Router)();
// Lazy-init: don't crash the server if SentinelHub isn't configured
let _service = null;
function getService() {
    if (!_service) {
        try {
            _service = new satellite_service_1.SatelliteService();
        }
        catch {
            throw new errors_1.AppError('Satellite imagery service is not configured on this server', 'SERVICE_UNAVAILABLE', 503);
        }
    }
    return _service;
}
const wmsQuerySchema = zod_1.z.object({
    layer: zod_1.z.string().min(1),
    bbox: zod_1.z.string().min(1),
    time: zod_1.z.string().min(1),
    width: zod_1.z.coerce.number().int().optional(),
    height: zod_1.z.coerce.number().int().optional(),
    maxCloudCoverage: zod_1.z.coerce.number().int().optional(),
});
const fieldParamsSchema = zod_1.z.object({ fieldId: zod_1.z.string().uuid() });
const ndviQuerySchema = zod_1.z.object({
    timeRange: zod_1.z.string().min(1),
});
const processSchema = zod_1.z.object({
    polygon: zod_1.z.array(zod_1.z.tuple([zod_1.z.number(), zod_1.z.number()])).min(3),
    timeRange: zod_1.z.string().min(1),
});
exports.satelliteRouter.get('/wms-url', (0, validate_1.validate)({ query: wmsQuerySchema }), async (req, res, next) => {
    try {
        const data = getService().getWmsUrl(req.query);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.satelliteRouter.get('/layers', async (_req, res, next) => {
    try {
        const data = await getService().getLayers();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.satelliteRouter.get('/ndvi/:fieldId', (0, validate_1.validate)({ params: fieldParamsSchema, query: ndviQuerySchema }), async (req, res, next) => {
    try {
        const { timeRange } = req.query;
        const result = await getService().getNdviForField(req.params.fieldId, timeRange);
        res.setHeader('Content-Type', result.contentType);
        res.send(Buffer.from(result.image));
    }
    catch (error) {
        next(error);
    }
});
exports.satelliteRouter.post('/token', async (_req, res, next) => {
    try {
        const { sentinelHubClientId, sentinelHubClientSecret } = config_1.config.external;
        if (!sentinelHubClientId || !sentinelHubClientSecret) {
            throw new errors_1.AppError('SentinelHub OAuth credentials not configured on backend', 'SERVICE_UNAVAILABLE', 503);
        }
        const response = await fetch('https://services.sentinel-hub.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: sentinelHubClientId,
                client_secret: sentinelHubClientSecret,
            }),
        });
        if (!response.ok) {
            throw new errors_1.AppError(`SentinelHub OAuth failed: ${response.statusText}`, 'EXTERNAL_SERVICE_ERROR', 502);
        }
        const data = await response.json();
        res.json({ success: true, data: { access_token: data.access_token, expires_in: data.expires_in } });
    }
    catch (error) {
        next(error);
    }
});
exports.satelliteRouter.post('/process', (0, validate_1.validate)({ body: processSchema }), async (req, res, next) => {
    try {
        const { polygon, timeRange } = req.body;
        const result = await getService().processNdvi(polygon, timeRange);
        res.setHeader('Content-Type', result.contentType);
        res.send(Buffer.from(result.image));
    }
    catch (error) {
        next(error);
    }
});
