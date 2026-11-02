"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnection = getRedisConnection;
exports.getQueue = getQueue;
exports.createWorker = createWorker;
exports.addRepeatableJob = addRepeatableJob;
exports.addJob = addJob;
exports.isBullMQAvailable = isBullMQAvailable;
exports.shutdownBullMQ = shutdownBullMQ;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../utils/logger");
const redisUrl = (process.env.REDIS_URL || '').trim();
let connection = null;
const queues = new Map();
const workers = [];
function getRedisConnection() {
    if (!redisUrl)
        return null;
    if (!connection) {
        connection = new ioredis_1.default(redisUrl, { maxRetriesPerRequest: null });
        connection.on('error', (err) => {
            logger_1.logger.error({ err: err.message }, 'BullMQ Redis connection error');
        });
    }
    return connection;
}
function getQueue(name) {
    const conn = getRedisConnection();
    if (!conn)
        return null;
    if (!queues.has(name)) {
        queues.set(name, new bullmq_1.Queue(name, { connection: conn }));
    }
    return queues.get(name);
}
function createWorker(queueName, processor, opts) {
    const conn = getRedisConnection();
    if (!conn)
        return null;
    const worker = new bullmq_1.Worker(queueName, processor, {
        connection: conn,
        concurrency: opts?.concurrency || 1,
    });
    worker.on('completed', (job) => {
        logger_1.logger.debug({ jobId: job?.id, queue: queueName }, 'Job completed');
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ jobId: job?.id, queue: queueName, error: err.message }, 'Job failed');
    });
    workers.push(worker);
    return worker;
}
async function addRepeatableJob(queueName, jobName, data, pattern) {
    const queue = getQueue(queueName);
    if (!queue)
        return false;
    await queue.add(jobName, data, {
        repeat: { pattern },
        removeOnComplete: 50,
        removeOnFail: 100,
    });
    return true;
}
async function addJob(queueName, jobName, data, opts) {
    const queue = getQueue(queueName);
    if (!queue)
        return false;
    await queue.add(jobName, data, {
        attempts: opts?.attempts || 3,
        backoff: opts?.backoff || { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 200,
    });
    return true;
}
function isBullMQAvailable() {
    return !!redisUrl;
}
async function shutdownBullMQ() {
    for (const worker of workers) {
        await worker.close();
    }
    for (const queue of queues.values()) {
        await queue.close();
    }
    if (connection) {
        connection.disconnect();
    }
    logger_1.logger.info('BullMQ shut down');
}
