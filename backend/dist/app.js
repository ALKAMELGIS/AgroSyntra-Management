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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Sentry = __importStar(require("@sentry/node"));
const pino_http_1 = __importDefault(require("pino-http"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const v1_1 = __importDefault(require("./api/v1"));
const requestId_1 = require("./api/middleware/requestId");
const errorHandler_1 = require("./api/middleware/errorHandler");
const logger_1 = require("./utils/logger");
const rateLimit_1 = require("./api/middleware/rateLimit");
const security_1 = require("./api/middleware/security");
const prometheus_1 = require("./metrics/prometheus");
const swagger_1 = require("./config/swagger");
const app = (0, express_1.default)();
// Trust the first proxy (Railway / nginx) so req.ip is correct
// and express-rate-limit reads X-Forwarded-For properly
app.set('trust proxy', 1);
// Request timeout — abort requests that take longer than 30 seconds
// AI generation routes get 3 minutes since they make multiple sequential LLM calls
const REQUEST_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 300_000;
app.use((req, res, next) => {
    const timeout = (req.path.includes('/training/ai/') || req.path.includes('/generate-bank') || req.path.includes('/ai-edit')) ? AI_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    res.setTimeout(timeout, () => {
        if (!res.headersSent) {
            res.status(408).json({ success: false, error: { message: 'Request timeout', code: 'REQUEST_TIMEOUT' } });
        }
    });
    next();
});
// Prometheus metrics collection
app.use(prometheus_1.metricsMiddleware);
// Security middlewares - order matters!
app.use(security_1.securityHeaders);
app.use(security_1.corsMiddleware);
app.use(requestId_1.requestId);
// Request logging with PII masking
app.use((0, pino_http_1.default)({
    logger: logger_1.logger,
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.confirmPassword',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
    },
}));
// Body parsing with size limits
app.use(express_1.default.json(security_1.requestSizeLimiter.json));
app.use(express_1.default.urlencoded(security_1.requestSizeLimiter.urlencoded));
// XSS sanitization
app.use(security_1.xssSanitizer);
// Rate limiting
app.use(rateLimit_1.apiLimiter);
// Swagger API documentation
app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Al Maha Farm API Docs',
}));
// Swagger spec as JSON
app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swagger_1.swaggerSpec);
});
// API routes
app.use('/api/v1', v1_1.default);
// Sentry error handler (captures Express errors)
Sentry.setupExpressErrorHandler(app);
// Error handler (must be last)
app.use(errorHandler_1.errorHandler);
exports.default = app;
