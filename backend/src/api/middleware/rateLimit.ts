import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../../config';
import { redisClient, isRedisEnabled } from '../../cache/client';

/**
 * Create a Redis-backed rate limit store when Redis is available.
 * Falls back to the default in-memory store when REDIS_URL is not set.
 * Redis store is essential for multi-instance deployments so rate limits
 * are shared across all running containers.
 */
function createStore(prefix: string) {
  if (!isRedisEnabled) return undefined; // use default MemoryStore
  return new RedisStore({
    // The ioredis client must have sendCommand, which it does natively
    sendCommand: (...args: string[]) => (redisClient as any).call(...args),
    prefix: `rl:${prefix}:`,
  });
}

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.env === 'production' ? 1000 : 5000,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('api'),
  skip: (req) => req.path === '/api/v1/health',
});

// Strict rate limit for login/register endpoints only
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.env === 'production' ? 50 : 100,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please wait a few minutes and try again.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('auth'),
});

// Rate limit for data creation endpoints
export const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.env === 'production' ? 100 : 300,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please slow down',
      code: 'CREATE_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore('create'),
});
