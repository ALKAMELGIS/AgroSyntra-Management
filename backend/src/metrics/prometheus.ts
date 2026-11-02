import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

client.collectDefaultMetrics({ prefix: 'almaha_' });

export const httpRequestDuration = new client.Histogram({
  name: 'almaha_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: 'almaha_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const dbQueryDuration = new client.Histogram({
  name: 'almaha_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const activeConnections = new client.Gauge({
  name: 'almaha_db_pool_active',
  help: 'Number of active database pool connections',
});

export const bullmqJobsProcessed = new client.Counter({
  name: 'almaha_bullmq_jobs_processed_total',
  help: 'Total BullMQ jobs processed',
  labelNames: ['queue', 'status'],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;
    const route = req.route?.path || req.path;
    const labels = {
      method: req.method,
      route: route.length > 50 ? route.substring(0, 50) : route,
      status_code: String(res.statusCode),
    };
    httpRequestDuration.observe(labels, durationSec);
    httpRequestsTotal.inc(labels);
  });

  next();
}

export async function getMetrics(): Promise<string> {
  return client.register.metrics();
}

export function getContentType(): string {
  return client.register.contentType;
}
