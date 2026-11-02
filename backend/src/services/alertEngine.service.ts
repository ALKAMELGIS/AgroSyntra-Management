import { dbPool } from '../db/client';
import { pushNotificationService } from './push-notification.service';
import { emitAlert } from '../websocket';

export interface AlertRule {
  id: string;
  name: string;
  entity_type: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  notify_roles: string[];
  is_active: boolean;
  created_by?: string;
}

export interface AlertEvent {
  id: string;
  rule_id?: string;
  entity_type: string;
  entity_id?: string;
  field_id?: string;
  severity: string;
  title: string;
  message: string;
  value?: number;
  created_at: Date;
}

/**
 * Evaluate alert rules for a given entity/metric value.
 * Called after data entry (harvest, fertigation, EC/pH).
 */
export async function evaluateAlerts(
  entityType: string,
  entityId: string,
  fieldId: string | null,
  metrics: Record<string, number>
): Promise<AlertEvent[]> {
  const rulesResult = await dbPool.query(
    `SELECT * FROM alert_rules WHERE entity_type = $1 AND is_active = true`,
    [entityType]
  );

  const triggered: AlertEvent[] = [];

  for (const rule of rulesResult.rows as AlertRule[]) {
    const value = metrics[rule.metric];
    if (value === undefined || value === null) continue;

    const isTriggered = checkCondition(value, rule.operator, rule.threshold);
    if (!isTriggered) continue;

    // Create alert event
    const eventResult = await dbPool.query(
      `INSERT INTO alert_events (rule_id, entity_type, entity_id, field_id, severity, title, message, value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        rule.id,
        entityType,
        entityId,
        fieldId,
        rule.severity,
        rule.name,
        `${rule.name}: ${rule.metric} = ${value} (threshold: ${rule.operator} ${rule.threshold})`,
        value,
      ]
    );

    const event = eventResult.rows[0];
    triggered.push(event);

    // Create in-app notifications for users with matching roles
    await createUserNotifications(event, rule.notify_roles);

    // Send push notifications + real-time WebSocket alerts
    sendPushForAlert(event, rule.notify_roles).catch(() => {});
  }

  return triggered;
}

function checkCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    default: return false;
  }
}

async function sendPushForAlert(event: any, notifyRoles: string[]): Promise<void> {
  if (!notifyRoles || notifyRoles.length === 0) return;
  const placeholders = notifyRoles.map((_, i) => `$${i + 1}`).join(',');
  const usersResult = await dbPool.query(
    `SELECT id FROM users WHERE role IN (${placeholders}) AND is_active = true`,
    notifyRoles
  );
  for (const user of usersResult.rows) {
    emitAlert(event, user.id);
    pushNotificationService.sendToUser(user.id, {
      title: event.title,
      body: event.message,
      type: event.severity === 'critical' ? 'alert' : 'warning',
      data: { alertEventId: event.id, entityType: event.entity_type },
    }).catch(() => {});
  }
}

async function createUserNotifications(event: any, notifyRoles: string[]): Promise<void> {
  if (!notifyRoles || notifyRoles.length === 0) return;

  const placeholders = notifyRoles.map((_, i) => `$${i + 1}`).join(',');
  const usersResult = await dbPool.query(
    `SELECT id FROM users WHERE role IN (${placeholders}) AND is_active = true`,
    notifyRoles
  );

  if (usersResult.rows.length === 0) return;

  // Batch insert notifications for all matching users
  const values: string[] = [];
  const params: any[] = [event.id, event.title, event.message, event.severity];
  let paramIdx = params.length + 1;
  for (const user of usersResult.rows) {
    values.push(`($${paramIdx}, $1, $2, $3, $4)`);
    params.push(user.id);
    paramIdx++;
  }
  await dbPool.query(
    `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ${values.join(', ')}`,
    params
  );
}

/**
 * Get notifications for a user.
 */
export async function getUserNotifications(
  userId: string,
  limit = 20,
  unreadOnly = false
): Promise<any[]> {
  const where = unreadOnly ? 'AND n.is_read = false' : '';
  const result = await dbPool.query(
    `SELECT n.*, ae.entity_type, ae.entity_id, ae.field_id, ae.value
     FROM user_notifications n
     LEFT JOIN alert_events ae ON n.alert_event_id = ae.id
     WHERE n.user_id = $1 ${where}
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * Get unread count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await dbPool.query(
    'SELECT COUNT(*) as count FROM user_notifications WHERE user_id = $1 AND is_read = false',
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Mark notification(s) as read.
 */
export async function markAsRead(userId: string, notificationIds?: string[]): Promise<void> {
  if (notificationIds && notificationIds.length > 0) {
    const placeholders = notificationIds.map((_, i) => `$${i + 2}`).join(',');
    await dbPool.query(
      `UPDATE user_notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND id IN (${placeholders})`,
      [userId, ...notificationIds]
    );
  } else {
    // Mark all as read
    await dbPool.query(
      'UPDATE user_notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
      [userId]
    );
  }
}

/**
 * Check inventory for low-stock items and generate alerts.
 * Called periodically or on demand.
 */
export async function checkInventoryAlerts(): Promise<AlertEvent[]> {
  const lowStockResult = await dbPool.query(
    `SELECT id, name, current_stock, min_stock_level, unit
     FROM inventory_items
     WHERE is_active = true AND current_stock <= min_stock_level`
  );

  const triggered: AlertEvent[] = [];

  for (const item of lowStockResult.rows) {
    const existing = await dbPool.query(
      `SELECT id FROM alert_events
       WHERE entity_type = 'inventory' AND entity_id = $1
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [item.id]
    );
    if (existing.rowCount && existing.rowCount > 0) continue;

    const severity = Number(item.current_stock) <= 0 ? 'critical' : 'warning';
    const title = `Low stock: ${item.name}`;
    const message = `${item.name}: ${Number(item.current_stock).toFixed(1)} ${item.unit} remaining (minimum: ${Number(item.min_stock_level).toFixed(1)} ${item.unit})`;

    const eventResult = await dbPool.query(
      `INSERT INTO alert_events (entity_type, entity_id, severity, title, message, value)
       VALUES ('inventory', $1, $2, $3, $4, $5)
       RETURNING *`,
      [item.id, severity, title, message, Number(item.current_stock)]
    );

    const event = eventResult.rows[0];
    triggered.push(event);

    await createUserNotifications(event, ['ceo', 'farm_manager', 'operation_manager']);
    sendPushForAlert(event, ['ceo', 'farm_manager', 'operation_manager']).catch(() => {});
  }

  return triggered;
}

/**
 * Get all alert rules (for managers).
 */
export async function getAlertRules(): Promise<AlertRule[]> {
  const result = await dbPool.query('SELECT * FROM alert_rules ORDER BY entity_type, metric');
  return result.rows;
}

/**
 * Create or update an alert rule.
 */
export async function upsertAlertRule(rule: Partial<AlertRule> & { id?: string }): Promise<AlertRule> {
  if (rule.id) {
    const result = await dbPool.query(
      `UPDATE alert_rules SET name=$1, entity_type=$2, metric=$3, operator=$4, threshold=$5,
       severity=$6, notify_roles=$7, is_active=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [rule.name, rule.entity_type, rule.metric, rule.operator, rule.threshold,
       rule.severity, rule.notify_roles, rule.is_active, rule.id]
    );
    return result.rows[0];
  }
  const result = await dbPool.query(
    `INSERT INTO alert_rules (name, entity_type, metric, operator, threshold, severity, notify_roles, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [rule.name, rule.entity_type, rule.metric, rule.operator, rule.threshold,
     rule.severity, rule.notify_roles, rule.is_active ?? true, rule.created_by]
  );
  return result.rows[0];
}
