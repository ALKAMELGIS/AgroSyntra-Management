/**
 * Bumble bees: a scouter's changes wait for the pest agronomist.
 *
 * A scouter's deployment, boxes-on-hand count and incoming-order changes are
 * stored as change requests (ipm_change_requests) and nothing is written to the
 * live bumble-bee tables until the pest agronomist approves. Approval runs the
 * same service functions as a live write, on the review transaction, after
 * checking the stock again.
 *
 * Inspection edits and deletes keep their own change-request branch in
 * ipmChangeRequest.service.ts.
 */
import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import {
  canProposeBumbleBees,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
  IpmActor,
} from '../utils/ipmAccess';
import { BUMBLE_BEE_ENTITY_TYPES } from '../utils/changeRequestAccess';
import * as ipmService from './ipm.service';
import type { BumbleBeeDb } from './ipm.service';

export type BumbleBeeProposalAction = 'create' | 'update' | 'set' | 'receive';

const ALLOWED_ACTIONS: Record<string, BumbleBeeProposalAction[]> = {
  [ENTITY_BUMBLE_BEE_DEPLOYMENT]: ['create', 'update'],
  [ENTITY_BUMBLE_BEE_INVENTORY]: ['set'],
  [ENTITY_BUMBLE_BEE_ORDER]: ['create', 'update', 'receive'],
};

export function isBumbleBeeProposalEntityType(entityType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_ACTIONS, entityType);
}

function parseJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, any>) : {};
}

