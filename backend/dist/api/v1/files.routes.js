"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const asyncHandler_1 = require("../../utils/asyncHandler");
const storage_service_1 = require("../../services/storage.service");
const auth_service_1 = require("../../services/auth.service");
exports.filesRouter = (0, express_1.Router)();
const authService = new auth_service_1.AuthService();
/**
 * <img src="..."> requests cannot carry an Authorization header, so for
 * file downloads we also accept the JWT via a `?t=<token>` query param.
 * The Bearer-header path (used by fetch/XHR) still works via `auth`.
 *
 * We never log the token in our access logs, and the token lifetime is
 * the same as every other access token in the app (short-lived), so
 * leaking one URL has a strictly-bounded blast radius.
 */
function authFromQueryOrHeader(req, res, next) {
    const queryToken = typeof req.query.t === 'string' ? req.query.t : null;
    if (queryToken) {
        try {
            const payload = authService.verifyAccessToken(queryToken);
            req.user = { userId: payload.userId, email: payload.email, role: payload.role };
            return next();
        }
        catch {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid or expired file token' },
            });
        }
    }
    return (0, auth_1.auth)(req, res, next);
}
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
/**
 * GET /files/:id
 *
 * Streams a BYTEA blob stored in Postgres back to the client with the
 * correct Content-Type. Used when STORAGE_PROVIDER=db, which is the
 * recommended adapter for prototype deployments that don't have an
 * S3-compatible bucket configured.
 *
 * We set a long-lived cache header because blobs are immutable (a new
 * upload gets a new uuid), which means browsers and CDNs can cache them
 * aggressively without ever showing stale content.
 */
exports.filesRouter.get('/:id', authFromQueryOrHeader, (0, validate_1.validate)({ params: idSchema }), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const blob = await (0, storage_service_1.readBlob)(req.params.id);
    if (!blob) {
        return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'File not found' },
        });
    }
    res.setHeader('Content-Type', blob.mimeType);
    res.setHeader('Content-Length', String(blob.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.send(blob.content);
}));
