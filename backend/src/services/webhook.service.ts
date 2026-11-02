import crypto from 'crypto';
import { dbPool } from '../db/client';
import { logger } from '../utils/logger';
import { isBullMQAvailable } from '../jobs/bullQueue';
import { enqueueWebhookDelivery } from '../jobs/webhookQueue';

interface Webhook {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}

/**
 * Deliver webhooks for a given event.
 * Uses BullMQ queue when available, falls back to fire-and-forget.
 */
export async function deliverWebhooks(event: string, payload: any): Promise<void> {
  try {
    const result = await dbPool.query(
      `SELECT * FROM webhooks WHERE is_active = true AND $1 = ANY(events)`,
      [event]
    );

    for (const webhook of result.rows as Webhook[]) {
      if (isBullMQAvailable()) {
        enqueueWebhookDelivery({
          webhookId: webhook.id, url: webhook.url,
          secret: webhook.secret, event, payload,
        }).catch((err) => logger.error({ err: (err as Error).message }, 'Failed to enqueue webhook'));
      } else {
        deliverSingle(webhook, event, payload).catch((err) => {
          logger.error({ webhookId: webhook.id, err: (err as Error).message }, 'Webhook delivery failed');
        });
      }
    }
  } catch (error) {
    logger.error({ error }, 'Webhook delivery error');
  }
}

async function deliverSingle(webhook: Webhook, event: string, payload: any): Promise<void> {
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

  let statusCode: number | null = null;
  let responseText = '';

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    statusCode = response.status;
    responseText = await response.text().catch(() => '');
  } catch (err: any) {
    statusCode = 0;
    responseText = err.message || 'Connection failed';
  }

  // Log delivery
  await dbPool.query(
    `INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, response)
     VALUES ($1, $2, $3, $4, $5)`,
    [webhook.id, event, payload, statusCode, responseText.substring(0, 2000)]
  ).catch(() => {});
}

/**
 * Create a new webhook.
 */
export async function createWebhook(userId: string, url: string, events: string[]): Promise<any> {
  const secret = crypto.randomBytes(32).toString('hex');
  const result = await dbPool.query(
    `INSERT INTO webhooks (user_id, url, secret, events)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, url, secret, events]
  );
  return result.rows[0];
}

/**
 * List webhooks for a user.
 */
export async function listWebhooks(userId: string, limit = 100): Promise<any[]> {
  const result = await dbPool.query(
    'SELECT id, url, events, is_active, created_at FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return result.rows;
}

/**
 * Get delivery history for a webhook.
 */
export async function getDeliveries(webhookId: string): Promise<any[]> {
  const result = await dbPool.query(
    'SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY delivered_at DESC LIMIT 50',
    [webhookId]
  );
  return result.rows;
}

/**
 * Delete a webhook.
 */
export async function deleteWebhook(id: string, userId: string): Promise<void> {
  await dbPool.query('DELETE FROM webhooks WHERE id = $1 AND user_id = $2', [id, userId]);
}