function dateOnly(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

/** Keep only the keys that were sent (undefined = not part of the proposal). */
function pick(source: Record<string, any>, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

async function getFieldInOrg(fieldId: string, organizationId: string) {
  const result = await dbPool.query(
    `SELECT f.id, f.name, fa.site_id
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE f.id = $1 AND f.organization_id = $2 AND f.deleted_at IS NULL`,
    [fieldId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Field not found');
  return result.rows[0] as { id: string; name: string; site_id: string };
}

async function getSiteInOrg(siteId: string, organizationId: string, db: BumbleBeeDb = dbPool) {
  const result = await db.query(
    'SELECT id, name FROM sites WHERE id = $1 AND organization_id = $2',
    [siteId, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Site not found');
  return result.rows[0] as { id: string; name: string };
}

async function assertNoPendingProposal(
  entityType: string,
  organizationId: string,
  payloadKey: string,
  value: string,
  message: string,
) {
  const existing = await dbPool.query(
    `SELECT id FROM ipm_change_requests
     WHERE entity_type = $1 AND status = 'pending' AND organization_id = $2
       AND entity_id IS NULL AND proposed_payload->>'${payloadKey}' = $3
     LIMIT 1`,
    [entityType, organizationId, value],
  );
  if (existing.rows.length > 0) {
    throw new AppError(message, 'CONFLICT', 409);
  }
}

function orderLabel(order: { quantity_expected?: unknown; expected_delivery_date?: unknown }) {
  const expected = dateOnly(order.expected_delivery_date);
  return `Order of ${order.quantity_expected} boxes${expected ? ` · expected ${expected}` : ''}`;
}

export type PreparedBumbleBeeProposal = {
  entityId: string | null;
  snapshotBefore: Record<string, unknown>;
  proposedPayload: Record<string, unknown>;
};

/**
 * Check a scouter's bumble-bee proposal and build what the change request stores:
 * the proposal, and a snapshot of the record (or the stock) as it is now.
 * Nothing here writes to the bumble-bee tables.
 */
export async function prepareBumbleBeeProposal(
  actor: IpmActor,
  input: {
    entityType: string;
    action: string;
    entityId?: string | null;
    proposedPayload?: Record<string, unknown> | null;
    organizationId?: string;
  },
): Promise<PreparedBumbleBeeProposal> {
  if (!canProposeBumbleBees(actor)) {
    throw new AppError(
      'Only scouters send bumble bee changes for approval; the pest agronomist changes them directly',
      'FORBIDDEN',
      403,
    );
  }
  const orgId = input.organizationId;
  if (!orgId) {
    throw new AppError('Organization context is required for bumble bee change requests', 'VALIDATION_ERROR', 400);
  }
  const allowed = ALLOWED_ACTIONS[input.entityType] || [];
  if (!allowed.includes(input.action as BumbleBeeProposalAction)) {
    throw new AppError(`Unsupported action "${input.action}" for ${input.entityType}`, 'VALIDATION_ERROR', 400);
  }
  const payload = (input.proposedPayload || {}) as Record<string, any>;
  const needsEntity = input.action === 'update' || input.action === 'receive';
  if (needsEntity && !input.entityId) {
    throw new AppError('entityId is required', 'VALIDATION_ERROR', 400);
  }

  if (input.entityType === ENTITY_BUMBLE_BEE_DEPLOYMENT && input.action === 'create') {
    if (!payload.fieldId || !payload.datePlaced) {
      throw new AppError('Field and deployment date are required', 'VALIDATION_ERROR', 400);
    }
    const field = await getFieldInOrg(String(payload.fieldId), orgId);
    const { boxesRemoved, added, boxesBefore: proposedBefore } = ipmService.parseBumbleBeeDeploymentNumbers(payload);
    const last = await ipmService.getBumbleBeeLastForField(field.id);
    const lastTotal = last ? Number(last.box_count_total ?? last.box_count ?? 0) : 0;
    const boxesBefore = proposedBefore ?? lastTotal;
    if (boxesBefore - boxesRemoved + added < 0) {
      throw new AppError('Total boxes on field cannot be negative', 'VALIDATION_ERROR', 400);
    }
    const onHand = await ipmService.getBumbleBeeOnHand(field.site_id);
    if (added > onHand) {
      throw new AppError(`Not enough boxes in stock (${onHand} on hand, ${added} requested)`, 'VALIDATION_ERROR', 400);
    }
    await assertNoPendingProposal(
      ENTITY_BUMBLE_BEE_DEPLOYMENT,
      orgId,
      'fieldId',
      field.id,
      'A deployment on this field is already waiting for approval',
    );
    const datePlaced = dateOnly(payload.datePlaced);
    return {
      entityId: null,
      proposedPayload: {
        fieldId: field.id,
        siteId: field.site_id,
        datePlaced,
        boxesBefore,
        boxesRemoved,
        boxesAdded: added,
        notes: payload.notes || null,
      },
      snapshotBefore: {
        label: `${field.name} · ${datePlaced}`,
        field_id: field.id,
        field_name: field.name,
        site_id: field.site_id,
        organization_id: orgId,
        last_deployment_id: last?.id ?? null,
        last_total: lastTotal,
        quantity_on_hand: onHand,
      },
    };
  }

  if (input.entityType === ENTITY_BUMBLE_BEE_DEPLOYMENT && input.action === 'update') {
    const dep = await ipmService.getBumbleBeeDeployment(String(input.entityId), orgId);
    const proposed = pick(payload, ['boxCount', 'dateRemoved', 'notes']);
    if (Object.keys(proposed).length === 0) {
      throw new AppError('Proposed changes are required for update requests', 'VALIDATION_ERROR', 400);
    }
    return {
      entityId: dep.id,
      proposedPayload: { ...proposed, siteId: dep.site_id },
      snapshotBefore: {
        ...dep,
        label: `${dep.field_name || 'Field'} · ${dateOnly(dep.date_placed)}`,
        organization_id: orgId,
      },
    };
  }

  if (input.entityType === ENTITY_BUMBLE_BEE_INVENTORY) {
    if (!payload.siteId) throw new AppError('siteId is required', 'VALIDATION_ERROR', 400);
    const site = await getSiteInOrg(String(payload.siteId), orgId);
    const qty = Number(payload.quantityOnHand);
    if (!Number.isInteger(qty) || qty < 0) {
      throw new AppError('Boxes on hand must be a whole number of 0 or more', 'VALIDATION_ERROR', 400);
    }
    const current = await ipmService.getBumbleBeeOnHand(site.id);
    if (current === qty) {
      throw new AppError(`Boxes on hand is already ${qty}`, 'VALIDATION_ERROR', 400);
    }
    await assertNoPendingProposal(
      ENTITY_BUMBLE_BEE_INVENTORY,
      orgId,
      'siteId',
      site.id,
      'A boxes-on-hand count for this site is already waiting for approval',
    );
    return {
      entityId: null,
      proposedPayload: { siteId: site.id, quantityOnHand: qty },
      snapshotBefore: {
        label: `Boxes on hand · ${site.name}`,
        site_id: site.id,
        site_name: site.name,
        organization_id: orgId,
        quantity_on_hand: current,
      },
    };
  }

  if (input.entityType === ENTITY_BUMBLE_BEE_ORDER && input.action === 'create') {
    if (!payload.siteId) throw new AppError('siteId is required', 'VALIDATION_ERROR', 400);
    const site = await getSiteInOrg(String(payload.siteId), orgId);
    const normalized = {
      siteId: site.id,
      quantityExpected: Number(payload.quantityExpected),
      orderDate: payload.orderDate ? dateOnly(payload.orderDate) : new Date().toISOString().split('T')[0],
      expectedDeliveryDate: ipmService.orderExpectedDate(payload),
      notes: payload.notes || null,
    };
    ipmService.validateBumbleBeeOrderCreate(normalized);
    return {
      entityId: null,
      proposedPayload: normalized,
      snapshotBefore: {
        label: `New ${orderLabel({ quantity_expected: normalized.quantityExpected, expected_delivery_date: normalized.expectedDeliveryDate }).toLowerCase()}`,
        site_id: site.id,
        site_name: site.name,
        organization_id: orgId,
      },
    };
  }

  // Order edit, cancel or receive: only while the order is still open.
  const order = await ipmService.getBumbleBeeIncomingOrder(String(input.entityId), orgId);
  if (order.status !== 'pending') {
    throw new AppError(`This order is already ${order.status}; it can no longer be changed.`, 'CONFLICT', 409);
  }
  const snapshotBefore = { ...order, label: orderLabel(order), organization_id: orgId };

  if (input.action === 'update') {
    const proposed = pick(payload, ['quantityExpected', 'orderDate', 'expectedDeliveryDate', 'notes', 'status']);
    if (proposed.expectedDeliveryDate === undefined && payload.expectedDate !== undefined) {
      proposed.expectedDeliveryDate = payload.expectedDate;
    }
    if (proposed.status !== undefined && proposed.status !== 'cancelled') {
      throw new AppError('An order can only be cancelled here; receive it to mark it received', 'VALIDATION_ERROR', 400);
    }
    if (Object.keys(proposed).length === 0) {
      throw new AppError('Proposed changes are required for update requests', 'VALIDATION_ERROR', 400);
    }
    return { entityId: order.id, proposedPayload: { ...proposed, siteId: order.site_id }, snapshotBefore };
  }

  // receive
  const proposed = pick(payload, ['receivedDate', 'quantityReceived', 'quantityExpected', 'orderDate', 'expectedDeliveryDate']);
  const qtyReceived = proposed.quantityReceived != null
    ? Number(proposed.quantityReceived)
    : Number(proposed.quantityExpected ?? order.quantity_expected);
  if (!Number.isInteger(qtyReceived) || qtyReceived < 1) {
    throw new AppError('Boxes received must be a whole number of 1 or more', 'VALIDATION_ERROR', 400);
  }
  return {
    entityId: order.id,
    proposedPayload: {
      ...proposed,
      quantityReceived: qtyReceived,
      receivedDate: proposed.receivedDate ? dateOnly(proposed.receivedDate) : new Date().toISOString().split('T')[0],
      siteId: order.site_id,
    },
    snapshotBefore: {
      ...snapshotBefore,
      quantity_on_hand: await ipmService.getBumbleBeeOnHand(order.site_id),
    },
  };
}

/**
 * Apply an approved bumble-bee proposal on the review transaction `client`.
 * Stock and record state are checked again here; a failure throws (409 when the
 * stock or the record changed) and the whole review rolls back, so the request
 * stays pending.
 */
export async function applyBumbleBeeChangeRequest(
  client: BumbleBeeDb,
  row: { entity_type: string; entity_id: string | null; action: string; requested_by: string; proposed_payload: unknown; snapshot_before: unknown },
  organizationId: string,
): Promise<unknown> {
  const payload = parseJson(row.proposed_payload);
  const snapshot = parseJson(row.snapshot_before);
  const requester = row.requested_by;

  switch (`${row.entity_type}:${row.action}`) {
    case `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:create`:
      return ipmService.applyBumbleBeeDeploymentCreate(
        client,
        { ...payload, organizationId },
        requester,
        {
          stockConflictStatus: 409,
          expectedLastDeploymentId: (snapshot.last_deployment_id as string | null | undefined) ?? null,
          organizationId,
        },
      );
    case `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:update`:
      return ipmService.updateBumbleBeeDeployment(String(row.entity_id), payload, organizationId, client);
    case `${ENTITY_BUMBLE_BEE_INVENTORY}:set`: {
      const siteId = String(payload.siteId || '');
      await getSiteInOrg(siteId, organizationId, client);
      return ipmService.applyBumbleBeeInventorySet(
        client,
        siteId,
        organizationId,
        Number(payload.quantityOnHand),
        requester,
        { expectedCurrent: Number(snapshot.quantity_on_hand ?? 0) },
      );
    }
    case `${ENTITY_BUMBLE_BEE_ORDER}:create`: {
      const siteId = String(payload.siteId || '');
      await getSiteInOrg(siteId, organizationId, client);
      return ipmService.createBumbleBeeIncomingOrder({ ...payload, organizationId }, requester, client);
    }
    case `${ENTITY_BUMBLE_BEE_ORDER}:update`:
      return ipmService.updateBumbleBeeIncomingOrder(String(row.entity_id), payload, organizationId, client);
    case `${ENTITY_BUMBLE_BEE_ORDER}:receive`:
      return ipmService.applyBumbleBeeOrderReceive(client, String(row.entity_id), organizationId, requester, {
        receivedDate: payload.receivedDate,
        quantityReceived: payload.quantityReceived,
        quantityExpected: payload.quantityExpected,
        orderDate: payload.orderDate,
        expectedDeliveryDate: payload.expectedDeliveryDate,
      });
    default:
      throw new AppError('Unsupported bumble bee change request', 'VALIDATION_ERROR', 400);
  }
}

/** One line for notifications: "a new deployment on NH 1 · 2026-09-29". */
export function describeBumbleBeeProposal(
  entityType: string,
  action: string,
  snapshot: Record<string, unknown>,
): string {
  const label = snapshot?.label ? String(snapshot.label) : '';
  const suffix = label ? ` (${label})` : '';
  switch (`${entityType}:${action}`) {
    case `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:create`: return `a new bumble bee deployment${suffix}`;
    case `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:update`: return `a bumble bee deployment edit${suffix}`;
    case `${ENTITY_BUMBLE_BEE_INVENTORY}:set`: return `a new boxes-on-hand count${suffix}`;
    case `${ENTITY_BUMBLE_BEE_ORDER}:create`: return `a new bumble bee order${suffix}`;
    case `${ENTITY_BUMBLE_BEE_ORDER}:update`: return `a bumble bee order change${suffix}`;
    case `${ENTITY_BUMBLE_BEE_ORDER}:receive`: return `a bumble bee delivery received${suffix}`;
    case `${ENTITY_BUMBLE_BEE_BOX_INSPECTION}:update`: return `a bumble bee inspection edit${suffix}`;
    case `${ENTITY_BUMBLE_BEE_BOX_INSPECTION}:delete`: return `a bumble bee inspection delete${suffix}`;
    default: return `a bumble bee change${suffix}`;
  }
}

/**
 * Proposals the Bumble Bees page highlights for one site: every pending one in
 * the organization, plus the caller's own rejected ones (last 30 days) that were
 * not corrected and resubmitted yet.
 */
export async function listBumbleBeeProposals(actor: IpmActor, organizationId: string, siteId: string) {
  const result = await dbPool.query(
    `SELECT cr.*,
            ru.name AS requested_by_name, ru.email AS requested_by_email,
            rv.name AS reviewed_by_name
     FROM ipm_change_requests cr
     LEFT JOIN users ru ON ru.id = cr.requested_by
     LEFT JOIN users rv ON rv.id = cr.reviewed_by
     WHERE cr.organization_id = $1
       AND cr.entity_type = ANY($2::text[])
       AND (
         cr.status = 'pending'
         OR (
           cr.status = 'rejected'
           AND cr.requested_by = $3
           AND cr.reviewed_at > NOW() - INTERVAL '30 days'
           AND NOT EXISTS (
             SELECT 1 FROM ipm_change_requests nx
             WHERE nx.organization_id = cr.organization_id
               AND nx.snapshot_before->>'resubmit_of' = cr.id::text
           )
         )
       )
       AND (
         COALESCE(cr.proposed_payload->>'siteId', cr.snapshot_before->>'site_id') = $4::text
         OR (
           cr.entity_type = $5
           AND EXISTS (
             SELECT 1
             FROM bumble_bee_box_inspections bi
             JOIN fields f ON f.id = bi.field_id
             JOIN farm_areas fa ON fa.id = f.farm_area_id
             WHERE bi.id = cr.entity_id AND fa.site_id = $4::uuid
           )
         )
       )
     ORDER BY cr.created_at DESC
     LIMIT 200`,
    [organizationId, BUMBLE_BEE_ENTITY_TYPES, actor.userId, siteId, ENTITY_BUMBLE_BEE_BOX_INSPECTION],
  );
  return result.rows;
}
