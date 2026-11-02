"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLimiter = exports.authLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limit_redis_1 = require("rate-limit-redis");
const config_1 = require("../../config");
const client_1 = require("../../cache/client");
/**
 * Create a Redis-backed rate limit store when Redis is available.
 * Falls back to the default in-memory store when REDIS_URL is not set.
 * Redis store is essential for multi-instance deployments so rate limits
 * are shared across all running containers.
 */
function createStore(prefix) {
    if (!client_1.isRedisEnabled)
        return undefined; // use default MemoryStore
    return new rate_limit_redis_1.RedisStore({
        // The ioredis client must have sendCommand, which it does natively
        sendCommand: (...args) => client_1.redisClient.call(...args),
        prefix: `rl:${prefix}:`,
    });
}
// General API rate limit
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config_1.config.env === 'production' ? 1000 : 5000,
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
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: config_1.config.env === 'production' ? 50 : 100,
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
exports.createLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: config_1.config.env === 'production' ? 100 : 300,
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
