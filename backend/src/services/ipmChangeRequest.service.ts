import { dbPool } from '../db/client';
import { notifyUser, notifyUsersByRoles } from './userNotify.service';
import { AppError, NotFoundError } from '../utils/errors';
import {
  assertCanRequestChange,
  assertCanRequestInspectionChange,
  canRequestBioDelete,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
  ENTITY_PESTICIDE_APPLICATION,
  IpmActor,
} from '../utils/ipmAccess';
import {
  assertCanReviewEntityChangeRequest,
  badgeCountForRole,
  canListChangeRequests,
  ChangeRequestCounts,
  ENTITY_BIO_FIELD_SETUP,
  ENTITY_MANPOWER_RECORD,
  ENTITY_SEASON_REOPEN,
  getReviewableEntityTypes,
  isBumbleBeeEntityType,
  reviewerRolesForEntityType,
} from '../utils/changeRequestAccess';
import type { ChangeRequestEntityType } from '../utils/changeRequestAccess';
import { assertCanSubmitManpower } from '../utils/roleAccess';
import * as ipmService from './ipm.service';
import * as manpowerService from './manpower.service';
import * as bioRecordService from './bioRecord.service';
import { logAuditEvent, AuditEntity } from './auditLog.service';
import {
  applyBumbleBeeChangeRequest,
  describeBumbleBeeProposal,
  isBumbleBeeProposalEntityType,
  listBumbleBeeProposals,
  prepareBumbleBeeProposal,
} from './bumbleBeeChangeRequest.service';

/** create / set / receive are bumble-bee proposals (a new record, a stock count, a delivery). */
export type ChangeRequestAction = 'update' | 'delete' | 'create' | 'set' | 'receive';
export type ChangeRequestStatus = 'pending' | 'rejected' | 'approved';

export type { ChangeRequestEntityType } from '../utils/changeRequestAccess';

function parseJsonField(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

function mapChangeRequest(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action as ChangeRequestAction,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    requestedByEmail: row.requested_by_email,
    reason: row.reason,
    proposedPayload: row.proposed_payload,
    snapshotBefore: row.snapshot_before,
    status: row.status as ChangeRequestStatus,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    reviewerComment: row.reviewer_comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PESTICIDE_SNAPSHOT_SQL = `SELECT pa.*, f.name AS field_name, pp.name AS product_name,
            COALESCE(pa.crop_name, c.name) AS crop_name,
            c.name AS field_crop_name
     FROM pesticide_applications pa
     LEFT JOIN fields f ON f.id = pa.field_id
     LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     WHERE pa.id = ANY($1::uuid[])`;

function uniqueEntityIds(ids: Array<string | undefined | null>): string[] {
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}

function compactPesticideSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    field_name: row.field_name ?? null,
    crop_name: row.crop_name ?? row.field_crop_name ?? null,
    product_name: row.product_name ?? null,
    application_date: row.application_date ?? null,
  };
}

function pesticideDeleteIdsFromPayload(
  payload: Record<string, unknown>,
  fallbackId: string,
): string[] {
  const raw = payload.entityIds;
  if (Array.isArray(raw) && raw.length > 0) {
    return uniqueEntityIds(raw.map((id) => String(id)));
  }
  return fallbackId ? [fallbackId] : [];
}

async function getPesticideSnapshots(ids: string[]): Promise<Record<string, unknown>[]> {
  const uniqueIds = uniqueEntityIds(ids);
  const result = await dbPool.query(PESTICIDE_SNAPSHOT_SQL, [uniqueIds]);
  if (result.rows.length !== uniqueIds.length) {
    throw new NotFoundError('Pesticide application not found');
  }
  const byId = new Map(result.rows.map((row: Record<string, unknown>) => [String(row.id), row]));
  return uniqueIds.map((id) => {
    const row = byId.get(id);
    if (!row) throw new NotFoundError('Pesticide application not found');
    return row;
  });
}

