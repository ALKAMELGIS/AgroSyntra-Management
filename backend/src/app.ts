import express from 'express';
import * as Sentry from '@sentry/node';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import v1Router from './api/v1';
import { requestId } from './api/middleware/requestId';
import { errorHandler } from './api/middleware/errorHandler';
import { logger } from './utils/logger';
import { apiLimiter } from './api/middleware/rateLimit';
import {
  securityHeaders,
  corsMiddleware,
  xssSanitizer,
  requestSizeLimiter,
} from './api/middleware/security';
import { metricsMiddleware } from './metrics/prometheus';
import { swaggerSpec } from './config/swagger';

const app = express();

// Trust the first proxy (Railway / nginx) so req.ip is correct
// and express-rate-limit reads X-Forwarded-For properly
app.set('trust proxy', 1);

// Request timeout — abort requests that take longer than 30 seconds
// AI generation routes get 3 minutes since they make multiple sequential LLM calls
const REQUEST_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 300_000;
const BULK_TIMEOUT_MS = 120_000;
app.use((req, res, next) => {
  const isAi = req.path.includes('/training/ai/') || req.path.includes('/generate-bank') || req.path.includes('/ai-edit');
  const isBulk = req.path.includes('/bulk');
  const timeout = isAi ? AI_TIMEOUT_MS : isBulk ? BULK_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ success: false, error: { message: 'Request timeout', code: 'REQUEST_TIMEOUT' } });
    }
  });
  next();
});

// Prometheus metrics collection
app.use(metricsMiddleware);

// Security middlewares - order matters!
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(requestId);

// Request logging with PII masking
app.use(
  pinoHttp({
    logger: logger as any,
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
  })
);

// Body parsing with size limits
app.use(express.json(requestSizeLimiter.json));
app.use(express.urlencoded(requestSizeLimiter.urlencoded));

// XSS sanitization
app.use(xssSanitizer);

// Rate limiting
app.use(apiLimiter);

// Swagger API documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Al Maha Farm API Docs',
}));

// Swagger spec as JSON
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API routes
app.use('/api/v1', v1Router);

// Sentry error handler (captures Express errors)
Sentry.setupExpressErrorHandler(app);

// Error handler (must be last)
app.use(errorHandler);

export default app;
