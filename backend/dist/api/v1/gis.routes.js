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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gisRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const validate_1 = require("../middleware/validate");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const gisService = __importStar(require("../../services/gisLayer.service"));
const arcgis_service_1 = require("../../services/arcgis.service");
const auditLog_service_1 = require("../../services/auditLog.service");
const gisRouter = (0, express_1.Router)();
exports.gisRouter = gisRouter;
gisRouter.use(auth_1.auth);
const GIS_MAX_FILE = 50 * 1024 * 1024; // 50 MB
const gisUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: GIS_MAX_FILE },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            '.geojson', '.json', '.kml', '.kmz', '.zip', '.shp',
        ];
        const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
        if (allowed.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`File type ${ext} not allowed. Accepted: ${allowed.join(', ')}`));
        }
    },
}).single('file');
// ── Schemas ──
const createLayerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    sourceType: zod_1.z.enum(['arcgis_feature_service', 'file_upload']),
    sourceUrl: zod_1.z.string().url().optional(),
    layerIndex: zod_1.z.number().int().min(0).optional(),
    syncIntervalMinutes: zod_1.z.number().int().min(1).optional(),
    authToken: zod_1.z.string().optional(),
    style: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    attributeMapping: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
});
const updateLayerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    style: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    attributeMapping: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    syncIntervalMinutes: zod_1.z.number().int().min(1).optional(),
    isVisible: zod_1.z.boolean().optional(),
    layerOrder: zod_1.z.number().int().min(0).optional(),
    authToken: zod_1.z.string().nullable().optional(),
    geojsonData: zod_1.z.any().optional(),
});
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const linkSchema = zod_1.z.object({
    featureId: zod_1.z.string().uuid(),
    fieldId: zod_1.z.string().uuid().nullable().optional(),
    farmAreaId: zod_1.z.string().uuid().nullable().optional(),
});
// ── Layer CRUD ──
gisRouter.get('/layers', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const layers = await gisService.listLayers(orgId);
    res.json({ success: true, data: layers });
}));
gisRouter.get('/layers/:id', (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const layer = await gisService.getLayer(req.params.id);
    res.json({ success: true, data: layer });
}));
gisRouter.post('/layers', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ body: createLayerSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = { ...req.body };
    if (body.sourceType === 'arcgis_feature_service' && body.sourceUrl) {
        const { baseUrl, layerIndex } = (0, arcgis_service_1.parseFeatureServiceUrl)(body.sourceUrl);
        body.sourceUrl = baseUrl;
        if (layerIndex !== null && body.layerIndex === undefined) {
            body.layerIndex = layerIndex;
        }
    }
    const layer = await gisService.createLayer({
        ...body,
        createdBy: req.user.userId,
        organizationId: (0, tenant_1.requireOrgId)(req),
    });
    res.status(201).json({ success: true, data: layer });
}));
gisRouter.put('/layers/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ params: idSchema, body: updateLayerSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const layer = await gisService.updateLayer(req.params.id, req.body);
    res.json({ success: true, data: layer });
}));
gisRouter.delete('/layers/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    // Capture basic layer info before deletion so the audit entry is useful
    // after the row is gone.
    let layerMeta = {};
    try {
        const layer = await gisService.getLayer(req.params.id);
        if (layer) {
            layerMeta = { name: layer.name, sourceType: layer.sourceType };
        }
    }
    catch { /* non-fatal — we'll still audit the deletion */ }
    await gisService.deleteLayer(req.params.id);
    await (0, auditLog_service_1.logAuditEvent)({
        userId: req.user.userId,
        action: 'DELETE',
        entity: 'gis_layer',
        entityId: req.params.id,
        changes: layerMeta,
        metadata: { note: 'map polygons removed; linked fields + data preserved' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, data: { deleted: true } });
}));
// ── Layer features ──
gisRouter.get('/layers/:id/features', (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { minLng, minLat, maxLng, maxLat } = req.query;
    const bbox = minLng && minLat && maxLng && maxLat
        ? { minLng: +minLng, minLat: +minLat, maxLng: +maxLng, maxLat: +maxLat }
        : undefined;
    const fc = await gisService.getLayerFeatures(req.params.id, bbox);
    res.json({ success: true, data: fc });
}));
// ── ArcGIS-specific ──
gisRouter.get('/layers/:id/metadata', (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const meta = await gisService.getLayerMetadata(req.params.id);
    res.json({ success: true, data: meta });
}));
gisRouter.post('/layers/:id/sync', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await gisService.syncArcGISLayer(req.params.id);
    res.json({ success: true, data: result });
}));
gisRouter.post('/layers/:id/link', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ params: idSchema, body: linkSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { featureId, fieldId, farmAreaId } = req.body;
    await gisService.linkFeature(featureId, fieldId, farmAreaId);
    res.json({ success: true, data: { linked: true } });
}));
gisRouter.post('/layers/:id/auto-link', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const result = await gisService.autoLinkFeatures(req.params.id, (0, tenant_1.requireOrgId)(req));
    res.json({ success: true, data: result });
}));
// ── Service discovery (no layer needed) ──
gisRouter.post('/discover', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { url, token } = req.body;
    if (!url)
        throw new errors_1.AppError('url is required', 'VALIDATION_ERROR', 400);
    const { baseUrl, layerIndex } = (0, arcgis_service_1.parseFeatureServiceUrl)(url);
    const info = await gisService.getServiceLayers(baseUrl, token);
    res.json({ success: true, data: { ...info, detectedLayerIndex: layerIndex } });
}));
gisRouter.post('/test-connection', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { url, token } = req.body;
    if (!url)
        throw new errors_1.AppError('url is required', 'VALIDATION_ERROR', 400);
    const { baseUrl } = (0, arcgis_service_1.parseFeatureServiceUrl)(url);
    const result = await gisService.testServiceConnection(baseUrl, token);
    res.json({ success: true, data: result });
}));
// ── File upload ──
gisRouter.post('/upload', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (req, res, next) => {
    gisUpload(req, res, (err) => {
        if (err)
            return next(new errors_1.AppError(err.message, 'VALIDATION_ERROR', 400));
        next();
    });
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const file = req.file;
    if (!file)
        throw new errors_1.AppError('No file uploaded', 'VALIDATION_ERROR', 400);
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    let geojson;
    if (ext === '.geojson' || ext === '.json') {
        geojson = JSON.parse(file.buffer.toString('utf-8'));
    }
    else if (ext === '.kml') {
        const { kml: parseKml } = await Promise.resolve().then(() => __importStar(require('@tmcw/togeojson')));
        const { DOMParser } = await Promise.resolve().then(() => __importStar(require('@xmldom/xmldom')));
        const doc = new DOMParser().parseFromString(file.buffer.toString('utf-8'), 'text/xml');
        geojson = parseKml(doc);
    }
    else if (ext === '.kmz') {
        const JSZip = (await Promise.resolve().then(() => __importStar(require('jszip')))).default;
        const zip = await JSZip.loadAsync(file.buffer);
        const kmlFile = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.kml'));
        if (!kmlFile)
            throw new errors_1.AppError('No KML file found inside KMZ', 'VALIDATION_ERROR', 400);
        const kmlContent = await zip.files[kmlFile].async('string');
        const { kml: parseKml } = await Promise.resolve().then(() => __importStar(require('@tmcw/togeojson')));
        const { DOMParser } = await Promise.resolve().then(() => __importStar(require('@xmldom/xmldom')));
        const doc = new DOMParser().parseFromString(kmlContent, 'text/xml');
        geojson = parseKml(doc);
    }
    else if (ext === '.zip') {
        const shp = await Promise.resolve().then(() => __importStar(require('shpjs')));
        const parseShp = shp.default ?? shp;
        geojson = await parseShp(file.buffer);
    }
    else {
        throw new errors_1.AppError(`Unsupported file type: ${ext}`, 'VALIDATION_ERROR', 400);
    }
    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
        if (geojson && geojson.type === 'Feature') {
            geojson = { type: 'FeatureCollection', features: [geojson] };
        }
        else {
            throw new errors_1.AppError('Could not parse GeoJSON from uploaded file', 'VALIDATION_ERROR', 400);
        }
    }
    const layerName = req.body.name || file.originalname.replace(/\.[^.]+$/, '');
    const layer = await gisService.createLayer({
        name: layerName,
        sourceType: 'file_upload',
        originalFilename: file.originalname,
        createdBy: req.user.userId,
        organizationId: (0, tenant_1.requireOrgId)(req),
        style: req.body.style ? JSON.parse(req.body.style) : undefined,
    });
    const count = await gisService.importGeoJSONFeatures(layer.id, geojson);
    const updated = await gisService.getLayer(layer.id);
    res.status(201).json({ success: true, data: { layer: updated, featuresImported: count } });
}));