async function getEntitySnapshot(
  entityType: ChangeRequestEntityType,
  id: string,
  organizationId?: string,
): Promise<Record<string, unknown>> {
  if (entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
    return ipmService.getBumbleBeeBoxInspection(id, organizationId);
  }
  if (entityType === ENTITY_MANPOWER_RECORD) {
    if (!organizationId) {
      throw new AppError('Organization context is required for manpower change requests', 'VALIDATION_ERROR', 400);
    }
    return manpowerService.getRecordById(id, organizationId);
  }
  if (entityType === ENTITY_BIO_FIELD_SETUP) {
    if (!organizationId) {
      throw new AppError('Organization context is required for biological control change requests', 'VALIDATION_ERROR', 400);
    }
    return bioRecordService.getBioFieldSetupSnapshot(id, organizationId);
  }
  const rows = await getPesticideSnapshots([id]);
  return rows[0];
}

function inspectionRowToComparablePayload(row: Record<string, unknown>) {
  return {
    inspectionDate: String(row.inspection_date || '').split('T')[0],
    boxes100: Number(row.boxes_100) || 0,
    boxes80: Number(row.boxes_80) || 0,
    boxes60: Number(row.boxes_60) || 0,
    boxes40: Number(row.boxes_40) || 0,
    boxes20: Number(row.boxes_20) || 0,
    boxes0: Number(row.boxes_0) || 0,
    notes: String(row.notes ?? ''),
  };
}

function inspectionProposedToComparablePayload(proposed: Record<string, unknown>) {
  return {
    inspectionDate: String(proposed.inspectionDate || '').split('T')[0],
    boxes100: Number(proposed.boxes100) || 0,
    boxes80: Number(proposed.boxes80) || 0,
    boxes60: Number(proposed.boxes60) || 0,
    boxes40: Number(proposed.boxes40) || 0,
    boxes20: Number(proposed.boxes20) || 0,
    boxes0: Number(proposed.boxes0) || 0,
    notes: String(proposed.notes ?? ''),
  };
}

function inspectionProposedMatchesRow(
  row: Record<string, unknown>,
  proposed: Record<string, unknown>,
): boolean {
  const a = inspectionRowToComparablePayload(row);
  const b = inspectionProposedToComparablePayload(proposed);
  return a.inspectionDate === b.inspectionDate
    && a.boxes100 === b.boxes100
    && a.boxes80 === b.boxes80
    && a.boxes60 === b.boxes60
    && a.boxes40 === b.boxes40
    && a.boxes20 === b.boxes20
    && a.boxes0 === b.boxes0
    && a.notes === b.notes;
}

function manpowerRowToComparablePayload(row: Record<string, unknown>) {
  return {
    activity: String(row.activity ?? ''),
    unit: String(row.unit ?? ''),
    variety: String(row.variety ?? ''),
    location: String(row.location ?? ''),
    section: String(row.section ?? ''),
    startTime: String(row.start_time ?? '').substring(0, 5),
    endTime: String(row.end_time ?? '').substring(0, 5),
    target: row.target == null ? '' : String(row.target),
    actual: row.actual == null ? '' : String(row.actual),
    workHours: row.work_hours == null ? '' : String(row.work_hours),
    overtime: row.overtime == null ? '' : String(row.overtime),
    totalHours: row.total_hours == null ? '' : String(row.total_hours),
  };
}

function manpowerProposedToComparablePayload(proposed: Record<string, unknown>) {
  return {
    activity: String(proposed.activity ?? ''),
    unit: String(proposed.unit ?? ''),
    variety: String(proposed.variety ?? ''),
    location: String(proposed.location ?? ''),
    section: String(proposed.section ?? ''),
    startTime: String(proposed.startTime ?? '').substring(0, 5),
    endTime: String(proposed.endTime ?? '').substring(0, 5),
    target: proposed.target == null ? '' : String(proposed.target),
    actual: proposed.actual == null ? '' : String(proposed.actual),
    workHours: proposed.workHours == null ? '' : String(proposed.workHours),
    overtime: proposed.overtime == null ? '' : String(proposed.overtime),
    totalHours: proposed.totalHours == null ? '' : String(proposed.totalHours),
  };
}

