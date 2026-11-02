"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyAuth = apiKeyAuth;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../../db/client");
/**
 * Middleware to authenticate via X-API-Key header.
 * Used as fallback when no Bearer token is present.
 */
async function apiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        next();
        return;
    }
    try {
        const keyHash = crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
        const result = await client_1.dbPool.query(`SELECT ak.*, u.role, u.email, u.name
       FROM api_keys ak
       JOIN users u ON u.id = ak.user_id
       WHERE ak.key_hash = $1 AND ak.is_active = true
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`, [keyHash]);
        if (result.rows.length === 0) {
            res.status(401).json({ success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' } });
            return;
        }
        const key = result.rows[0];
        // Update last_used
        client_1.dbPool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [key.id]).catch(() => { });
        // Set user on request (compatible with JWT auth format)
        req.user = {
            userId: key.user_id,
            role: key.role,
            email: key.email,
        };
        next();
    }
    catch (error) {
        console.error('API key auth error:', error);
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Authentication error' } });
    }
}
