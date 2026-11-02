/**
 * Sentry error tracking — loaded on demand.
 *
 * The SDK is only downloaded when REACT_APP_SENTRY_DSN is configured, so
 * installs without error tracking do not pay for it in the initial bundle.
 * The helpers below are safe no-ops until (and unless) Sentry has loaded.
 */
let sentryPromise = null;
let Sentry = null;

function loadSentry() {
  if (!sentryPromise) {
    sentryPromise = import('@sentry/react').then((mod) => {
      Sentry = mod;
      return mod;
    });
  }
  return sentryPromise;
}

export function initSentry() {
  const dsn = process.env.REACT_APP_SENTRY_DSN;

  if (!dsn) {
    console.info('Sentry DSN not configured, error tracking disabled');
    return Promise.resolve(null);
  }

  return loadSentry().then((S) => {
    S.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.REACT_APP_VERSION || '0.1.0',

      // Performance monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Session replay (optional)
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      // Filter out common non-errors
      ignoreErrors: [
        // Network errors
        'Network request failed',
        'Failed to fetch',
        'Load failed',
        // User cancellations
        'AbortError',
        'The user aborted a request',
        // Browser extensions
        /^chrome-extension:\/\//,
        /^moz-extension:\/\//,
      ],

      beforeSend(event) {
        // Don't send errors in development
        if (process.env.NODE_ENV === 'development') {
          console.warn('Sentry event (dev mode, not sent):', event);
          return null;
        }
        return event;
      },
    });
    console.info('Sentry error tracking initialized');
    return S;
  });
}

// Helper to capture exceptions with context
export function captureException(error, context) {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// Helper to add breadcrumbs
export function addBreadcrumb(message, category, level = 'info', data) {
  if (!Sentry) return;
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

// Set user context
export function setUserContext(user) {
  if (!Sentry) return;
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });
  } else {
    Sentry.setUser(null);
  }
}

/** The loaded SDK module, or null when error tracking is disabled / not yet loaded. */
export function getSentry() {
  return Sentry;
}
