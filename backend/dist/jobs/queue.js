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
exports.jobQueue = void 0;
const analytics_aggregate_job_1 = require("./analytics-aggregate.job");
const logger_1 = require("../utils/logger");
const bullQueue_1 = require("./bullQueue");
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const QUEUE_NAME = 'farm-jobs';
async function processAnalytics() {
    await analytics_aggregate_job_1.analyticsAggregateJob.run();
}
async function processWeatherSync() {
    const { syncAllDueIntegrations } = await Promise.resolve().then(() => __importStar(require('../services/apiIntegration.service')));
    const count = await syncAllDueIntegrations();
    if (count > 0)
        logger_1.logger.info({ count }, 'Weather station sync completed');
}
async function processPHICheck() {
    const { checkPHIAlerts } = await Promise.resolve().then(() => __importStar(require('../services/phiScheduler.service')));
    await checkPHIAlerts();
}
async function processDBBackup() {
    const { runDatabaseBackup } = await Promise.resolve().then(() => __importStar(require('./workers/dbBackup.worker')));
    await runDatabaseBackup();
}
function startWithBullMQ() {
    (0, bullQueue_1.createWorker)(QUEUE_NAME, async (job) => {
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
                logger_1.logger.warn({ jobName: job.name }, 'Unknown job type');
        }
    });
    (0, bullQueue_1.addRepeatableJob)(QUEUE_NAME, 'analytics-aggregate', {}, '0 */6 * * *');
    (0, bullQueue_1.addRepeatableJob)(QUEUE_NAME, 'weather-sync', {}, '*/15 * * * *');
    (0, bullQueue_1.addRepeatableJob)(QUEUE_NAME, 'phi-check', {}, '0 * * * *');
    if (process.env.BACKUP_S3_BUCKET) {
        (0, bullQueue_1.addRepeatableJob)(QUEUE_NAME, 'db-backup', {}, '0 2 * * *');
    }
    logger_1.logger.info('Background jobs started via BullMQ (analytics: 6h, weather: 15m, PHI: 1h)');
}
function startWithSetInterval() {
    const runAnalytics = async () => {
        try {
            await processAnalytics();
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Analytics aggregate job failed');
        }
    };
    const runWeatherSync = async () => {
        try {
            await processWeatherSync();
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Weather station sync job failed');
        }
    };
    const runPHICheck = async () => {
        try {
            await processPHICheck();
        }
        catch (error) {
            logger_1.logger.error({ error }, 'PHI check job failed');
        }
    };
    runAnalytics();
    setInterval(runAnalytics, SIX_HOURS_MS);
    setTimeout(runWeatherSync, 10_000);
    setInterval(runWeatherSync, FIFTEEN_MINUTES_MS);
    runPHICheck();
    setInterval(runPHICheck, ONE_HOUR_MS);
    logger_1.logger.info('Background jobs started via setInterval fallback (no Redis)');
}
exports.jobQueue = {
    start() {
        if (process.env.JOBS_ENABLED !== 'true') {
            logger_1.logger.info('Background jobs disabled (set JOBS_ENABLED=true to enable)');
            return;
        }
        if ((0, bullQueue_1.isBullMQAvailable)()) {
            startWithBullMQ();
        }
        else {
            startWithSetInterval();
        }
    },
};
