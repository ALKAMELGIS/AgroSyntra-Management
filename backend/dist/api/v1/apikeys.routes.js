"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeysRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const client_1 = require("../../db/client");
const apiKey_1 = require("../../utils/apiKey");
const apiKeysRouter = (0, express_1.Router)();
exports.apiKeysRouter = apiKeysRouter;
apiKeysRouter.use(auth_1.auth);
apiKeysRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'));
/** POST /api-keys - create a new API key (returns key ONCE) */
apiKeysRouter.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { name, permissions, expires_at } = req.body;
    if (!name?.trim()) {
        throw new errors_1.AppError('Name is required', 'VALIDATION_ERROR', 400);
    }
    const { rawKey, keyHash, keyPrefix } = (0, apiKey_1.generateApiKey)();
    const result = await client_1.dbPool.query(`INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix, permissions, expires_at, is_active, created_at`, [req.user.userId, name, keyHash, keyPrefix, JSON.stringify(permissions || []), expires_at || null]);
    // Return the raw key ONCE - it can never be retrieved again
    res.status(201).json({
        success: true,
        data: { ...result.rows[0], key: rawKey },
    });
}));
/** GET /api-keys - list user's API keys */
apiKeysRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const result = await client_1.dbPool.query(`SELECT id, name, key_prefix, permissions, last_used, expires_at, is_active, created_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [req.user.userId, limit]);
    res.json({ success: true, data: result.rows });
}));
/** DELETE /api-keys/:id - revoke an API key */
apiKeysRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query('UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
}));
