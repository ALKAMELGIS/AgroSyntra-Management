"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bullmqJobsProcessed = exports.activeConnections = exports.dbQueryDuration = exports.httpRequestsTotal = exports.httpRequestDuration = void 0;
exports.metricsMiddleware = metricsMiddleware;
exports.getMetrics = getMetrics;
exports.getContentType = getContentType;
const prom_client_1 = __importDefault(require("prom-client"));
prom_client_1.default.collectDefaultMetrics({ prefix: 'almaha_' });
exports.httpRequestDuration = new prom_client_1.default.Histogram({
    name: 'almaha_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});
exports.httpRequestsTotal = new prom_client_1.default.Counter({
    name: 'almaha_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});
exports.dbQueryDuration = new prom_client_1.default.Histogram({
    name: 'almaha_db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});
exports.activeConnections = new prom_client_1.default.Gauge({
    name: 'almaha_db_pool_active',
    help: 'Number of active database pool connections',
});
exports.bullmqJobsProcessed = new prom_client_1.default.Counter({
    name: 'almaha_bullmq_jobs_processed_total',
    help: 'Total BullMQ jobs processed',
    labelNames: ['queue', 'status'],
});
function metricsMiddleware(req, res, next) {
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
        exports.httpRequestDuration.observe(labels, durationSec);
        exports.httpRequestsTotal.inc(labels);
    });
    next();
}
async function getMetrics() {
    return prom_client_1.default.register.metrics();
}
function getContentType() {
    return prom_client_1.default.register.contentType;
}