function manpowerProposedMatchesRow(
  row: Record<string, unknown>,
  proposed: Record<string, unknown>,
): boolean {
  const a = manpowerRowToComparablePayload(row);
  const b = manpowerProposedToComparablePayload(proposed);
  return Object.keys(a).every((key) => a[key as keyof typeof a] === b[key as keyof typeof b]);
}

function changeRequestEntityLabel(entityType: ChangeRequestEntityType): string {
  switch (entityType) {
    case ENTITY_BUMBLE_BEE_BOX_INSPECTION:
      return 'bumble bee inspection';
    case ENTITY_BUMBLE_BEE_DEPLOYMENT:
      return 'bumble bee deployment';
    case ENTITY_BUMBLE_BEE_INVENTORY:
      return 'bumble bee boxes on hand';
    case ENTITY_BUMBLE_BEE_ORDER:
      return 'bumble bee order';
    case ENTITY_MANPOWER_RECORD:
      return 'manpower record';
    case ENTITY_PESTICIDE_APPLICATION:
      return 'pesticide application';
    case ENTITY_SEASON_REOPEN:
      return 'season reopen';
    case ENTITY_BIO_FIELD_SETUP:
      return 'biological control table';
    default: {
      const _exhaustive: never = entityType;
      return _exhaustive;
    }
  }
}

async function assertNoPendingForEntities(entityType: string, entityIds: string[]): Promise<void> {
  const ids = uniqueEntityIds(entityIds);
  if (ids.length === 0) return;
  const existing = await dbPool.query(
    `SELECT id FROM ipm_change_requests
     WHERE entity_type = $1
       AND status = 'pending'
       AND (
         entity_id = ANY($2::uuid[])
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(COALESCE(proposed_payload->'entityIds', '[]'::jsonb)) eid
           WHERE eid = ANY($3::text[])
         )
       )
     LIMIT 1`,
    [entityType, ids, ids],
  );
  if (existing.rows.length > 0) {
    throw new AppError('A pending change request already exists for this record', 'CONFLICT', 409);
  }
}

export type CreateChangeRequestInput = {
  entityType?: ChangeRequestEntityType;
  entityId?: string;
  entityIds?: string[];
  action: ChangeRequestAction;
  reason: string;
  proposedPayload?: Record<string, unknown> | null;
  siteId?: string | null;
  organizationId?: string;
  /** The caller's own rejected request this one corrects (shown as resubmitted). */
  resubmitOf?: string | null;
};

