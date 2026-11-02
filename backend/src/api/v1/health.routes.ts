import { Router } from 'express';
import { dbPool } from '../../db/client';
import { redisClient, isRedisEnabled } from '../../cache/client';
import { auth } from '../middleware/auth';

export const healthRouter = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  nodeVersion: string;
  checks: {
    database: { status: 'up' | 'down'; latency?: number; error?: string; pool?: { total: number; idle: number; waiting: number } };
    redis: { status: 'up' | 'down'; latency?: number; error?: string };
  };
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
}

interface MetricsData {
  timestamp: string;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpu: NodeJS.CpuUsage;
}

// Request counters (in-memory for simplicity)
let requestCount = 0;
let errorCount = 0;
const startTime = Date.now();

export function incrementRequestCount() {
  requestCount++;
}

export function incrementErrorCount() {
  errorCount++;
}

// Basic health check
healthRouter.get('/', async (_req, res) => {
  const mem = process.memoryUsage();
  const health: HealthStatus = {
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
    await dbPool.query('SELECT 1');
    health.checks.database.latency = Date.now() - dbStart;
    const p = dbPool.pool;
    health.checks.database.pool = {
      total: p.totalCount,
      idle: p.idleCount,
      waiting: p.waitingCount,
    };
  } catch (error) {
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    health.status = 'degraded';
  }

  // Check Redis (skip if not configured)
  if (!isRedisEnabled) {
    health.checks.redis = { status: 'down', error: 'REDIS_URL not set' };
    health.status = 'degraded';
  } else {
    try {
      const redisStart = Date.now();
      await redisClient.ping();
      health.checks.redis.latency = Date.now() - redisStart;
    } catch (error) {
      health.checks.redis = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      health.status = 'degraded';
    }
  }

  // If both are down, mark as unhealthy
  if (
    health.checks.database.status === 'down' &&
    health.checks.redis.status === 'down'
  ) {
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json({ success: true, data: health });
});

// Liveness probe - simple check that the server is running
healthRouter.get('/live', (_req, res) => {
  res.json({ success: true, data: { status: 'live' } });
});

// Readiness probe - check that the server can handle requests
healthRouter.get('/ready', async (_req, res) => {
  try {
    // Quick check that we can connect to database
    await dbPool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ready' } });
  } catch {
    res.status(503).json({ success: false, data: { status: 'not_ready' } });
  }
});

// Metrics endpoint (auth required)
healthRouter.get('/metrics', auth, (_req, res) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metrics: MetricsData & { requests: { total: number; errors: number } } = {
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
healthRouter.get('/metrics/prometheus', auth, async (_req, res) => {
  try {
    const { getMetrics, getContentType } = await import('../../metrics/prometheus');
    const metrics = await getMetrics();
    res.set('Content-Type', getContentType());
    res.send(metrics);
  } catch {
    res.status(500).send('# Error collecting metrics');
  }
});
