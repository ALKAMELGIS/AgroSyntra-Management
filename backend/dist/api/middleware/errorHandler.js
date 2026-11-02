"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const errors_1 = require("../../utils/errors");
const logger_1 = require("../../utils/logger");
const sentry_1 = require("../../utils/sentry");
const health_routes_1 = require("../v1/health.routes");
function errorHandler(err, req, res, _next) {
    (0, health_routes_1.incrementErrorCount)();
    if (res.headersSent) {
        logger_1.logger.error({ err, url: req.url, method: req.method }, 'Error after response already sent');
        return;
    }
    const pgErr = err;
    if (pgErr?.code === '23505') {
        const conflict = new errors_1.AppError('Duplicate value', 'CONFLICT', 409, {
            detail: pgErr.detail,
            constraint: pgErr.constraint,
        });
        logger_1.logger.error({ err }, 'Request failed');
        res.status(conflict.status).json({
            success: false,
            error: {
                code: conflict.code,
                message: conflict.message,
                details: conflict.details,
            },
        });
        return;
    }
    if (pgErr?.code === '42P01' || pgErr?.code === '42883') {
        logger_1.logger.error({ err, table: pgErr.table }, 'Missing table or function — migration may not have run');
        res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Database schema not ready. A required migration may not have run.',
            },
        });
        return;
    }
    if (pgErr?.code === '23503' || pgErr?.code === '23502' || pgErr?.code === '23514' || pgErr?.code === '22P02' || pgErr?.code === '22007') {
        const dbError = new errors_1.AppError('Database validation error', 'VALIDATION_ERROR', 400, {
            code: pgErr.code,
            detail: pgErr.detail,
            constraint: pgErr.constraint,
            table: pgErr.table,
            column: pgErr.column,
        });
        logger_1.logger.error({ err }, 'Request failed');
        res.status(dbError.status).json({
            success: false,
            error: {
                code: dbError.code,
                message: dbError.message,
                details: dbError.details,
            },
        });
        return;
    }
    const isDev = process.env.NODE_ENV !== 'production';
    const unknownError = err instanceof Error
        ? { message: err.message, stack: isDev ? err.stack : undefined }
        : undefined;
    const error = err instanceof errors_1.AppError
        ? err
        : new errors_1.AppError(isDev && err instanceof Error ? err.message : 'Internal server error', 'INTERNAL_SERVER_ERROR', 500, isDev ? unknownError : undefined);
    logger_1.logger.error({ err }, 'Request failed');
    // Capture 5xx errors to Sentry
    if (error.status >= 500 && err instanceof Error) {
        (0, sentry_1.captureException)(err, {
            url: req.url,
            method: req.method,
            requestId: req.headers['x-request-id'],
        });
    }
    res.status(error.status).json({
        success: false,
        error: {
            code: error.code,
            message: error.message,
            details: error.details,
        },
    });
}
