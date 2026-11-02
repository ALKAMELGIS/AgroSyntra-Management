"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.microsoftAuthRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const microsoft_auth_service_1 = require("../../services/microsoft-auth.service");
const validate_1 = require("../middleware/validate");
const config_1 = require("../../config");
exports.microsoftAuthRouter = (0, express_1.Router)();
const service = new microsoft_auth_service_1.MicrosoftAuthService();
// Check if Microsoft auth is available
exports.microsoftAuthRouter.get('/status', (_req, res) => {
    res.json({
        success: true,
        data: {
            enabled: service.isConfigured(),
        },
    });
});
// Get authorization URL to start Microsoft login
exports.microsoftAuthRouter.get('/login', async (req, res, next) => {
    try {
        if (!service.isConfigured()) {
            return res.status(501).json({
                success: false,
                error: { message: 'Microsoft authentication is not configured' },
            });
        }
        const redirectUri = config_1.config.microsoft.redirectUri || `${config_1.config.appUrl}/auth/microsoft/callback`;
        const state = req.query.state;
        const authUrl = await service.getAuthorizationUrl(redirectUri, state);
        res.json({
            success: true,
            data: { authUrl },
        });
    }
    catch (error) {
        next(error);
    }
});
// Handle OAuth callback from Microsoft
const callbackSchema = zod_1.z.object({
    code: zod_1.z.string().min(1, 'Authorization code is required'),
    state: zod_1.z.string().optional(),
});
exports.microsoftAuthRouter.post('/callback', (0, validate_1.validate)({ body: callbackSchema }), async (req, res, next) => {
    try {
        if (!service.isConfigured()) {
            return res.status(501).json({
                success: false,
                error: { message: 'Microsoft authentication is not configured' },
            });
        }
        const { code } = req.body;
        const redirectUri = config_1.config.microsoft.redirectUri || `${config_1.config.appUrl}/auth/microsoft/callback`;
        const result = await service.handleCallback(code, redirectUri);
        res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
                isNewUser: result.isNewUser,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
