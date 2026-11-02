"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = asyncHandler;
/**
 * Wraps an async Express route handler so that any rejected promise is
 * automatically forwarded to the centralised error-handler middleware
 * via `next(error)`.
 *
 * This eliminates repetitive try/catch blocks in every route and ensures
 * ALL errors flow through `errorHandler.ts`, which:
 *   - logs with Pino (structured)
 *   - reports 5xx to Sentry
 *   - maps Postgres error codes to user-friendly responses
 *   - returns a consistent `{ success, error }` envelope
 *
 * Usage:
 *   router.get('/', asyncHandler(async (req, res) => {
 *     const data = await someService();
 *     res.json({ success: true, data });
 *   }));
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
