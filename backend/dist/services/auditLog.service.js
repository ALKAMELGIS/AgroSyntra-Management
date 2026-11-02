"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = logAuditEvent;
exports.queryAuditLogs = queryAuditLogs;
exports.getEntityAuditHistory = getEntityAuditHistory;
exports.getUserActivity = getUserActivity;
exports.computeChanges = computeChanges;
const client_1 = require("../db/client");
/**
 * Log an audit event
 */
async function logAuditEvent(entry) {
    try {
        await client_1.dbPool.query(`INSERT INTO audit_logs (user_id, action, entity, entity_id, changes, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            entry.userId,
            entry.action,
            entry.entity,
            entry.entityId || null,
            entry.changes ? JSON.stringify(entry.changes) : null,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.ipAddress || null,
            entry.userAgent || null,
        ]);
    }
    catch (error) {
        // Log error but don't throw - audit logging shouldn't break the main flow
        console.error('Failed to create audit log entry:', error);
    }
}
/**
 * Query audit logs
 */
async function queryAuditLogs(query) {
    const conditions = [];
    const params = [];
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
        client_1.dbPool.query(`SELECT a.*, u.name as user_name, u.email as user_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`, [...params, limit, offset]),
        client_1.dbPool.query(`SELECT COUNT(*) as total FROM audit_logs a ${whereClause}`, params),
    ]);
    return {
        logs: logsResult.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            userName: row.user_name,
            userEmail: row.user_email,
            action: row.action,
            entity: row.entity,
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
async function getEntityAuditHistory(entity, entityId) {
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
async function getUserActivity(userId, limit = 20) {
    const result = await queryAuditLogs({
        userId,
        limit,
    });
    return result.logs;
}
/**
 * Helper to compute changes between old and new objects
 */
function computeChanges(oldObj, newObj) {
    const changes = {};
    const allKeys = new Set([
        ...Object.keys(oldObj || {}),
        ...Object.keys(newObj),
    ]);
    for (const key of allKeys) {
        // Skip internal fields
        if (['createdAt', 'updatedAt', 'id'].includes(key))
            continue;
        const oldValue = oldObj?.[key];
        const newValue = newObj[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes[key] = { old: oldValue, new: newValue };
        }
    }
    return changes;
}
