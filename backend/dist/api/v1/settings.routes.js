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
exports.settingsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const settings = __importStar(require("../../services/systemSettings.service"));
const settingsRouter = (0, express_1.Router)();
exports.settingsRouter = settingsRouter;
settingsRouter.use(auth_1.auth);
settingsRouter.use((0, auth_1.authorize)('ceo', 'farm_manager'));
settingsRouter.get('/ai', async (req, res, next) => {
    try {
        const config = await settings.getAIConfig();
        res.json({ success: true, data: config });
    }
    catch (e) {
        next(e);
    }
});
const aiConfigSchema = zod_1.z.object({
    provider: zod_1.z.enum(['anthropic', 'openai']),
    model: zod_1.z.string().min(1),
    apiKey: zod_1.z.string().optional(),
});
settingsRouter.put('/ai', async (req, res, next) => {
    try {
        const body = aiConfigSchema.parse(req.body);
        await settings.setAIConfig(body.provider, body.model, body.apiKey, req.user.userId);
        const config = await settings.getAIConfig();
        res.json({ success: true, data: config });
    }
    catch (e) {
        next(e);
    }
});
settingsRouter.delete('/ai/key', async (req, res, next) => {
    try {
        await settings.remove('ai_api_key');
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
const testSchema = zod_1.z.object({
    provider: zod_1.z.enum(['anthropic', 'openai']),
    model: zod_1.z.string().min(1),
    apiKey: zod_1.z.string().min(1),
});
settingsRouter.post('/ai/test', async (req, res, next) => {
    try {
        const body = testSchema.parse(req.body);
        let keyToTest = body.apiKey;
        if (keyToTest === 'USE_SAVED') {
            const saved = await settings.getAIKey();
            if (!saved) {
                res.json({ success: true, data: { success: false, message: 'No saved key found' } });
                return;
            }
            keyToTest = saved;
        }
        const result = await settings.testAIConnection(body.provider, body.model, keyToTest);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
settingsRouter.get('/openweather', async (req, res, next) => {
    try {
        const config = await settings.getOpenWeatherConfig();
        res.json({ success: true, data: config });
    }
    catch (e) {
        next(e);
    }
});
const openWeatherConfigSchema = zod_1.z.object({
    apiKey: zod_1.z.string().optional(),
});
settingsRouter.put('/openweather', async (req, res, next) => {
    try {
        const body = openWeatherConfigSchema.parse(req.body);
        if (body.apiKey) {
            await settings.setOpenWeatherKey(body.apiKey, req.user.userId);
        }
        const config = await settings.getOpenWeatherConfig();
        res.json({ success: true, data: config });
    }
    catch (e) {
        next(e);
    }
});
settingsRouter.delete('/openweather/key', async (req, res, next) => {
    try {
        await settings.remove('openweather_api_key');
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
const openWeatherTestSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1),
});
settingsRouter.post('/openweather/test', async (req, res, next) => {
    try {
        const body = openWeatherTestSchema.parse(req.body);
        let keyToTest = body.apiKey;
        if (keyToTest === 'USE_SAVED') {
            const saved = await settings.getOpenWeatherKey();
            if (!saved) {
                res.json({ success: true, data: { success: false, message: 'No saved key found' } });
                return;
            }
            keyToTest = saved;
        }
        const result = await settings.testOpenWeatherConnection(keyToTest);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
