"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPHIAlerts = checkPHIAlerts;
exports.startPHIScheduler = startPHIScheduler;
exports.stopPHIScheduler = stopPHIScheduler;
const client_1 = require("../db/client");
const push_notification_service_1 = require("./push-notification.service");
const websocket_1 = require("../websocket");
const logger_1 = require("../utils/logger");
/**
 * PHI Scheduler: runs periodically to check for pesticide applications
 * where PHI is about to end (tomorrow) or has ended (today), and sends
 * the appropriate notifications.
 */
async function checkPHIAlerts() {
    try {
        // 1. Day-before warnings: PHI ends tomorrow and notification not yet sent
        const dayBeforeResult = await client_1.dbPool.query(`SELECT pa.*, f.name AS field_name, pp.name AS product_name, pp.phi_days
       FROM pesticide_applications pa
       LEFT JOIN fields f ON f.id = pa.field_id
       LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
       WHERE pa.approval_status = 'approved'
         AND pa.phi_end_date = CURRENT_DATE + INTERVAL '1 day'
         AND pa.phi_day_before_sent = false`);
        const dayBeforeIds = [];
        for (const app of dayBeforeResult.rows) {
            const title = `PHI for ${app.product_name || 'pesticide'} on ${app.field_name || 'field'} ends tomorrow`;
            const message = `Prepare for harvest: PHI restriction on ${app.field_name} (${app.product_name}) ends ${new Date(app.phi_end_date).toLocaleDateString()}. Safe to harvest from tomorrow.`;
            await sendPHINotification(app, title, message, 'warning', 'phi_warning');
            dayBeforeIds.push(app.id);
            logger_1.logger.info({ applicationId: app.id, fieldName: app.field_name }, 'PHI day-before notification sent');
        }
        if (dayBeforeIds.length > 0) {
            await client_1.dbPool.query(`UPDATE pesticide_applications SET phi_day_before_sent = true WHERE id = ANY($1::uuid[])`, [dayBeforeIds]);
        }
        // 2. PHI cleared: PHI ends today and notification not yet sent
        const clearedResult = await client_1.dbPool.query(`SELECT pa.*, f.name AS field_name, pp.name AS product_name, pp.phi_days
       FROM pesticide_applications pa
       LEFT JOIN fields f ON f.id = pa.field_id
       LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
       WHERE pa.approval_status = 'approved'
         AND pa.phi_end_date = CURRENT_DATE
         AND pa.phi_cleared_sent = false`);
        const clearedIds = [];
        for (const app of clearedResult.rows) {
            const title = `PHI cleared for ${app.field_name || 'field'}`;
            const message = `PHI restriction has ended for ${app.field_name}. ${app.product_name} pre-harvest interval has passed. Safe to harvest now.`;
            await sendPHINotification(app, title, message, 'info', 'phi_cleared');
            clearedIds.push(app.id);
            logger_1.logger.info({ applicationId: app.id, fieldName: app.field_name }, 'PHI cleared notification sent');
        }
        if (clearedIds.length > 0) {
            await client_1.dbPool.query(`UPDATE pesticide_applications SET phi_cleared_sent = true WHERE id = ANY($1::uuid[])`, [clearedIds]);
        }
        const totalSent = dayBeforeResult.rows.length + clearedResult.rows.length;
        if (totalSent > 0) {
            logger_1.logger.info({ dayBefore: dayBeforeResult.rows.length, cleared: clearedResult.rows.length }, 'PHI scheduler completed');
        }
    }
    catch (error) {
        logger_1.logger.error({ error }, 'PHI scheduler check failed');
    }
}
async function sendPHINotification(application, title, message, severity, entityType) {
    // Create alert event
    const alertResult = await client_1.dbPool.query(`INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [entityType, application.id, application.field_id, severity, title, message]);
    const alertEvent = alertResult.rows[0];
    // Notify relevant roles
    const notifyRoles = ['operation_manager', 'farm_manager', 'ceo'];
    const rolePlaceholders = notifyRoles.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await client_1.dbPool.query(`SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND is_active = true`, notifyRoles);
    if (usersResult.rows.length > 0) {
        // Batch insert notifications
        const values = [];
        const params = [alertEvent.id, title, message, severity];
        let paramIdx = params.length + 1;
        for (const user of usersResult.rows) {
            values.push(`($${paramIdx}, $1, $2, $3, $4)`);
            params.push(user.id);
            paramIdx++;
        }
        await client_1.dbPool.query(`INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
       VALUES ${values.join(', ')}`, params);
        // Real-time + push (fire-and-forget)
        for (const user of usersResult.rows) {
            (0, websocket_1.emitAlert)(alertEvent, user.id);
            push_notification_service_1.pushNotificationService.sendToUser(user.id, {
                title,
                body: message,
                type: severity === 'warning' ? 'alert' : 'info',
                data: { applicationId: application.id, fieldId: application.field_id, type: entityType },
            }).catch(() => { });
        }
    }
}
// PHI scheduling is now handled by BullMQ (via jobs/queue.ts).
// These legacy functions remain for backward compatibility when BullMQ is unavailable.
let intervalHandle = null;
function startPHIScheduler() {
    const { isBullMQAvailable } = require('../jobs/bullQueue');
    if (isBullMQAvailable()) {
        logger_1.logger.info('PHI scheduler: managed by BullMQ, skipping setInterval');
        return;
    }
    checkPHIAlerts().catch(() => { });
    intervalHandle = setInterval(() => {
        checkPHIAlerts().catch(() => { });
    }, 60 * 60 * 1000);
    logger_1.logger.info('PHI scheduler started via setInterval (hourly checks)');
}
function stopPHIScheduler() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        logger_1.logger.info('PHI scheduler stopped');
    }
}
