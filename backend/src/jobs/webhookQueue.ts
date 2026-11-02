import { logger } from '../utils/logger';
import { isBullMQAvailable, createWorker, addJob } from './bullQueue';

const QUEUE_NAME = 'webhook-delivery';

interface WebhookJobData {
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  payload: any;
}

export function startWebhookWorker() {
  if (!isBullMQAvailable()) return;

  createWorker(QUEUE_NAME, async (job) => {
    const { url, secret, event, payload, webhookId } = job.data as WebhookJobData;
    const crypto = await import('crypto');
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed: ${response.status}`);
    }

    logger.debug({ webhookId, event, status: response.status }, 'Webhook delivered');
  }, { concurrency: 3 });

  logger.info('Webhook delivery worker started');
}

export async function enqueueWebhookDelivery(data: WebhookJobData): Promise<boolean> {
  return addJob(QUEUE_NAME, 'deliver', data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  });
}
