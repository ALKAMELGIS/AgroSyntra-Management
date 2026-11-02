import {
  isIpmAdmin,
  canManageBumbleBees,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_PESTICIDE_APPLICATION,
} from './ipmAccess';

export { ENTITY_BUMBLE_BEE_BOX_INSPECTION, ENTITY_PESTICIDE_APPLICATION };

export const ENTITY_MANPOWER_RECORD = 'manpower_record';
export const ENTITY_SEASON_REOPEN = 'season_reopen';
/** Scouter / worker asking the pest agronomist to delete a biological-control field table. */
export const ENTITY_BIO_FIELD_SETUP = 'bio_field_setup';
/** Scouter bumble-bee proposals (mirror backend/src/utils/ipmAccess.ts). */
export const ENTITY_BUMBLE_BEE_DEPLOYMENT = 'bumble_bee_deployment';
export const ENTITY_BUMBLE_BEE_INVENTORY = 'bumble_bee_inventory';
export const ENTITY_BUMBLE_BEE_ORDER = 'bumble_bee_order';

export const BUMBLE_BEE_ENTITY_TYPES = [
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
];

export function isBumbleBeeEntityType(entityType) {
  return BUMBLE_BEE_ENTITY_TYPES.includes(entityType);
}

export const CHANGE_REQUEST_ENTITY_LABELS = {
  [ENTITY_BIO_FIELD_SETUP]: 'Biological control table',
  [ENTITY_BUMBLE_BEE_DEPLOYMENT]: 'Bumble bee deployment',
  [ENTITY_BUMBLE_BEE_INVENTORY]: 'Bumble bee boxes on hand',
  [ENTITY_BUMBLE_BEE_ORDER]: 'Bumble bee order',
};

const IPM_ENTITY_TYPES = [
  ENTITY_PESTICIDE_APPLICATION,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BIO_FIELD_SETUP,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
];
const MANPOWER_ENTITY_TYPES = [ENTITY_MANPOWER_RECORD];
const SEASON_ENTITY_TYPES = [ENTITY_SEASON_REOPEN];

/** Manpower change requests: the operation manager (plus the IPM admin email override). */
const MANPOWER_CHANGE_REVIEW_ROLES = new Set(['operation_manager']);

export function canReviewManpowerChangeRequests(user) {
  if (!user?.role) return false;
  return isIpmAdmin(user) || MANPOWER_CHANGE_REVIEW_ROLES.has(user.role);
}

export function canReviewEntityChangeRequest(user, entityType) {
  if (!user?.role) return false;
  switch (entityType) {
    case ENTITY_PESTICIDE_APPLICATION:
      return user.role === 'auditor' || isIpmAdmin(user);
    case ENTITY_BUMBLE_BEE_BOX_INSPECTION:
    case ENTITY_BUMBLE_BEE_DEPLOYMENT:
    case ENTITY_BUMBLE_BEE_INVENTORY:
    case ENTITY_BUMBLE_BEE_ORDER:
      return canManageBumbleBees(user);
    case ENTITY_MANPOWER_RECORD:
      return canReviewManpowerChangeRequests(user);
    case ENTITY_SEASON_REOPEN:
      return user.role === 'auditor';
    case ENTITY_BIO_FIELD_SETUP:
      return user.role === 'pest_agronomist' || isIpmAdmin(user);
    default:
      return false;
  }
}

const ALL_ENTITY_TYPES = [
  ENTITY_PESTICIDE_APPLICATION,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_MANPOWER_RECORD,
  ENTITY_SEASON_REOPEN,
  ENTITY_BIO_FIELD_SETUP,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
];

export function getReviewableEntityTypes(user) {
  return ALL_ENTITY_TYPES.filter((type) => canReviewEntityChangeRequest(user, type));
}

export function canListChangeRequests(user) {
  return getReviewableEntityTypes(user).length > 0;
}

export function canViewIpmChangeRequestTab(user) {
  return getReviewableEntityTypes(user).some((type) => IPM_ENTITY_TYPES.includes(type));
}

export function canViewManpowerChangeRequestTab(user) {
  return getReviewableEntityTypes(user).some((type) => MANPOWER_ENTITY_TYPES.includes(type));
}

export function canViewSeasonReopenChangeRequestTab(user) {
  return getReviewableEntityTypes(user).some((type) => SEASON_ENTITY_TYPES.includes(type));
}

export function entityTypesForTab(tab) {
  if (tab === 'manpower') return MANPOWER_ENTITY_TYPES;
  if (tab === 'seasons') return SEASON_ENTITY_TYPES;
  return IPM_ENTITY_TYPES;
}

// ─── Readable change requests (Change Requests page + Bumble Bees page) ───

const ACTION_LABELS = {
  create: 'New',
  update: 'Edit',
  delete: 'Delete',
  set: 'Set count',
  receive: 'Receive',
};

/** Short label for the action chip. */
export function changeRequestActionLabel(action) {
  return ACTION_LABELS[action] || 'Edit';
}

function dateOnly(value) {
  if (!value) return '';
  return String(value).split('T')[0];
}

