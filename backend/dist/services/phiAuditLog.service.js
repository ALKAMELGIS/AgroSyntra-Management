"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhiConflicts = getPhiConflicts;
exports.getConflictsForHarvest = getConflictsForHarvest;
exports.getPhiConflictCounts = getPhiConflictCounts;
exports.notifyInitialPhiConflicts = notifyInitialPhiConflicts;
exports.checkAndNotifyHarvestConflicts = checkAndNotifyHarvestConflicts;
exports.acknowledgeConflict = acknowledgeConflict;
exports.badgeCountForRole = badgeCountForRole;
const client_1 = require("../db/client");
const push_notification_service_1 = require("./push-notification.service");
const websocket_1 = require("../websocket");
const INITIAL_NOTIFY_ROLES = ['auditor', 'operation_manager', 'pest_agronomist'];
const FM_NOTIFY_ROLES = ['farm_manager'];
function severityFromDays(days) {
    if (days > 3)
        return 'high';
    if (days >= 1)
        return 'medium';
    return 'low';
}
function mapConflictRow(r) {
    const daysViolated = Math.max(0, Number(r.days_violated));
    return {
        id: `${r.harvest_id}:${r.application_id}`,
        harvestId: r.harvest_id,
        fieldId: r.field_id,
        applicationId: r.application_id,
        harvestDate: r.harvest_date,
        fieldName: r.field_name,
        segmentId: r.segment_id || null,
        variety: r.variety || null,
        harvestQty: Number(r.harvest_qty),
        productName: r.product_name,
        sprayDate: r.spray_date,
        phiEndDate: r.phi_end_date,
        daysViolated,
        severity: severityFromDays(daysViolated),
        status: r.ack_status,
        notes: r.notes || null,
        acknowledgedBy: r.acknowledged_by || null,
        acknowledgedAt: r.acknowledged_at || null,
    };
}
const CONFLICT_SELECT = `
  SELECT
    h.id AS harvest_id,
    h.field_id,
    pa.id AS application_id,
    h.date AS harvest_date,
    f.name AS field_name,
    h.segment_id,
    (SELECT string_agg(hv.variety, ', ') FROM harvest_varieties hv WHERE hv.harvest_id = h.id) AS variety,
    h.total_quantity AS harvest_qty,
    pp.name AS product_name,
    pa.application_date AS spray_date,
    pa.phi_end_date,
    (pa.phi_end_date::date - h.date) AS days_violated,
    COALESCE(ack.status, 'unreviewed') AS ack_status,
    ack.notes,
    u.name AS acknowledged_by,
    ack.acknowledged_at
  FROM harvests h
  JOIN fields f ON f.id = h.field_id
  LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
  JOIN pesticide_applications pa
    ON pa.field_id = h.field_id
    AND pa.approval_status = 'approved'
    AND h.date >= pa.application_date
    AND h.date < pa.phi_end_date::date
    AND (
      pa.segment_id = 'ALL'
      OR (h.segment_id IS NULL AND pa.segment_id IS NULL)
      OR LOWER(TRIM(h.segment_id)) = LOWER(TRIM(pa.segment_id))
    )
  JOIN pesticide_products pp ON pp.id = pa.product_id
  LEFT JOIN phi_audit_acknowledgements ack
    ON ack.harvest_id = h.id AND ack.application_id = pa.id
  LEFT JOIN users u ON u.id = ack.acknowledged_by
`;
function buildFilterConditions(filters, startIdx = 1) {
    const conditions = [];
    const params = [];
    let idx = startIdx;
    conditions.push(`f.organization_id = $${idx++}`);
    params.push(filters.organizationId);
    if (filters.siteId) {
        conditions.push(`fa.site_id = $${idx++}`);
        params.push(filters.siteId);
    }
    if (filters.fieldId) {
        conditions.push(`h.field_id = $${idx++}`);
        params.push(filters.fieldId);
    }
    if (filters.dateFrom) {
        conditions.push(`h.date >= $${idx++}::date`);
        params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
        conditions.push(`h.date <= $${idx++}::date`);
        params.push(filters.dateTo);
    }
    const clause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    return { clause, params };
}
async function getPhiConflicts(filters) {
    const { clause, params } = buildFilterConditions(filters);
    const result = await client_1.dbPool.query(`${CONFLICT_SELECT}
     WHERE 1=1 ${clause}
     ORDER BY h.date DESC, days_violated DESC
     LIMIT 500`, params);
    return result.rows.map(mapConflictRow);
}
async function getConflictsForHarvest(harvestId) {
    const result = await client_1.dbPool.query(`${CONFLICT_SELECT}
     WHERE h.id = $1
     ORDER BY days_violated DESC`, [harvestId]);
    return result.rows.map(mapConflictRow);
}
async function getPhiConflictCounts(organizationId, siteId) {
    const { clause, params } = buildFilterConditions({ organizationId, siteId });
    const unreviewedResult = await client_1.dbPool.query(`SELECT COUNT(*)::int AS count
     FROM (
       ${CONFLICT_SELECT}
       WHERE 1=1 ${clause}
         AND (ack.id IS NULL OR ack.status = 'unreviewed')
     ) sub`, params);
    const confirmedResult = await client_1.dbPool.query(`SELECT COUNT(*)::int AS count
     FROM (
       ${CONFLICT_SELECT}
       WHERE 1=1 ${clause}
         AND ack.status = 'acknowledged'
     ) sub`, params);
    return {
        unreviewedCount: unreviewedResult.rows[0]?.count ?? 0,
        confirmedCount: confirmedResult.rows[0]?.count ?? 0,
    };
}
function formatConflictMessage(conflict) {
    const harvestDate = new Date(conflict.harvestDate).toLocaleDateString();
    return `PHI violation: Harvest on ${conflict.fieldName} (${harvestDate}) occurred during PHI for ${conflict.productName} (${conflict.daysViolated} day(s) before PHI ended).`;
}
async function alreadyNotified(harvestId, applicationId, kind) {
    const result = await client_1.dbPool.query(`SELECT 1 FROM phi_conflict_notifications
     WHERE harvest_id = $1 AND application_id = $2 AND notification_kind = $3`, [harvestId, applicationId, kind]);
    return result.rows.length > 0;
}
async function markNotified(harvestId, applicationId, kind) {
    await client_1.dbPool.query(`INSERT INTO phi_conflict_notifications (harvest_id, application_id, notification_kind)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`, [harvestId, applicationId, kind]);
}
async function sendConflictNotifications(conflict, roles, kind) {
    if (roles.length === 0)
        return;
    if (await alreadyNotified(conflict.harvestId, conflict.applicationId, kind))
        return;
    const title = kind === 'initial'
        ? `PHI violation — ${conflict.fieldName}`
        : `Confirmed PHI violation — ${conflict.fieldName}`;
    const message = kind === 'initial'
        ? formatConflictMessage(conflict)
        : `Auditor confirmed a PHI violation: ${formatConflictMessage(conflict)}`;
    const severity = conflict.severity === 'high' ? 'critical' : 'warning';
    const alertResult = await client_1.dbPool.query(`INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message)
     VALUES ('phi_conflict', $1, $2, $3, $4, $5)
     RETURNING *`, [conflict.harvestId, conflict.fieldId, severity, title, message]);
    const alertEvent = alertResult.rows[0];
    const rolePlaceholders = roles.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await client_1.dbPool.query(`SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND is_active = true`, roles);
    if (usersResult.rows.length > 0) {
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
        for (const user of usersResult.rows) {
            (0, websocket_1.emitAlert)(alertEvent, user.id);
            push_notification_service_1.pushNotificationService.sendToUser(user.id, {
                title,
                body: message,
                type: 'alert',
                data: {
                    entityType: 'phi_conflict',
                    path: '/audit/phi-audit-log',
                    conflictId: conflict.id,
                    harvestId: conflict.harvestId,
                    applicationId: conflict.applicationId,
                },
            }).catch(() => { });
        }
    }
    await markNotified(conflict.harvestId, conflict.applicationId, kind);
}
async function notifyInitialPhiConflicts(conflicts) {
    for (const conflict of conflicts) {
        if (conflict.status !== 'unreviewed')
            continue;
        await sendConflictNotifications(conflict, INITIAL_NOTIFY_ROLES, 'initial');
    }
}
async function checkAndNotifyHarvestConflicts(harvestId) {
    const conflicts = await getConflictsForHarvest(harvestId);
    await notifyInitialPhiConflicts(conflicts);
}
async function acknowledgeConflict(harvestId, applicationId, userId, actorRole, status, notes) {
    await client_1.dbPool.query(`INSERT INTO phi_audit_acknowledgements (harvest_id, application_id, status, notes, acknowledged_by, acknowledged_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (harvest_id, application_id)
     DO UPDATE SET status = $3, notes = $4, acknowledged_by = $5, acknowledged_at = NOW(), updated_at = NOW()`, [harvestId, applicationId, status, notes || null, userId]);
    if (status === 'acknowledged' && actorRole === 'auditor') {
        const conflicts = await getConflictsForHarvest(harvestId);
        const conflict = conflicts.find((c) => c.applicationId === applicationId);
        if (conflict) {
            await sendConflictNotifications(conflict, FM_NOTIFY_ROLES, 'farm_manager');
        }
    }
}
function badgeCountForRole(role, counts) {
    if (role === 'farm_manager')
        return counts.confirmedCount;
    return counts.unreviewedCount;
}
