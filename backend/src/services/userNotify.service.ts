import { dbPool } from '../db/client';
import { pushNotificationService } from './push-notification.service';
import { emitAlert } from '../websocket';

export interface UserNotifyOptions {
  title: string;
  message: string;
  severity: string;
  entityType: string;
  entityId: string;
  path: string;
}

/**
 * Notify every active user holding one of `roles`: one alert event, one
 * in-app notification per user, a real-time alert and a push.
 *
 * Pass `organizationId` to reach only that organization's users.
 */
export async function notifyUsersByRoles(
  roles: string[],
  opts: UserNotifyOptions & { organizationId?: string | null },
): Promise<void> {
  if (roles.length === 0) return;

  const rolePlaceholders = roles.map((_, i) => `$${i + 1}`).join(',');
  const userParams: unknown[] = [...roles];
  let orgFilter = '';
  if (opts.organizationId) {
    userParams.push(opts.organizationId);
    orgFilter = ` AND organization_id = $${userParams.length}`;
  }
  const usersResult = await dbPool.query(
    `SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND is_active = true${orgFilter}`,
    userParams,
  );
  if (usersResult.rows.length === 0) return;

  const alertResult = await dbPool.query(
    `INSERT INTO alert_events (entity_type, entity_id, severity, title, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [opts.entityType, opts.entityId, opts.severity, opts.title, opts.message],
  );
  const alertEvent = alertResult.rows[0];

  const values: string[] = [];
  const params: unknown[] = [alertEvent.id, opts.title, opts.message, opts.severity];
  let paramIdx = params.length + 1;
  for (const user of usersResult.rows) {
    values.push(`($${paramIdx}, $1, $2, $3, $4)`);
    params.push(user.id);
    paramIdx++;
  }
  await dbPool.query(
    `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ${values.join(', ')}`,
    params,
  );

  for (const user of usersResult.rows) {
    emitAlert(alertEvent, user.id);
    pushNotificationService.sendToUser(user.id, {
      title: opts.title,
      body: opts.message,
      type: 'alert',
      data: {
        entityType: opts.entityType,
        path: opts.path,
        entityId: opts.entityId,
      },
    }).catch(() => {});
  }
}

/** Notify one user: alert event, in-app notification, real-time alert and push. */
export async function notifyUser(userId: string, opts: UserNotifyOptions): Promise<void> {
  const alertResult = await dbPool.query(
    `INSERT INTO alert_events (entity_type, entity_id, severity, title, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [opts.entityType, opts.entityId, opts.severity, opts.title, opts.message],
  );
  const alertEvent = alertResult.rows[0];

  await dbPool.query(
    `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, alertEvent.id, opts.title, opts.message, opts.severity],
  );

  emitAlert(alertEvent, userId);
  pushNotificationService.sendToUser(userId, {
    title: opts.title,
    body: opts.message,
    type: 'alert',
    data: {
      entityType: opts.entityType,
      path: opts.path,
      entityId: opts.entityId,
    },
  }).catch(() => {});
}
