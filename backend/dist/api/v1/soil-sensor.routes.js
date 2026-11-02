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
exports.soilSensorRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const soilService = __importStar(require("../../services/soilSensor.service"));
const createSoilReadingSchema = zod_1.z.object({
    field_id: zod_1.z.string().uuid(),
    date: zod_1.z.string(),
    moisture_pct: zod_1.z.number().min(0).max(100).optional(),
    temperature_c: zod_1.z.number().optional(),
    ec_dsm: zod_1.z.number().optional(),
    ph: zod_1.z.number().min(0).max(14).optional(),
    depth_cm: zod_1.z.number().optional(),
    source: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const soilSensorRouter = (0, express_1.Router)();
exports.soilSensorRouter = soilSensorRouter;
soilSensorRouter.use(auth_1.auth);
// List readings with filters
soilSensorRouter.get('/', async (req, res, next) => {
    try {
        const result = await soilService.list({
            fieldId: req.query.fieldId,
            siteId: req.query.siteId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            page: req.query.page ? parseInt(req.query.page) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (err) {
        next(err);
    }
});
// Latest readings per field for a site (used by cards)
soilSensorRouter.get('/latest', async (req, res, next) => {
    try {
        const siteId = req.query.siteId;
        if (!siteId)
            return res.status(400).json({ success: false, error: { message: 'siteId is required' } });
        const date = req.query.date;
        const data = await soilService.getLatestBySite(siteId, date);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
// Create manual entry
soilSensorRouter.post('/', (0, validate_1.validate)({ body: createSoilReadingSchema }), async (req, res, next) => {
    try {
        const item = await soilService.create(req.body);
        res.status(201).json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
