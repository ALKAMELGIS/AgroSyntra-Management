import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from './logger';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: config.env,
    release: process.env.APP_VERSION || '0.1.0',
    
    // Performance monitoring
    tracesSampleRate: config.env === 'production' ? 0.1 : 1.0,
    
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
        const data = event.request.data as Record<string, unknown>;
        if (data.password) data.password = '[REDACTED]';
        if (data.refreshToken) data.refreshToken = '[REDACTED]';
      }

      return event;
    },
  });

  logger.info('Sentry error tracking initialized');
}

// Helper to capture exceptions with context
export function captureException(error: Error, context?: Record<string, unknown>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// Helper to add breadcrumbs
export function addBreadcrumb(
  message: string,
  category: string,
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

// Set user context for tracking
export function setUserContext(user: { id: string; email: string; role: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

// Clear user context on logout
export function clearUserContext() {
  Sentry.setUser(null);
}

export { Sentry };
