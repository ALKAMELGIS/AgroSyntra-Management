import { dbPool } from '../db/client';
import { pushNotificationService } from './push-notification.service';
import { emitAlert } from '../websocket';
import { UserRole } from '../models/user.model';
import {
  harvestRowClashesPhi,
  parseClockHm,
  SQL_HARVEST_PHI_CLASH,
  type HarvestPhiPreview,
} from '../utils/harvestPhiPreview';

export interface PhiConflictRow {
  id: string;
  harvestId: string;
  fieldId: string;
  applicationId: string;
  harvestDate: string;
  harvestStartTime: string | null;
  fieldName: string;
  segmentId: string | null;
  variety: string | null;
  harvestQty: number;
  productName: string;
  sprayDate: string;
  sprayStartTime: string | null;
  phiEndDate: string;
  daysViolated: number;
  severity: 'high' | 'medium' | 'low';
  status: 'unreviewed' | 'acknowledged' | 'justified';
  notes: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface PhiAuditFilters {
  organizationId: string;
  siteId?: string;
  fieldId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  severity?: string;
}

export interface PhiConflictCounts {
  unreviewedCount: number;
  confirmedCount: number;
}

// New conflict: the auditor is the only reviewer. Operation manager and pest agronomist
// get the same alert for information only (they cannot confirm or dismiss it).
const INITIAL_NOTIFY_ROLES: UserRole[] = ['auditor', 'operation_manager', 'pest_agronomist'];
// Informational: sent to the farm manager after the auditor confirms a violation.
const FM_NOTIFY_ROLES: UserRole[] = ['farm_manager'];

function severityFromDays(days: number): 'high' | 'medium' | 'low' {
  if (days > 3) return 'high';
  if (days >= 1) return 'medium';
  return 'low';
}

function mapConflictRow(r: any): PhiConflictRow {
  const daysViolated = Math.max(0, Number(r.days_violated));
  return {
    id: `${r.harvest_id}:${r.application_id}`,
    harvestId: r.harvest_id,
    fieldId: r.field_id,
    applicationId: r.application_id,
    harvestDate: r.harvest_date,
    harvestStartTime: parseClockHm(r.harvest_start_time),
    fieldName: r.field_name,
    segmentId: r.segment_id || null,
    variety: r.variety || null,
    harvestQty: Number(r.harvest_qty),
    productName: r.product_name,
    sprayDate: r.spray_date,
    sprayStartTime: parseClockHm(r.spray_start_time) || parseClockHm(r.spray_end_time),
    phiEndDate: r.phi_end_date instanceof Date
      ? r.phi_end_date.toISOString()
      : String(r.phi_end_date),
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
    h.start_time AS harvest_start_time,
    f.name AS field_name,
    h.segment_id,
    (SELECT string_agg(hv.variety, ', ') FROM harvest_varieties hv WHERE hv.harvest_id = h.id) AS variety,
    h.total_quantity AS harvest_qty,
    pp.name AS product_name,
    pa.application_date AS spray_date,
    pa.application_start_time AS spray_start_time,
    pa.application_end_time AS spray_end_time,
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
    AND ${SQL_HARVEST_PHI_CLASH}
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

function buildFilterConditions(filters: PhiAuditFilters, startIdx = 1): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
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

export async function getPhiConflicts(filters: PhiAuditFilters): Promise<PhiConflictRow[]> {
  const { clause, params } = buildFilterConditions(filters);

  const result = await dbPool.query(
    `${CONFLICT_SELECT}
     WHERE 1=1 ${clause}
     ORDER BY h.date DESC, days_violated DESC
     LIMIT 500`,
    params,
  );

  return result.rows.map(mapConflictRow);
}

export async function previewHarvestPhiConflicts(opts: {
  organizationId: string;
  fieldId: string;
  harvestDate: string;
  harvestStartTime?: string | null;
  segmentId?: string | null;
}): Promise<HarvestPhiPreview[]> {
  const segment = opts.segmentId?.trim() ? opts.segmentId.trim() : null;
  const harvestStartTime = parseClockHm(opts.harvestStartTime);
  const result = await dbPool.query(
    `SELECT
        pa.id AS application_id,
        f.name AS field_name,
        pp.name AS product_name,
        pa.application_date AS spray_date,
        pa.application_start_time,
        pa.application_end_time,
        pa.phi_end_date,
        (pa.phi_end_date::date - $2::date) AS days_violated
     FROM fields f
     JOIN pesticide_applications pa
       ON pa.field_id = f.id
      AND pa.approval_status = 'approved'
      AND $2::date >= pa.application_date
      AND $2::date <= (timezone('Asia/Dubai', pa.phi_end_date))::date
      AND (
        pa.segment_id = 'ALL'
        OR ($3::text IS NULL AND pa.segment_id IS NULL)
        OR LOWER(TRIM(pa.segment_id)) = LOWER(TRIM($3::text))
      )
     JOIN pesticide_products pp ON pp.id = pa.product_id
     WHERE f.id = $1
       AND f.organization_id = $4
       AND f.deleted_at IS NULL
     ORDER BY days_violated DESC`,
    [opts.fieldId, opts.harvestDate, segment, opts.organizationId],
  );

  return result.rows.flatMap((row: any) => {
    const sprayDate = row.spray_date instanceof Date
      ? row.spray_date.toISOString().slice(0, 10)
      : String(row.spray_date).slice(0, 10);
    const phiEndDate = row.phi_end_date instanceof Date
      ? row.phi_end_date.toISOString()
      : String(row.phi_end_date);
    const clashes = harvestRowClashesPhi({
      harvestDate: opts.harvestDate,
      harvestStartTime,
      sprayDate,
      sprayStartTime: row.application_start_time,
      sprayEndTime: row.application_end_time,
      phiEnd: row.phi_end_date instanceof Date ? row.phi_end_date : phiEndDate,
    });
    if (!clashes) return [];
    return [{
      applicationId: row.application_id,
      fieldName: row.field_name,
      productName: row.product_name,
      sprayDate,
      sprayTime: parseClockHm(row.application_start_time) || parseClockHm(row.application_end_time),
      phiEndDate,
      harvestTime: harvestStartTime,
      daysViolated: Math.max(0, Number(row.days_violated)),
    }];
  });
}

export async function getConflictsForHarvest(harvestId: string): Promise<PhiConflictRow[]> {
  const result = await dbPool.query(
    `${CONFLICT_SELECT}
     WHERE h.id = $1
     ORDER BY days_violated DESC`,
    [harvestId],
  );
  return result.rows.map(mapConflictRow);
}

export async function getPhiConflictCounts(organizationId: string, siteId?: string): Promise<PhiConflictCounts> {
  const { clause, params } = buildFilterConditions({ organizationId, siteId });

  const unreviewedResult = await dbPool.query(
    `SELECT COUNT(*)::int AS count
     FROM (
       ${CONFLICT_SELECT}
       WHERE 1=1 ${clause}
         AND (ack.id IS NULL OR ack.status = 'unreviewed')
     ) sub`,
    params,
  );

  const confirmedResult = await dbPool.query(
    `SELECT COUNT(*)::int AS count
     FROM (
       ${CONFLICT_SELECT}
       WHERE 1=1 ${clause}
         AND ack.status = 'acknowledged'
     ) sub`,
    params,
  );

  return {
    unreviewedCount: unreviewedResult.rows[0]?.count ?? 0,
    confirmedCount: confirmedResult.rows[0]?.count ?? 0,
  };
}

function formatConflictMessage(conflict: PhiConflictRow): string {
  const harvestWhen = conflict.harvestStartTime
    ? `${conflict.fieldName} (${new Date(conflict.harvestDate).toLocaleDateString()} ${conflict.harvestStartTime})`
    : `${conflict.fieldName} (${new Date(conflict.harvestDate).toLocaleDateString()})`;
  return `PHI violation: Harvest on ${harvestWhen} occurred during PHI for ${conflict.productName} (${conflict.daysViolated} day(s) before PHI ended).`;
}

async function alreadyNotified(
  harvestId: string,
  applicationId: string,
  kind: 'initial' | 'farm_manager',
): Promise<boolean> {
  const result = await dbPool.query(
    `SELECT 1 FROM phi_conflict_notifications
     WHERE harvest_id = $1 AND application_id = $2 AND notification_kind = $3`,
    [harvestId, applicationId, kind],
  );
  return result.rows.length > 0;
}

async function markNotified(
  harvestId: string,
  applicationId: string,
  kind: 'initial' | 'farm_manager',
): Promise<void> {
  await dbPool.query(
    `INSERT INTO phi_conflict_notifications (harvest_id, application_id, notification_kind)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [harvestId, applicationId, kind],
  );
}

async function sendConflictNotifications(
  conflict: PhiConflictRow,
  roles: UserRole[],
  kind: 'initial' | 'farm_manager',
): Promise<void> {
  if (roles.length === 0) return;
  if (await alreadyNotified(conflict.harvestId, conflict.applicationId, kind)) return;

  const title = kind === 'initial'
    ? `PHI violation — ${conflict.fieldName}`
    : `Confirmed PHI violation — ${conflict.fieldName}`;
  const message = kind === 'initial'
    ? formatConflictMessage(conflict)
    : `Auditor confirmed a PHI violation: ${formatConflictMessage(conflict)}`;

  const severity = conflict.severity === 'high' ? 'critical' : 'warning';

  const alertResult = await dbPool.query(
    `INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message)
     VALUES ('phi_conflict', $1, $2, $3, $4, $5)
     RETURNING *`,
    [conflict.harvestId, conflict.fieldId, severity, title, message],
  );
  const alertEvent = alertResult.rows[0];

  const rolePlaceholders = roles.map((_, i) => `$${i + 1}`).join(',');
  const usersResult = await dbPool.query(
    `SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND is_active = true`,
    roles,
  );

  if (usersResult.rows.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [alertEvent.id, title, message, severity];
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
      }).catch(() => {});
    }
  }

  await markNotified(conflict.harvestId, conflict.applicationId, kind);
}

export async function notifyInitialPhiConflicts(conflicts: PhiConflictRow[]): Promise<void> {
  for (const conflict of conflicts) {
    if (conflict.status !== 'unreviewed') continue;
    await sendConflictNotifications(conflict, INITIAL_NOTIFY_ROLES, 'initial');
  }
}

export async function checkAndNotifyHarvestConflicts(harvestId: string): Promise<void> {
  const conflicts = await getConflictsForHarvest(harvestId);
  await notifyInitialPhiConflicts(conflicts);
}

export async function getConflictsForField(fieldId: string): Promise<PhiConflictRow[]> {
  const result = await dbPool.query(
    `${CONFLICT_SELECT}
     WHERE h.field_id = $1
     ORDER BY days_violated DESC`,
    [fieldId],
  );
  return result.rows.map(mapConflictRow);
}

export async function checkAndNotifyFieldHarvestConflicts(fieldId: string): Promise<void> {
  const conflicts = await getConflictsForField(fieldId);
  await notifyInitialPhiConflicts(conflicts);
}

export async function acknowledgeConflict(
  harvestId: string,
  applicationId: string,
  userId: string,
  actorRole: UserRole,
  status: 'acknowledged' | 'justified',
  notes?: string,
): Promise<void> {
  await dbPool.query(
    `INSERT INTO phi_audit_acknowledgements (harvest_id, application_id, status, notes, acknowledged_by, acknowledged_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (harvest_id, application_id)
     DO UPDATE SET status = $3, notes = $4, acknowledged_by = $5, acknowledged_at = NOW(), updated_at = NOW()`,
    [harvestId, applicationId, status, notes || null, userId],
  );

  if (status === 'acknowledged' && actorRole === 'auditor') {
    const conflicts = await getConflictsForHarvest(harvestId);
    const conflict = conflicts.find((c) => c.applicationId === applicationId);
    if (conflict) {
      await sendConflictNotifications(conflict, FM_NOTIFY_ROLES, 'farm_manager');
    }
  }
}

/**
 * Sidebar badge = conflicts waiting for a review decision. Only the auditor reviews PHI
 * conflicts, so every other role (CEO, farm manager, …) sees no badge.
 */
export function badgeCountForRole(role: UserRole | undefined, counts: PhiConflictCounts): number {
  if (role === 'auditor') return counts.unreviewedCount;
  return 0;
}
