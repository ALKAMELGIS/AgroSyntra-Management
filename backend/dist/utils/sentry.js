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
exports.Sentry = void 0;
exports.initSentry = initSentry;
exports.captureException = captureException;
exports.addBreadcrumb = addBreadcrumb;
exports.setUserContext = setUserContext;
exports.clearUserContext = clearUserContext;
const Sentry = __importStar(require("@sentry/node"));
exports.Sentry = Sentry;
const config_1 = require("../config");
const logger_1 = require("./logger");
function initSentry() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        logger_1.logger.info('Sentry DSN not configured, error tracking disabled');
        return;
    }
    Sentry.init({
        dsn,
        environment: config_1.config.env,
        release: process.env.APP_VERSION || '0.1.0',
        // Performance monitoring
        tracesSampleRate: config_1.config.env === 'production' ? 0.1 : 1.0,
        // Configure breadcrumbs
        beforeBreadcrumb(breadcrumb) {
            // Filter out sensitive data from breadcrumbs
            if (breadcrumb.category === 'http') {
                if (breadcrumb.data?.url?.includes('/auth/')) {
                    breadcrumb.data = { ...breadcrumb.data, body: '[REDACTED]' };
                }
            }
            return breadcrumb;
        },
        // Filter out sensitive data before sending
        beforeSend(event) {
            // Redact sensitive headers
            if (event.request?.headers) {
                if (event.request.headers.authorization) {
                    event.request.headers.authorization = '[REDACTED]';
                }
                if (event.request.headers.cookie) {
                    event.request.headers.cookie = '[REDACTED]';
                }
            }
            // Redact sensitive body fields
            if (event.request?.data && typeof event.request.data === 'object') {
                const data = event.request.data;
                if (data.password)
                    data.password = '[REDACTED]';
                if (data.refreshToken)
                    data.refreshToken = '[REDACTED]';
            }
            return event;
        },
    });
    logger_1.logger.info('Sentry error tracking initialized');
}
// Helper to capture exceptions with context
function captureException(error, context) {
    Sentry.withScope((scope) => {
        if (context) {
            scope.setExtras(context);
        }
        Sentry.captureException(error);
    });
}
// Helper to add breadcrumbs
function addBreadcrumb(message, category, level = 'info', data) {
    Sentry.addBreadcrumb({
        message,
        category,
        level,
        data,
        timestamp: Date.now() / 1000,
    });
}
// Set user context for tracking
function setUserContext(user) {
    Sentry.setUser({
        id: user.id,
        email: user.email,
        role: user.role,
    });
}
// Clear user context on logout
function clearUserContext() {
    Sentry.setUser(null);
}