/** Only the requester's own rejected request of the same type can be corrected. */
async function resolveResubmitOf(
  actor: IpmActor,
  entityType: string,
  resubmitOf: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<string | null> {
  if (!resubmitOf || !organizationId) return null;
  const result = await dbPool.query(
    `SELECT id FROM ipm_change_requests
     WHERE id = $1 AND organization_id = $2 AND requested_by = $3
       AND entity_type = $4 AND status = 'rejected'`,
    [resubmitOf, organizationId, actor.userId, entityType],
  );
  return result.rows[0]?.id ?? null;
}

/** Pest agronomists of the organization get one notification per scouter proposal. */
function notifyBumbleBeeReviewers(
  entityType: ChangeRequestEntityType,
  action: string,
  snapshot: Record<string, unknown>,
  requestId: string,
  organizationId: string | null,
) {
  notifyUsersByRoles(reviewerRolesForEntityType(entityType), {
    title: 'Bumble bees — approval needed',
    message: `A scouter sent ${describeBumbleBeeProposal(entityType, action, snapshot)} for your approval.`,
    severity: 'info',
    entityType: 'change_request',
    entityId: requestId,
    path: '/audit/change-requests',
    organizationId,
  }).catch(() => {});
}

/**
 * A scouter's deployment / boxes-on-hand / order change. Only the change request
 * is written; the bumble-bee tables are untouched until approval.
 */
async function createBumbleBeeProposalRequest(
  actor: IpmActor,
  entityType: ChangeRequestEntityType,
  input: CreateChangeRequestInput,
) {
  if (!input.reason?.trim()) {
    throw new AppError('Reason is required for change requests', 'VALIDATION_ERROR', 400);
  }
  const prepared = await prepareBumbleBeeProposal(actor, {
    entityType,
    action: input.action,
    entityId: input.entityId || null,
    proposedPayload: input.proposedPayload,
    organizationId: input.organizationId,
  });
  if (prepared.entityId) {
    await assertNoPendingForEntities(entityType, [prepared.entityId]);
  }
  const orgId = input.organizationId as string;
  const resubmitOf = await resolveResubmitOf(actor, entityType, input.resubmitOf, orgId);
  const snapshotBefore = resubmitOf
    ? { ...prepared.snapshotBefore, resubmit_of: resubmitOf }
    : prepared.snapshotBefore;

  const result = await dbPool.query(
    `INSERT INTO ipm_change_requests
       (entity_type, entity_id, action, requested_by, reason, proposed_payload, snapshot_before, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      entityType,
      prepared.entityId,
      input.action,
      actor.userId,
      input.reason.trim(),
      JSON.stringify(prepared.proposedPayload),
      JSON.stringify(snapshotBefore),
      orgId,
    ],
  );
  const request = mapChangeRequest(result.rows[0]);

  await logAuditEvent({
    userId: actor.userId,
    action: input.action === 'create' ? 'CREATE' : 'UPDATE',
    entity: entityType as AuditEntity,
    entityId: prepared.entityId ?? request.id,
    metadata: {
      changeRequestId: request.id,
      changeAction: input.action,
      reason: input.reason.trim(),
      type: 'change_request_created',
    },
  });

  notifyBumbleBeeReviewers(entityType, input.action, snapshotBefore, request.id, orgId);
  return request;
}

export async function createChangeRequest(
  actor: IpmActor,
  input: CreateChangeRequestInput,
) {
  const entityType = input.entityType || ENTITY_PESTICIDE_APPLICATION;
  if (isBumbleBeeProposalEntityType(entityType)) {
    return createBumbleBeeProposalRequest(actor, entityType, input);
  }
  if (!['update', 'delete'].includes(input.action)) {
    throw new AppError('Only update and delete requests are supported for this record type', 'VALIDATION_ERROR', 400);
  }
  const requestedIds = uniqueEntityIds(
    input.entityIds?.length ? input.entityIds : input.entityId ? [input.entityId] : [],
  );
  if (requestedIds.length === 0) {
    throw new AppError('entityId or entityIds is required', 'VALIDATION_ERROR', 400);
  }
  if (requestedIds.length > 1 && (entityType !== ENTITY_PESTICIDE_APPLICATION || input.action !== 'delete')) {
    throw new AppError(
      'Bulk change requests are only supported for pesticide application deletes',
      'VALIDATION_ERROR',
      400,
    );
  }
  const entityId = requestedIds[0];
  const isBulkPesticideDelete = entityType === ENTITY_PESTICIDE_APPLICATION
    && input.action === 'delete'
    && requestedIds.length > 1;

  if (entityType === ENTITY_MANPOWER_RECORD) {
    assertCanSubmitManpower(actor);
    if (!input.organizationId) {
      throw new AppError('Organization context is required for manpower change requests', 'VALIDATION_ERROR', 400);
    }
  } else if (entityType === ENTITY_BIO_FIELD_SETUP) {
    if (!canRequestBioDelete(actor)) {
      throw new AppError(
        'Only scouters and data-entry workers request biological control table deletes; the pest agronomist deletes directly',
        'FORBIDDEN',
        403,
      );
    }
    if (input.action !== 'delete') {
      throw new AppError('Biological control change requests are for deleting a table only', 'VALIDATION_ERROR', 400);
    }
    if (!input.organizationId) {
      throw new AppError('Organization context is required for biological control change requests', 'VALIDATION_ERROR', 400);
    }
  } else if (entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
    // Every scouter edit or delete of a saved inspection waits for the pest
    // agronomist, including right after saving (no direct-edit window any more).
    assertCanRequestInspectionChange(actor);
    const inspection = await ipmService.getBumbleBeeBoxInspection(entityId, input.organizationId);
    if (inspection.created_by !== actor.userId) {
      throw new AppError('You can only request changes to your own inspections', 'FORBIDDEN', 403);
    }
  } else {
    assertCanRequestChange(actor);
  }

  if (!input.reason?.trim()) {
    throw new AppError('Reason is required for change requests', 'VALIDATION_ERROR', 400);
  }

  if (input.action === 'update' && (!input.proposedPayload || Object.keys(input.proposedPayload).length === 0)) {
    throw new AppError('Proposed changes are required for update requests', 'VALIDATION_ERROR', 400);
  }

  let snapshotBefore: Record<string, unknown>;
  let pesticideRows: Record<string, unknown>[] | null = null;
  if (entityType === ENTITY_PESTICIDE_APPLICATION) {
    pesticideRows = await getPesticideSnapshots(requestedIds);
    snapshotBefore = isBulkPesticideDelete
      ? {
        bulk: true,
        count: pesticideRows.length,
        records: pesticideRows.map(compactPesticideSnapshot),
      }
      : pesticideRows[0];
  } else {
    snapshotBefore = await getEntitySnapshot(entityType, entityId, input.organizationId);
  }

  if (entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
    const fieldId = String((snapshotBefore as { field_id?: string }).field_id || '');
    if (fieldId) {
      const lastDeploy = await ipmService.getBumbleBeeLastForField(fieldId);
      if (lastDeploy) {
        (snapshotBefore as Record<string, unknown>).deploy_total = Number(
          lastDeploy.box_count_total ?? lastDeploy.box_count,
        );
      }
    }
  }

  if (entityType === ENTITY_MANPOWER_RECORD) {
    const approvalStatus = String((snapshotBefore as { approval_status?: string }).approval_status || '');
    if (approvalStatus !== 'approved') {
      throw new AppError('Change requests are only required for approved manpower records', 'VALIDATION_ERROR', 400);
    }
    if (
      input.action === 'update'
      && input.proposedPayload
      && manpowerProposedMatchesRow(snapshotBefore, input.proposedPayload)
    ) {
      throw new AppError('Proposed changes must differ from the current record', 'VALIDATION_ERROR', 400);
    }
  } else if (
    entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION
    && input.action === 'update'
    && input.proposedPayload
    && inspectionProposedMatchesRow(snapshotBefore, input.proposedPayload)
  ) {
    throw new AppError('Proposed changes must differ from the current inspection', 'VALIDATION_ERROR', 400);
  }

  await assertNoPendingForEntities(entityType, requestedIds);

  const orgId = input.organizationId
    || (pesticideRows?.[0] as { organization_id?: string } | undefined)?.organization_id
    || (snapshotBefore as { organization_id?: string }).organization_id
    || null;
  const proposedPayload = isBulkPesticideDelete
    ? { entityIds: requestedIds }
    : input.proposedPayload;

  if (entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
    const resubmitOf = await resolveResubmitOf(actor, entityType, input.resubmitOf, orgId);
    if (resubmitOf) (snapshotBefore as Record<string, unknown>).resubmit_of = resubmitOf;
  }

  const result = await dbPool.query(
    `INSERT INTO ipm_change_requests
       (entity_type, entity_id, action, requested_by, reason, proposed_payload, snapshot_before, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      entityType,
      entityId,
      input.action,
      actor.userId,
      input.reason.trim(),
      proposedPayload ? JSON.stringify(proposedPayload) : null,
      JSON.stringify(snapshotBefore),
      orgId,
    ],
  );

  const request = mapChangeRequest(result.rows[0]);

  await logAuditEvent({
    userId: actor.userId,
    action: 'UPDATE',
    entity: entityType as AuditEntity,
    entityId,
    metadata: {
      changeRequestId: request.id,
      changeAction: input.action,
      reason: input.reason.trim(),
      type: 'change_request_created',
      entityIds: isBulkPesticideDelete ? requestedIds : undefined,
    },
  });

  const label = changeRequestEntityLabel(entityType);
  const notifyMessage = isBulkPesticideDelete
    ? `Delete request for ${requestedIds.length} pesticide applications is pending your review.`
    : `A ${input.action} request for a ${label} is pending your review.`;
  notifyUsersByRoles(reviewerRolesForEntityType(entityType), {
    title: `Change request — ${label}`,
    message: notifyMessage,
    severity: 'info',
    entityType: 'change_request',
    entityId: request.id,
    path: '/audit/change-requests',
    // Bio table deletes and bumble-bee inspection changes reach the requesting
    // organization's pest agronomists only.
    ...(entityType === ENTITY_BIO_FIELD_SETUP || entityType === ENTITY_BUMBLE_BEE_BOX_INSPECTION
      ? { organizationId: orgId }
      : {}),
  }).catch(() => {});

  return request;
}

export async function listChangeRequests(
  actor: IpmActor,
  opts: {
    organizationId: string;
    status?: ChangeRequestStatus;
    entityId?: string;
    entityType?: ChangeRequestEntityType;
    limit?: number;
    offset?: number;
  },
) {
  if (!canListChangeRequests(actor)) {
    throw new AppError('You do not have permission to view change requests', 'FORBIDDEN', 403);
  }

  const reviewable = getReviewableEntityTypes(actor).filter(
    (type): type is Exclude<ChangeRequestEntityType, typeof ENTITY_SEASON_REOPEN> =>
      type !== ENTITY_SEASON_REOPEN,
  );
  if (reviewable.length === 0) {
    return [];
  }

  // Same organization scope as the sidebar badge (countPendingChangeRequests).
  const params: unknown[] = [opts.organizationId];
  const where: string[] = ['cr.organization_id = $1'];

  if (opts.entityType) {
    if (opts.entityType === ENTITY_SEASON_REOPEN || !reviewable.includes(opts.entityType)) {
      return [];
    }
    params.push(opts.entityType);
    where.push(`cr.entity_type = $${params.length}`);
  } else {
    params.push(reviewable);
    where.push(`cr.entity_type = ANY($${params.length}::text[])`);
  }

  if (opts.status) {
    params.push(opts.status);
    where.push(`cr.status = $${params.length}`);
  }
  if (opts.entityId) {
    params.push(opts.entityId);
    where.push(`cr.entity_id = $${params.length}`);
  }

  const limit = Math.min(opts.limit || 100, 500);
  const offset = opts.offset || 0;
  params.push(limit, offset);

  const result = await dbPool.query(
    `SELECT cr.*,
            ru.name AS requested_by_name, ru.email AS requested_by_email,
            rv.name AS reviewed_by_name
     FROM ipm_change_requests cr
     LEFT JOIN users ru ON ru.id = cr.requested_by
     LEFT JOIN users rv ON rv.id = cr.reviewed_by
     WHERE ${where.join(' AND ')}
     ORDER BY cr.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return result.rows.map(mapChangeRequest);
}

export async function reviewChangeRequest(
  actor: IpmActor,
  id: string,
  decision: 'approved' | 'rejected',
  reviewerComment: string | undefined,
  siteId: string | null | undefined,
  organizationId: string,
) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // A request from another organization is reported as not found, never applied.
    const reqResult = await client.query(
      `SELECT * FROM ipm_change_requests WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, organizationId],
    );
    if (reqResult.rows.length === 0) {
      throw new NotFoundError('Change request not found');
    }

    const row = reqResult.rows[0];
    assertCanReviewEntityChangeRequest(actor, row.entity_type);

    if (row.status !== 'pending') {
      throw new AppError('Change request is no longer pending', 'CONFLICT', 409);
    }

    if (decision === 'approved') {
      if (row.entity_type === ENTITY_BIO_FIELD_SETUP) {
        if (row.action !== 'delete') {
          throw new AppError('Unsupported biological control change request', 'VALIDATION_ERROR', 400);
        }
        // Same as the pest agronomist's direct delete, inside this transaction and
        // scoped to the reviewer's organization. Already gone = nothing left to delete.
        const exists = await client.query(
          `SELECT bs.id
           FROM bio_record_field_setup bs
           JOIN fields f ON f.id = bs.field_id
           LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
           LEFT JOIN sites st ON st.id = fa.site_id
           WHERE bs.id = $1
             AND (bs.organization_id = $2 OR (bs.organization_id IS NULL AND st.organization_id = $2))
           FOR UPDATE OF bs`,
          [row.entity_id, organizationId],
        );
        if (exists.rows[0]) {
          await bioRecordService.deleteBioFieldSetup(client, row.entity_id);
        }
      } else if (row.entity_type === ENTITY_MANPOWER_RECORD) {
        const snapshot = parseJsonField(row.snapshot_before);
        const orgId = String(snapshot.organization_id || '');
        if (!orgId) {
          throw new AppError('Manpower record organization missing from snapshot', 'VALIDATION_ERROR', 400);
        }
        if (row.action === 'delete') {
          await manpowerService.deleteRecord(row.entity_id, orgId);
        } else {
          const payload = parseJsonField(row.proposed_payload);
          await manpowerService.updateRecord(row.entity_id, orgId, payload);
        }
      } else if (row.entity_type === ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
        // Applied on the review transaction: the edit and the approval commit together.
        if (row.action === 'delete') {
          await ipmService.deleteBumbleBeeBoxInspection(row.entity_id, client);
        } else {
          const payload = parseJsonField(row.proposed_payload);
          await ipmService.updateBumbleBeeBoxInspection(row.entity_id, payload, {
            skipDeployTotalCheck: true,
          }, client);
        }
      } else if (isBumbleBeeProposalEntityType(row.entity_type)) {
        // Scouter deployment / boxes-on-hand / order proposal. Stock is checked again
        // here; a failure rolls the review back and the request stays pending.
        await applyBumbleBeeChangeRequest(client, row, organizationId);
      } else if (row.action === 'delete') {
        const payload = parseJsonField(row.proposed_payload);
        const ids = pesticideDeleteIdsFromPayload(payload, row.entity_id);
        if (ids.length > 1) {
          const orgId = String(row.organization_id || '');
          if (!orgId) {
            throw new AppError('Organization context is required to approve bulk deletes', 'VALIDATION_ERROR', 400);
          }
          await ipmService.bulkDeletePesticideApplications(ids, orgId);
        } else {
          await ipmService.deletePesticideApplication(ids[0] || row.entity_id);
        }
      } else {
        const payload = parseJsonField(row.proposed_payload);
        const payloadSiteId = typeof payload.siteId === 'string' ? payload.siteId : null;
        await ipmService.updatePesticideApplication(
          row.entity_id,
          payload,
          row.requested_by,
          siteId || payloadSiteId,
        );
      }
    }

    const updated = await client.query(
      `UPDATE ipm_change_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
           reviewer_comment = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [decision, actor.userId, reviewerComment?.trim() || null, id],
    );

    await client.query('COMMIT');

    const request = mapChangeRequest(updated.rows[0]);

    await logAuditEvent({
      userId: actor.userId,
      action: 'UPDATE',
      entity: row.entity_type as AuditEntity,
      entityId: row.entity_id ?? id,
      metadata: {
        changeRequestId: id,
        decision,
        reviewerComment: reviewerComment?.trim() || null,
        changeAction: row.action,
        type: 'change_request_reviewed',
      },
    });

    const label = changeRequestEntityLabel(row.entity_type as ChangeRequestEntityType);
    const comment = reviewerComment?.trim();
    const isBumbleBee = isBumbleBeeEntityType(row.entity_type);
    const bumbleBeeWhat = isBumbleBee
      ? describeBumbleBeeProposal(row.entity_type, row.action, parseJsonField(row.snapshot_before))
      : '';
    notifyUser(row.requested_by, {
      title: `Change request ${decision}`,
      message: isBumbleBee
        ? `Your ${bumbleBeeWhat} was ${decision}${decision === 'approved' ? ' and is now live' : ''}.${comment ? ` Reason: ${comment}` : ''}`
        : `Your ${row.action} request for a ${label} was ${decision}.${comment ? ` Comment: ${comment}` : ''}`,
      severity: decision === 'approved' ? 'info' : 'warning',
      entityType: 'change_request',
      entityId: id,
      // The scouter cannot open the review page; send them back to the Bumble Bees page.
      path: isBumbleBee ? '/ipm/bumble-bees' : '/audit/change-requests',
    }).catch(() => {});

    return request;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Pending (and the caller's rejected) bumble-bee proposals for the Bumble Bees page. */
export async function listBumbleBeePageProposals(actor: IpmActor, organizationId: string, siteId: string) {
  const rows = await listBumbleBeeProposals(actor, organizationId, siteId);
  return rows.map(mapChangeRequest);
}

export async function getPendingRequestForEntity(entityType: string, entityId: string, organizationId: string) {
  const result = await dbPool.query(
    `SELECT cr.*, ru.name AS requested_by_name, ru.email AS requested_by_email
     FROM ipm_change_requests cr
     LEFT JOIN users ru ON ru.id = cr.requested_by
     WHERE cr.entity_type = $1 AND cr.entity_id = $2 AND cr.status = 'pending'
       AND cr.organization_id = $3
     ORDER BY cr.created_at DESC LIMIT 1`,
    [entityType, entityId, organizationId],
  );
  return result.rows[0] ? mapChangeRequest(result.rows[0]) : null;
}

export async function countPendingChangeRequests(organizationId: string): Promise<ChangeRequestCounts> {
  const result = await dbPool.query(
    `SELECT entity_type, COUNT(*)::int AS count
     FROM ipm_change_requests
     WHERE status = 'pending' AND organization_id = $1
     GROUP BY entity_type`,
    [organizationId],
  );

  const counts: ChangeRequestCounts = {
    pesticideApplicationCount: 0,
    bumbleBeeInspectionCount: 0,
    manpowerRecordCount: 0,
    seasonReopenCount: 0,
    bioFieldSetupCount: 0,
    bumbleBeeProposalCount: 0,
    totalCount: 0,
  };

  for (const row of result.rows) {
    const n = Number(row.count) || 0;
    counts.totalCount += n;
    switch (row.entity_type) {
      case ENTITY_PESTICIDE_APPLICATION:
        counts.pesticideApplicationCount = n;
        break;
      case ENTITY_BUMBLE_BEE_BOX_INSPECTION:
        counts.bumbleBeeInspectionCount = n;
        break;
      case ENTITY_MANPOWER_RECORD:
        counts.manpowerRecordCount = n;
        break;
      case ENTITY_BIO_FIELD_SETUP:
        counts.bioFieldSetupCount = n;
        break;
      case ENTITY_BUMBLE_BEE_DEPLOYMENT:
      case ENTITY_BUMBLE_BEE_INVENTORY:
      case ENTITY_BUMBLE_BEE_ORDER:
        counts.bumbleBeeProposalCount = (counts.bumbleBeeProposalCount ?? 0) + n;
        break;
      default:
        break;
    }
  }

  return counts;
}

export async function getPendingChangeRequestBadgeCount(actor: IpmActor, organizationId: string): Promise<number> {
  if (!canListChangeRequests(actor)) return 0;
  const counts = await countPendingChangeRequests(organizationId);
  return badgeCountForRole(actor, counts);
}
