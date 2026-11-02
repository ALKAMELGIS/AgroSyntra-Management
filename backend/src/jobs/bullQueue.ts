import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const redisUrl = (process.env.REDIS_URL || '').trim();

let connection: IORedis | null = null;
const queues: Map<string, Queue> = new Map();
const workers: Worker[] = [];

export function getRedisConnection(): IORedis | null {
  if (!redisUrl) return null;
  if (!connection) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    connection.on('error', (err) => {
      logger.error({ err: err.message }, 'BullMQ Redis connection error');
    });
  }
  return connection;
}

export function getQueue(name: string): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: conn }));
  }
  return queues.get(name)!;
}

export function createWorker(
  queueName: string,
  processor: (job: any) => Promise<void>,
  opts?: { concurrency?: number },
): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker(queueName, processor, {
    connection: conn,
    concurrency: opts?.concurrency || 1,
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job?.id, queue: queueName }, 'Job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, queue: queueName, error: err.message }, 'Job failed');
  });

  workers.push(worker);
  return worker;
}

export async function addRepeatableJob(
  queueName: string,
  jobName: string,
  data: any,
  pattern: string,
): Promise<boolean> {
  const queue = getQueue(queueName);
  if (!queue) return false;

  await queue.add(jobName, data, {
    repeat: { pattern },
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  return true;
}

export async function addJob(
  queueName: string,
  jobName: string,
  data: any,
  opts?: { attempts?: number; backoff?: { type: string; delay: number } },
): Promise<boolean> {
  const queue = getQueue(queueName);
  if (!queue) return false;

  await queue.add(jobName, data, {
    attempts: opts?.attempts || 3,
    backoff: opts?.backoff || { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  });
  return true;
}

export function isBullMQAvailable(): boolean {
  return !!redisUrl;
}

export async function shutdownBullMQ(): Promise<void> {
  for (const worker of workers) {
    await worker.close();
  }
  for (const queue of queues.values()) {
    await queue.close();
  }
  if (connection) {
    connection.disconnect();
  }
  logger.info('BullMQ shut down');
}
