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
exports.startWebhookWorker = startWebhookWorker;
exports.enqueueWebhookDelivery = enqueueWebhookDelivery;
const logger_1 = require("../utils/logger");
const bullQueue_1 = require("./bullQueue");
const QUEUE_NAME = 'webhook-delivery';
function startWebhookWorker() {
    if (!(0, bullQueue_1.isBullMQAvailable)())
        return;
    (0, bullQueue_1.createWorker)(QUEUE_NAME, async (job) => {
        const { url, secret, event, payload, webhookId } = job.data;
        const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
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
        logger_1.logger.debug({ webhookId, event, status: response.status }, 'Webhook delivered');
    }, { concurrency: 3 });
    logger_1.logger.info('Webhook delivery worker started');
}
async function enqueueWebhookDelivery(data) {
    return (0, bullQueue_1.addJob)(QUEUE_NAME, 'deliver', data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
    });
}