function orderDates(p) {
  const out = [];
  if (p.orderDate) out.push(`Order date ${dateOnly(p.orderDate)}`);
  if (p.expectedDeliveryDate) out.push(`Expected ${dateOnly(p.expectedDeliveryDate)}`);
  return out;
}

/**
 * What a bumble-bee proposal (deployment, boxes on hand, order) would change, as
 * short lines of text. Empty for every other request type (they have their own views).
 */
export function changeRequestChangeLines(req) {
  if (!req) return [];
  const p = req.proposedPayload || {};
  const s = req.snapshotBefore || {};
  switch (`${req.entityType}:${req.action}`) {
    case `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:create`: {
      const before = Number(p.boxesBefore) || 0;
      const removed = Number(p.boxesRemoved) || 0;
      const added = Number(p.boxesAdded) || 0;
      const lines = [
        `${s.field_name || 'Field'} on ${dateOnly(p.datePlaced)}`,
        `Before ${before} − removed ${removed} + added ${added} = ${before - removed + added} on field`,
      ];
      if (s.quantity_on_hand != null) {
        lines.push(`Takes ${added} from stock (${s.quantity_on_hand} on hand when sent)`);
      }
      if (p.notes) lines.push(`Notes: ${p.notes}`);
      return lines;
    }
    case `${ENTITY_BUMBLE_BEE_DEPLOYMENT}:update`: {
      const lines = [];
      if (p.boxCount !== undefined) lines.push(`Boxes ${s.box_count ?? '—'} → ${p.boxCount}`);
      if (p.dateRemoved !== undefined) lines.push(`Date removed → ${dateOnly(p.dateRemoved) || 'none'}`);
      if (p.notes !== undefined) lines.push(`Notes → ${p.notes || '—'}`);
      return lines;
    }
    case `${ENTITY_BUMBLE_BEE_INVENTORY}:set`: {
      const before = Number(s.quantity_on_hand) || 0;
      const after = Number(p.quantityOnHand) || 0;
      const delta = after - before;
      return [
        `Boxes on hand ${before} → ${after} (${delta > 0 ? `+${delta}` : delta})`,
        ...(s.site_name ? [`Site: ${s.site_name}`] : []),
      ];
    }
    case `${ENTITY_BUMBLE_BEE_ORDER}:create`:
      return [`${p.quantityExpected} boxes`, ...orderDates(p), ...(p.notes ? [`Notes: ${p.notes}`] : [])];
    case `${ENTITY_BUMBLE_BEE_ORDER}:update`: {
      if (p.status === 'cancelled') return ['Cancel this order'];
      const lines = [];
      if (p.quantityExpected !== undefined) lines.push(`Boxes ordered ${s.quantity_expected ?? '—'} → ${p.quantityExpected}`);
      if (p.orderDate !== undefined) lines.push(`Order date ${dateOnly(s.order_date) || '—'} → ${dateOnly(p.orderDate)}`);
      if (p.expectedDeliveryDate !== undefined) {
        lines.push(`Expected ${dateOnly(s.expected_delivery_date) || '—'} → ${dateOnly(p.expectedDeliveryDate)}`);
      }
      if (p.notes !== undefined) lines.push(`Notes → ${p.notes || '—'}`);
      return lines;
    }
    case `${ENTITY_BUMBLE_BEE_ORDER}:receive`: {
      const lines = [`Received ${p.quantityReceived} boxes on ${dateOnly(p.receivedDate)}`];
      if (s.quantity_on_hand != null) {
        lines.push(`Stock ${s.quantity_on_hand} → ${Number(s.quantity_on_hand) + (Number(p.quantityReceived) || 0)} (when sent)`);
      }
      if (p.quantityExpected !== undefined && Number(p.quantityExpected) !== Number(s.quantity_expected)) {
        lines.push(`Boxes ordered ${s.quantity_expected ?? '—'} → ${p.quantityExpected}`);
      }
      return lines;
    }
    default:
      return [];
  }
}

/** One-line title for a bumble-bee proposal: "New deployment · NH 1 · 2026-09-29". */
export function bumbleBeeProposalTitle(req) {
  if (!req) return '';
  const label = req.snapshotBefore?.label;
  const what = {
    [`${ENTITY_BUMBLE_BEE_DEPLOYMENT}:create`]: 'New deployment',
    [`${ENTITY_BUMBLE_BEE_DEPLOYMENT}:update`]: 'Deployment edit',
    [`${ENTITY_BUMBLE_BEE_INVENTORY}:set`]: 'Boxes on hand count',
    [`${ENTITY_BUMBLE_BEE_ORDER}:create`]: 'New order',
    [`${ENTITY_BUMBLE_BEE_ORDER}:update`]: req.proposedPayload?.status === 'cancelled' ? 'Cancel order' : 'Order edit',
    [`${ENTITY_BUMBLE_BEE_ORDER}:receive`]: 'Delivery received',
    [`${ENTITY_BUMBLE_BEE_BOX_INSPECTION}:update`]: 'Inspection edit',
    [`${ENTITY_BUMBLE_BEE_BOX_INSPECTION}:delete`]: 'Inspection delete',
  }[`${req.entityType}:${req.action}`] || 'Bumble bee change';
  return label && req.entityType !== ENTITY_BUMBLE_BEE_ORDER ? `${what} · ${label}` : what;
}
