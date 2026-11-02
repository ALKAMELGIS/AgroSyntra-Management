import { analyticsAggregateJob } from './analytics-aggregate.job';
import { logger } from '../utils/logger';
import {
  isBullMQAvailable,
  createWorker,
  addRepeatableJob,
} from './bullQueue';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const QUEUE_NAME = 'farm-jobs';

async function processAnalytics() {
  await analyticsAggregateJob.run();
}

async function processWeatherSync() {
  const { syncAllDueIntegrations } = await import('../services/apiIntegration.service');
  const count = await syncAllDueIntegrations();
  if (count > 0) logger.info({ count }, 'Weather station sync completed');
}

async function processPHICheck() {
  const { checkPHIAlerts } = await import('../services/phiScheduler.service');
  await checkPHIAlerts();
}

async function processDBBackup() {
  const { runDatabaseBackup } = await import('./workers/dbBackup.worker');
  await runDatabaseBackup();
}

function startWithBullMQ() {
  createWorker(QUEUE_NAME, async (job) => {
    switch (job.name) {
      case 'analytics-aggregate':
        await processAnalytics();
        break;
      case 'weather-sync':
        await processWeatherSync();
        break;
      case 'phi-check':
        await processPHICheck();
        break;
      case 'db-backup':
        await processDBBackup();
        break;
      default:
        logger.warn({ jobName: job.name }, 'Unknown job type');
    }
  });

  addRepeatableJob(QUEUE_NAME, 'analytics-aggregate', {}, '0 */6 * * *');
  addRepeatableJob(QUEUE_NAME, 'weather-sync', {}, '*/15 * * * *');
  addRepeatableJob(QUEUE_NAME, 'phi-check', {}, '0 * * * *');

  if (process.env.BACKUP_S3_BUCKET) {
    addRepeatableJob(QUEUE_NAME, 'db-backup', {}, '0 2 * * *');
  }

  logger.info('Background jobs started via BullMQ (analytics: 6h, weather: 15m, PHI: 1h)');
}

function startWithSetInterval() {
  const runAnalytics = async () => {
    try { await processAnalytics(); }
    catch (error) { logger.error({ error }, 'Analytics aggregate job failed'); }
  };

  const runWeatherSync = async () => {
    try { await processWeatherSync(); }
    catch (error) { logger.error({ error }, 'Weather station sync job failed'); }
  };

  const runPHICheck = async () => {
    try { await processPHICheck(); }
    catch (error) { logger.error({ error }, 'PHI check job failed'); }
  };

  runAnalytics();
  setInterval(runAnalytics, SIX_HOURS_MS);

  setTimeout(runWeatherSync, 10_000);
  setInterval(runWeatherSync, FIFTEEN_MINUTES_MS);

  runPHICheck();
  setInterval(runPHICheck, ONE_HOUR_MS);

  logger.info('Background jobs started via setInterval fallback (no Redis)');
}

export const jobQueue = {
  start() {
    if (process.env.JOBS_ENABLED !== 'true') {
      logger.info('Background jobs disabled (set JOBS_ENABLED=true to enable)');
      return;
    }

    if (isBullMQAvailable()) {
      startWithBullMQ();
    } else {
      startWithSetInterval();
    }
  },
};
