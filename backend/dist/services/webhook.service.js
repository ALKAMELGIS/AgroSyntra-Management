"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverWebhooks = deliverWebhooks;
exports.createWebhook = createWebhook;
exports.listWebhooks = listWebhooks;
exports.getDeliveries = getDeliveries;
exports.deleteWebhook = deleteWebhook;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
const bullQueue_1 = require("../jobs/bullQueue");
const webhookQueue_1 = require("../jobs/webhookQueue");
/**
 * Deliver webhooks for a given event.
 * Uses BullMQ queue when available, falls back to fire-and-forget.
 */
async function deliverWebhooks(event, payload) {
    try {
        const result = await client_1.dbPool.query(`SELECT * FROM webhooks WHERE is_active = true AND $1 = ANY(events)`, [event]);
        for (const webhook of result.rows) {
            if ((0, bullQueue_1.isBullMQAvailable)()) {
                (0, webhookQueue_1.enqueueWebhookDelivery)({
                    webhookId: webhook.id, url: webhook.url,
                    secret: webhook.secret, event, payload,
                }).catch((err) => logger_1.logger.error({ err: err.message }, 'Failed to enqueue webhook'));
            }
            else {
                deliverSingle(webhook, event, payload).catch((err) => {
                    logger_1.logger.error({ webhookId: webhook.id, err: err.message }, 'Webhook delivery failed');
                });
            }
        }
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Webhook delivery error');
    }
}
async function deliverSingle(webhook, event, payload) {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = crypto_1.default.createHmac('sha256', webhook.secret).update(body).digest('hex');
    let statusCode = null;
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
    }
    catch (err) {
        statusCode = 0;
        responseText = err.message || 'Connection failed';
    }
    // Log delivery
    await client_1.dbPool.query(`INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, response)
     VALUES ($1, $2, $3, $4, $5)`, [webhook.id, event, payload, statusCode, responseText.substring(0, 2000)]).catch(() => { });
}
/**
 * Create a new webhook.
 */
async function createWebhook(userId, url, events) {
    const secret = crypto_1.default.randomBytes(32).toString('hex');
    const result = await client_1.dbPool.query(`INSERT INTO webhooks (user_id, url, secret, events)
     VALUES ($1, $2, $3, $4)
     RETURNING *`, [userId, url, secret, events]);
    return result.rows[0];
}
/**
 * List webhooks for a user.
 */
async function listWebhooks(userId, limit = 100) {
    const result = await client_1.dbPool.query('SELECT id, url, events, is_active, created_at FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
    return result.rows;
}
/**
 * Get delivery history for a webhook.
 */
async function getDeliveries(webhookId) {
    const result = await client_1.dbPool.query('SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY delivered_at DESC LIMIT 50', [webhookId]);
    return result.rows;
}
/**
 * Delete a webhook.
 */
async function deleteWebhook(id, userId) {
    await client_1.dbPool.query('DELETE FROM webhooks WHERE id = $1 AND user_id = $2', [id, userId]);
}
