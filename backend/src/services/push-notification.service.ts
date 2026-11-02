import Expo, { ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';
import { dbPool } from '../db/client';
import { logger } from '../utils/logger';

// Create a new Expo SDK client
const expo = new Expo();

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  deviceType: 'ios' | 'android' | 'web';
  deviceName?: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  type: 'alert' | 'reminder' | 'info' | 'warning' | 'success';
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  alertNotifications: boolean;
  reminderNotifications: boolean;
  infoNotifications: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export class PushNotificationService {
  // ============ Token Management ============

  async registerToken(
    userId: string,
    token: string,
    deviceType: 'ios' | 'android' | 'web',
    deviceName?: string
  ): Promise<PushToken> {
    // Validate token format
    if (!Expo.isExpoPushToken(token)) {
      throw new Error('Invalid Expo push token');
    }

    const result = await dbPool.query(
      `INSERT INTO push_tokens (user_id, token, device_type, device_name, last_used_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, token) 
       DO UPDATE SET 
         is_active = true, 
         device_name = COALESCE($4, push_tokens.device_name),
         last_used_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [userId, token, deviceType, deviceName]
    );

    return this.mapToken(result.rows[0]);
  }

  async unregisterToken(userId: string, token: string): Promise<void> {
    await dbPool.query(
      'UPDATE push_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND token = $2',
      [userId, token]
    );
  }

  async getUserTokens(userId: string): Promise<PushToken[]> {
    const result = await dbPool.query(
      'SELECT * FROM push_tokens WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    return result.rows.map(this.mapToken);
  }

  async getAllActiveTokens(): Promise<PushToken[]> {
    const result = await dbPool.query(
      'SELECT * FROM push_tokens WHERE is_active = true'
    );
    return result.rows.map(this.mapToken);
  }

  // ============ Notification Preferences ============

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await dbPool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      // Return defaults
      return {
        pushEnabled: true,
        emailEnabled: true,
        alertNotifications: true,
        reminderNotifications: true,
        infoNotifications: true,
      };
    }

    const row = result.rows[0];
    return {
      pushEnabled: row.push_enabled,
      emailEnabled: row.email_enabled,
      alertNotifications: row.alert_notifications,
      reminderNotifications: row.reminder_notifications,
      infoNotifications: row.info_notifications,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
    };
  }

  async updatePreferences(userId: string, prefs: Partial<NotificationPreferences>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (prefs.pushEnabled !== undefined) {
      updates.push(`push_enabled = $${idx++}`);
      values.push(prefs.pushEnabled);
    }
    if (prefs.emailEnabled !== undefined) {
      updates.push(`email_enabled = $${idx++}`);
      values.push(prefs.emailEnabled);
    }
    if (prefs.alertNotifications !== undefined) {
      updates.push(`alert_notifications = $${idx++}`);
      values.push(prefs.alertNotifications);
    }
    if (prefs.reminderNotifications !== undefined) {
      updates.push(`reminder_notifications = $${idx++}`);
      values.push(prefs.reminderNotifications);
    }
    if (prefs.infoNotifications !== undefined) {
      updates.push(`info_notifications = $${idx++}`);
      values.push(prefs.infoNotifications);
    }
    if (prefs.quietHoursStart !== undefined) {
      updates.push(`quiet_hours_start = $${idx++}`);
      values.push(prefs.quietHoursStart);
    }
    if (prefs.quietHoursEnd !== undefined) {
      updates.push(`quiet_hours_end = $${idx++}`);
      values.push(prefs.quietHoursEnd);
    }

    if (updates.length === 0) return;

    values.push(userId);
    
    await dbPool.query(
      `INSERT INTO notification_preferences (user_id, ${updates.map((u, i) => u.split(' = ')[0]).join(', ')})
       VALUES ($${idx}, ${values.slice(0, -1).map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()`,
      values
    );
  }

  // ============ Send Notifications ============

  async sendToUser(userId: string, notification: NotificationPayload): Promise<string[]> {
    const tokens = await this.getUserTokens(userId);
    const prefs = await this.getPreferences(userId);

    // Check preferences
    if (!prefs.pushEnabled) {
      logger.info({ userId }, 'Push notifications disabled for user');
      return [];
    }

    // Check notification type preferences
    if (notification.type === 'alert' && !prefs.alertNotifications) return [];
    if (notification.type === 'reminder' && !prefs.reminderNotifications) return [];
    if (notification.type === 'info' && !prefs.infoNotifications) return [];

    // Check quiet hours
    if (prefs.quietHoursStart && prefs.quietHoursEnd) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime >= prefs.quietHoursStart && currentTime <= prefs.quietHoursEnd) {
        logger.info({ userId }, 'Skipping notification during quiet hours');
        return [];
      }
    }

    if (tokens.length === 0) {
      logger.info({ userId }, 'No push tokens found for user');
      return [];
    }

    // Save notification to history
    const notifResult = await dbPool.query(
      `INSERT INTO notifications (user_id, title, body, data, type, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [userId, notification.title, notification.body, JSON.stringify(notification.data || {}), notification.type]
    );
    const notificationId = notifResult.rows[0].id;

    // Build messages
    const messages: ExpoPushMessage[] = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: notification.sound || 'default',
        title: notification.title,
        body: notification.body,
        data: { ...notification.data, notificationId },
        badge: notification.badge,
        channelId: notification.channelId || 'default',
      }));

    if (messages.length === 0) {
      return [];
    }

    // Send in chunks
    const chunks = expo.chunkPushNotifications(messages);
    const ticketIds: string[] = [];

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        
        for (const ticket of tickets) {
          if (ticket.status === 'ok' && ticket.id) {
            ticketIds.push(ticket.id);
          } else if (ticket.status === 'error') {
            logger.error({ ticket }, 'Push notification error');
          }
        }
      } catch (error) {
        logger.error({ error }, 'Failed to send push notification chunk');
      }
    }

    // Update notification status
    await dbPool.query(
      'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
      [ticketIds.length > 0 ? 'sent' : 'failed', notificationId]
    );

    return ticketIds;
  }

  async sendToMultipleUsers(userIds: string[], notification: NotificationPayload): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.sendToUser(userId, notification);
      } catch (error) {
        logger.error({ error, userId }, 'Failed to send notification to user');
      }
    }
  }

  async sendToAllUsers(notification: NotificationPayload): Promise<void> {
    const result = await dbPool.query(
      'SELECT DISTINCT user_id FROM push_tokens WHERE is_active = true'
    );
    const userIds = result.rows.map(r => r.user_id);
    await this.sendToMultipleUsers(userIds, notification);
  }

  async broadcastToSite(siteId: string, notification: NotificationPayload): Promise<void> {
    // Get all users assigned to this site
    const result = await dbPool.query(
      `SELECT DISTINCT user_id FROM user_site_assignments WHERE site_id = $1
       UNION
       SELECT id FROM users WHERE role = 'ceo'`,
      [siteId]
    );
    const userIds = result.rows.map(r => r.user_id || r.id);
    await this.sendToMultipleUsers(userIds, notification);
  }

  // ============ Notification History ============

  async getUserNotifications(userId: string, limit = 50): Promise<any[]> {
    const result = await dbPool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      body: row.body,
      data: row.data,
      type: row.type,
      status: row.status,
      sentAt: row.sent_at,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await dbPool.query(
      'UPDATE notifications SET status = $1, read_at = NOW() WHERE id = $2 AND user_id = $3',
      ['read', notificationId, userId]
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await dbPool.query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND status != 'read'`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  // ============ Helpers ============

  private mapToken(row: any): PushToken {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      deviceType: row.device_type,
      deviceName: row.device_name,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    };
  }
}

// Singleton instance
export const pushNotificationService = new PushNotificationService();
