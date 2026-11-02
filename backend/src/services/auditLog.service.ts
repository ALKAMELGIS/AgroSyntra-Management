import { dbPool } from '../db/client';

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'EXPORT' 
  | 'IMPORT'
  | 'APPROVE';

export type AuditEntity = 
  | 'harvest' 
  | 'fertigation' 
  | 'ecph_reading' 
  | 'field' 
  | 'user' 
  | 'recipe'
  | 'schedule'
  | 'report'
  | 'assignment'
  | 'gis_layer'
  | 'site'
  | 'season'
  | 'zone'
  | 'pesticide_application'
  | 'bumble_bee_box_inspection'
  | 'bumble_bee_deployment'
  | 'bumble_bee_inventory'
  | 'bumble_bee_order'
  | 'manpower_record'
  | 'plantation_opening'
  | 'plantation_closing'
  | 'bio_record'
  | 'bio_field_setup';

export interface AuditLogEntry {
  id?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}

export interface AuditLogQuery {
  userId?: string;
  entity?: AuditEntity;
  action?: AuditAction;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Log an audit event
 */
export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    await dbPool.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, changes, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId,
        entry.action,
        entry.entity,
        entry.entityId || null,
        entry.changes ? JSON.stringify(entry.changes) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
      ]
    );
  } catch (error) {
    // Log error but don't throw - audit logging shouldn't break the main flow
    console.error('Failed to create audit log entry:', error);
  }
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(query: AuditLogQuery): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramCount = 0;

  if (query.userId) {
    paramCount++;
    conditions.push(`a.user_id = $${paramCount}`);
    params.push(query.userId);
  }
  if (query.entity) {
    paramCount++;
    conditions.push(`a.entity = $${paramCount}`);
    params.push(query.entity);
  }
  if (query.action) {
    paramCount++;
    conditions.push(`a.action = $${paramCount}`);
    params.push(query.action);
  }
  if (query.entityId) {
    paramCount++;
    conditions.push(`a.entity_id = $${paramCount}`);
    params.push(query.entityId);
  }
  if (query.startDate) {
    paramCount++;
    conditions.push(`a.created_at >= $${paramCount}`);
    params.push(query.startDate);
  }
  if (query.endDate) {
    paramCount++;
    conditions.push(`a.created_at <= $${paramCount}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  const [logsResult, countResult] = await Promise.all([
    dbPool.query(
      `SELECT a.*, u.name as user_name, u.email as user_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    ),
    dbPool.query(
      `SELECT COUNT(*) as total FROM audit_logs a ${whereClause}`,
      params
    ),
  ]);

  return {
    logs: logsResult.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      action: row.action as AuditAction,
      entity: row.entity as AuditEntity,
      entityId: row.entity_id || undefined,
      changes: row.changes || undefined,
      metadata: row.metadata || undefined,
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,
      createdAt: row.created_at,
    })),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get audit logs for a specific entity
 */
export async function getEntityAuditHistory(
  entity: AuditEntity,
  entityId: string
): Promise<AuditLogEntry[]> {
  const result = await queryAuditLogs({
    entity,
    entityId,
    limit: 100,
  });
  return result.logs;
}

/**
 * Get recent activity for a user
 */
export async function getUserActivity(
  userId: string,
  limit: number = 20
): Promise<AuditLogEntry[]> {
  const result = await queryAuditLogs({
    userId,
    limit,
  });
  return result.logs;
}

/**
 * Helper to compute changes between old and new objects
 */
export function computeChanges(
  oldObj: Record<string, any> | null,
  newObj: Record<string, any>
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  
  const allKeys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj),
  ]);

  for (const key of allKeys) {
    // Skip internal fields
    if (['createdAt', 'updatedAt', 'id'].includes(key)) continue;
    
    const oldValue = oldObj?.[key];
    const newValue = newObj[key];
    
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }

  return changes;
}
