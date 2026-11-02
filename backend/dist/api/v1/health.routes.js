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
exports.healthRouter = void 0;
exports.incrementRequestCount = incrementRequestCount;
exports.incrementErrorCount = incrementErrorCount;
const express_1 = require("express");
const client_1 = require("../../db/client");
const client_2 = require("../../cache/client");
const auth_1 = require("../middleware/auth");
exports.healthRouter = (0, express_1.Router)();
// Request counters (in-memory for simplicity)
let requestCount = 0;
let errorCount = 0;
const startTime = Date.now();
function incrementRequestCount() {
    requestCount++;
}
function incrementErrorCount() {
    errorCount++;
}
// Basic health check
exports.healthRouter.get('/', async (_req, res) => {
    const mem = process.memoryUsage();
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: process.env.APP_VERSION || '0.1.0',
        nodeVersion: process.version,
        checks: {
            database: { status: 'up' },
            redis: { status: 'up' },
        },
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            rssMB: Math.round(mem.rss / 1024 / 1024),
        },
    };
    // Check database
    try {
        const dbStart = Date.now();
        await client_1.dbPool.query('SELECT 1');
        health.checks.database.latency = Date.now() - dbStart;
        const p = client_1.dbPool.pool;
        health.checks.database.pool = {
            total: p.totalCount,
            idle: p.idleCount,
            waiting: p.waitingCount,
        };
    }
    catch (error) {
        health.checks.database = {
            status: 'down',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
        health.status = 'degraded';
    }
    // Check Redis (skip if not configured)
    if (!client_2.isRedisEnabled) {
        health.checks.redis = { status: 'down', error: 'REDIS_URL not set' };
        health.status = 'degraded';
    }
    else {
        try {
            const redisStart = Date.now();
            await client_2.redisClient.ping();
            health.checks.redis.latency = Date.now() - redisStart;
        }
        catch (error) {
            health.checks.redis = {
                status: 'down',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
            health.status = 'degraded';
        }
    }
    // If both are down, mark as unhealthy
    if (health.checks.database.status === 'down' &&
        health.checks.redis.status === 'down') {
        health.status = 'unhealthy';
    }
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json({ success: true, data: health });
});
// Liveness probe - simple check that the server is running
exports.healthRouter.get('/live', (_req, res) => {
    res.json({ success: true, data: { status: 'live' } });
});
// Readiness probe - check that the server can handle requests
exports.healthRouter.get('/ready', async (_req, res) => {
    try {
        // Quick check that we can connect to database
        await client_1.dbPool.query('SELECT 1');
        res.json({ success: true, data: { status: 'ready' } });
    }
    catch {
        res.status(503).json({ success: false, data: { status: 'not_ready' } });
    }
});
// Metrics endpoint (auth required)
exports.healthRouter.get('/metrics', auth_1.auth, (_req, res) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const metrics = {
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        memory: {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memoryUsage.external / 1024 / 1024), // MB
            rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        },
        cpu: cpuUsage,
        requests: {
            total: requestCount,
            errors: errorCount,
        },
    };
    res.json({ success: true, data: metrics });
});
// Prometheus-compatible metrics (auth required)
exports.healthRouter.get('/metrics/prometheus', auth_1.auth, async (_req, res) => {
    try {
        const { getMetrics, getContentType } = await Promise.resolve().then(() => __importStar(require('../../metrics/prometheus')));
        const metrics = await getMetrics();
        res.set('Content-Type', getContentType());
        res.send(metrics);
    }
    catch {
        res.status(500).send('# Error collecting metrics');
    }
});
