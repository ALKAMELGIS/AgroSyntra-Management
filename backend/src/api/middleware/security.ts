import helmet from 'helmet';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';

// Helmet configuration for security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.arcgis.com', ...(config.env === 'development' ? ['http://localhost:*'] : [])],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allows embedding images from external sources
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});

// CORS configuration
const getAllowedOrigins = (): string[] => {
  const origins = config.corsOrigin;
  
  if (origins === '*') {
    if (config.env === 'production') {
      throw new Error('FATAL: CORS_ORIGIN must not be "*" in production. Set explicit origins in CORS_ORIGIN env var.');
    }
    return ['*'];
  }
  
  // Support comma-separated origins
  return origins.split(',').map((o) => o.trim());
};

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow all origins if * is specified
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Railway app URLs (same platform)
    if (origin.endsWith('.up.railway.app')) {
      return callback(null, true);
    }
    
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
  exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400, // 24 hours
});

// XSS sanitization middleware
// Since xss-clean is deprecated, we'll use a simple sanitizer
const sanitizeString = (str: string): string => {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const SKIP_SANITIZE_KEYS = ['password', 'content', 'updatedcontent'];

const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      if (SKIP_SANITIZE_KEYS.includes(key.toLowerCase())) {
        sanitized[key] = obj[key];
      } else {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
};

export const xssSanitizer = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

// Request size limiter
export const requestSizeLimiter = {
  json: { limit: '10mb' },
  urlencoded: { limit: '10mb', extended: true },
};
