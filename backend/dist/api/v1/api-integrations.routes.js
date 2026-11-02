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
exports.apiIntegrationsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const apiIntService = __importStar(require("../../services/apiIntegration.service"));
const apiIntegrationsRouter = (0, express_1.Router)();
exports.apiIntegrationsRouter = apiIntegrationsRouter;
apiIntegrationsRouter.use(auth_1.auth);
apiIntegrationsRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'));
// List integrations
apiIntegrationsRouter.get('/', async (req, res, next) => {
    try {
        const result = await apiIntService.listIntegrations({
            type: req.query.type,
            page: req.query.page ? parseInt(req.query.page) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (err) {
        next(err);
    }
});
// Weather autofill (must be before /:id routes)
apiIntegrationsRouter.get('/weather-autofill', async (req, res, next) => {
    try {
        const siteId = req.query.siteId;
        const date = req.query.date || new Date().toISOString().split('T')[0];
        if (!siteId)
            return res.status(400).json({ success: false, error: { message: 'siteId is required' } });
        const data = await apiIntService.getWeatherAutofill(siteId, date);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
// Test unsaved connection (must be before /:id routes)
apiIntegrationsRouter.post('/test-unsaved', async (req, res, next) => {
    try {
        const { baseUrl } = req.body;
        if (!baseUrl || typeof baseUrl !== 'string') {
            return res.status(400).json({ success: false, error: { message: 'baseUrl is required' } });
        }
        let parsed;
        try {
            parsed = new URL(baseUrl);
        }
        catch {
            return res.status(400).json({ success: false, error: { message: 'Invalid URL' } });
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(400).json({ success: false, error: { message: 'Only HTTP(S) URLs allowed' } });
        }
        const forbidden = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
        if (forbidden.some(h => parsed.hostname === h || parsed.hostname.endsWith('.internal'))) {
            return res.status(400).json({ success: false, error: { message: 'Internal URLs not allowed' } });
        }
        const result = await apiIntService.testConnectionUnsaved(req.body);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
// Get single integration with fields
apiIntegrationsRouter.get('/:id', async (req, res, next) => {
    try {
        const item = await apiIntService.getIntegration(req.params.id);
        res.json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Create integration
apiIntegrationsRouter.post('/', async (req, res, next) => {
    try {
        const item = await apiIntService.createIntegration({ ...req.body, createdBy: req.user.userId });
        res.status(201).json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Update integration
apiIntegrationsRouter.put('/:id', async (req, res, next) => {
    try {
        const item = await apiIntService.updateIntegration(req.params.id, req.body);
        res.json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Delete integration
apiIntegrationsRouter.delete('/:id', async (req, res, next) => {
    try {
        await apiIntService.deleteIntegration(req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// Duplicate integration
apiIntegrationsRouter.post('/:id/duplicate', async (req, res, next) => {
    try {
        const item = await apiIntService.duplicateIntegration(req.params.id);
        res.status(201).json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// Test connection
apiIntegrationsRouter.post('/:id/test', async (req, res, next) => {
    try {
        const result = await apiIntService.testConnection(req.params.id);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
// Manual sync (auto-dispatches to weather or soil based on type)
apiIntegrationsRouter.post('/:id/sync', async (req, res, next) => {
    try {
        const result = await apiIntService.syncIntegration(req.params.id, 'manual');
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
// Sync history
apiIntegrationsRouter.get('/:id/sync-history', async (req, res, next) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;
        const history = await apiIntService.getSyncHistory(req.params.id, limit);
        res.json({ success: true, data: history });
    }
    catch (err) {
        next(err);
    }
});
// List assigned fields
apiIntegrationsRouter.get('/:id/fields', async (req, res, next) => {
    try {
        const fields = await apiIntService.getIntegrationFields(req.params.id);
        res.json({ success: true, data: fields });
    }
    catch (err) {
        next(err);
    }
});
// Assign fields
apiIntegrationsRouter.post('/:id/fields', async (req, res, next) => {
    try {
        const results = await apiIntService.assignFields(req.params.id, req.body.assignments || []);
        res.status(201).json({ success: true, data: results });
    }
    catch (err) {
        next(err);
    }
});
// Remove field assignment
apiIntegrationsRouter.delete('/:id/fields/:fieldId', async (req, res, next) => {
    try {
        await apiIntService.removeFieldAssignment(req.params.id, req.params.fieldId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
