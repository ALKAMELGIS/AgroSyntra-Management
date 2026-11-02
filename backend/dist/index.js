"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const sentry_1 = require("./utils/sentry");
const app_1 = __importDefault(require("./app"));
const queue_1 = require("./jobs/queue");
const websocket_1 = require("./websocket");
const phiScheduler_service_1 = require("./services/phiScheduler.service");
const webhookQueue_1 = require("./jobs/webhookQueue");
const bullQueue_1 = require("./jobs/bullQueue");
const migrate_1 = require("./db/migrate");
// Initialize Sentry first
(0, sentry_1.initSentry)();
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.logger.fatal({ error }, 'Uncaught exception');
    (0, sentry_1.captureException)(error, { type: 'uncaughtException' });
    process.exit(1);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error({ reason, promise }, 'Unhandled promise rejection');
    if (reason instanceof Error) {
        (0, sentry_1.captureException)(reason, { type: 'unhandledRejection' });
    }
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    await (0, bullQueue_1.shutdownBullMQ)().catch(() => { });
    process.exit(0);
});
process.on('SIGINT', async () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    await (0, bullQueue_1.shutdownBullMQ)().catch(() => { });
    process.exit(0);
});
// Create HTTP server and attach WebSocket
const server = (0, http_1.createServer)(app_1.default);
(0, websocket_1.initWebSocket)(server);
// Run migrations then start server
(0, migrate_1.runMigrations)()
    .then(() => {
    server.listen(config_1.config.port, () => {
        logger_1.logger.info({ port: config_1.config.port }, 'Backend server started');
        queue_1.jobQueue.start();
        (0, phiScheduler_service_1.startPHIScheduler)();
        (0, webhookQueue_1.startWebhookWorker)();
    });
})
    .catch((err) => {
    logger_1.logger.fatal({ error: err }, 'Migration failed — refusing to start with potentially broken schema');
    process.exit(1);
});
