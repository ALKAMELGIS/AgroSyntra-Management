import { createServer } from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { initSentry, captureException } from './utils/sentry';
import app from './app';
import { jobQueue } from './jobs/queue';
import { initWebSocket } from './websocket';
import { startPHIScheduler } from './services/phiScheduler.service';
import { startWebhookWorker } from './jobs/webhookQueue';
import { shutdownBullMQ } from './jobs/bullQueue';
import { runMigrations } from './db/migrate';

// Initialize Sentry first
initSentry();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  captureException(error, { type: 'uncaughtException' });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
  if (reason instanceof Error) {
    captureException(reason, { type: 'unhandledRejection' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await shutdownBullMQ().catch(() => {});
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await shutdownBullMQ().catch(() => {});
  process.exit(0);
});

// Create HTTP server and attach WebSocket
const server = createServer(app);
initWebSocket(server);

// Run migrations then start server
runMigrations()
  .then(() => {
    server.listen(config.port, () => {
      logger.info({ port: config.port }, 'Backend server started');
      jobQueue.start();
      startPHIScheduler();
      startWebhookWorker();
    });
  })
  .catch((err) => {
    logger.fatal({ error: err }, 'Migration failed — refusing to start with potentially broken schema');
    process.exit(1);
  });
