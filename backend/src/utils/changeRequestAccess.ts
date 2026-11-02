import { AppError } from './errors';
import {
  canManageBumbleBees,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
  ENTITY_PESTICIDE_APPLICATION,
  IpmActor,
  isIpmAdmin,
} from './ipmAccess';

export {
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
  ENTITY_PESTICIDE_APPLICATION,
};

export const ENTITY_MANPOWER_RECORD = 'manpower_record';
export const ENTITY_SEASON_REOPEN = 'season_reopen';
/** A scouter or worker asking the pest agronomist to delete a biological-control field table. */
export const ENTITY_BIO_FIELD_SETUP = 'bio_field_setup';

export type ChangeRequestEntityType =
  | typeof ENTITY_PESTICIDE_APPLICATION
  | typeof ENTITY_BUMBLE_BEE_BOX_INSPECTION
  | typeof ENTITY_BUMBLE_BEE_DEPLOYMENT
  | typeof ENTITY_BUMBLE_BEE_INVENTORY
  | typeof ENTITY_BUMBLE_BEE_ORDER
  | typeof ENTITY_MANPOWER_RECORD
  | typeof ENTITY_SEASON_REOPEN
  | typeof ENTITY_BIO_FIELD_SETUP;

/** Scouter proposals on the Bumble Bees page other than inspection edits. */
export const BUMBLE_BEE_PROPOSAL_ENTITY_TYPES: ChangeRequestEntityType[] = [
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
];

/** Every change-request type the Bumble Bees page shows (inspections included). */
export const BUMBLE_BEE_ENTITY_TYPES: ChangeRequestEntityType[] = [
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ...BUMBLE_BEE_PROPOSAL_ENTITY_TYPES,
];

export function isBumbleBeeEntityType(entityType: string): boolean {
  return (BUMBLE_BEE_ENTITY_TYPES as string[]).includes(entityType);
}

/** Manpower change requests: the operation manager (plus the IPM admin email override). */
const MANPOWER_CHANGE_REVIEW_ROLES = new Set(['operation_manager']);

export function canReviewManpowerChangeRequests(actor: IpmActor): boolean {
  return isIpmAdmin(actor) || MANPOWER_CHANGE_REVIEW_ROLES.has(actor.role);
}

export function canReviewEntityChangeRequest(actor: IpmActor, entityType: string): boolean {
  switch (entityType) {
    case ENTITY_PESTICIDE_APPLICATION:
      return actor.role === 'auditor' || isIpmAdmin(actor);
    case ENTITY_BUMBLE_BEE_BOX_INSPECTION:
    case ENTITY_BUMBLE_BEE_DEPLOYMENT:
    case ENTITY_BUMBLE_BEE_INVENTORY:
    case ENTITY_BUMBLE_BEE_ORDER:
      return canManageBumbleBees(actor);
    case ENTITY_MANPOWER_RECORD:
      return canReviewManpowerChangeRequests(actor);
    case ENTITY_SEASON_REOPEN:
      return actor.role === 'auditor';
    case ENTITY_BIO_FIELD_SETUP:
      return actor.role === 'pest_agronomist' || isIpmAdmin(actor);
    default:
      return false;
  }
}

const ALL_ENTITY_TYPES: ChangeRequestEntityType[] = [
  ENTITY_PESTICIDE_APPLICATION,
  ENTITY_BUMBLE_BEE_BOX_INSPECTION,
  ENTITY_MANPOWER_RECORD,
  ENTITY_SEASON_REOPEN,
  ENTITY_BIO_FIELD_SETUP,
  ENTITY_BUMBLE_BEE_DEPLOYMENT,
  ENTITY_BUMBLE_BEE_INVENTORY,
  ENTITY_BUMBLE_BEE_ORDER,
];

export function getReviewableEntityTypes(actor: IpmActor): ChangeRequestEntityType[] {
  return ALL_ENTITY_TYPES.filter((type) => canReviewEntityChangeRequest(actor, type));
}

export function canListChangeRequests(actor: IpmActor): boolean {
  return getReviewableEntityTypes(actor).length > 0;
}

export function assertCanReviewEntityChangeRequest(actor: IpmActor, entityType: string): void {
  if (!canReviewEntityChangeRequest(actor, entityType)) {
    switch (entityType) {
      case ENTITY_BUMBLE_BEE_BOX_INSPECTION:
        throw new AppError('Only pest agronomists may review bumble bee inspection change requests', 'FORBIDDEN', 403);
      case ENTITY_BUMBLE_BEE_DEPLOYMENT:
      case ENTITY_BUMBLE_BEE_INVENTORY:
      case ENTITY_BUMBLE_BEE_ORDER:
        throw new AppError('Only pest agronomists may review bumble bee change requests', 'FORBIDDEN', 403);
      case ENTITY_BIO_FIELD_SETUP:
        throw new AppError('Only pest agronomists may review biological control change requests', 'FORBIDDEN', 403);
      case ENTITY_MANPOWER_RECORD:
        throw new AppError('Only operation managers may review manpower change requests', 'FORBIDDEN', 403);
      case ENTITY_PESTICIDE_APPLICATION:
      case ENTITY_SEASON_REOPEN:
        throw new AppError('Only auditors may review change requests', 'FORBIDDEN', 403);
      default:
        throw new AppError('Unsupported change request entity type', 'VALIDATION_ERROR', 400);
    }
  }
}

export type ChangeRequestCounts = {
  pesticideApplicationCount: number;
  bumbleBeeInspectionCount: number;
  manpowerRecordCount: number;
  seasonReopenCount: number;
  /** Optional so callers that build counts by hand keep compiling. */
  bioFieldSetupCount?: number;
  /** Scouter deployment, boxes-on-hand and order proposals. Optional for the same reason. */
  bumbleBeeProposalCount?: number;
  totalCount: number;
};

export function badgeCountForRole(actor: IpmActor, counts: ChangeRequestCounts): number {
  let count = 0;
  if (canReviewEntityChangeRequest(actor, ENTITY_PESTICIDE_APPLICATION)) {
    count += counts.pesticideApplicationCount;
  }
  if (canReviewEntityChangeRequest(actor, ENTITY_BUMBLE_BEE_BOX_INSPECTION)) {
    count += counts.bumbleBeeInspectionCount;
  }
  if (canReviewEntityChangeRequest(actor, ENTITY_BUMBLE_BEE_DEPLOYMENT)) {
    count += counts.bumbleBeeProposalCount ?? 0;
  }
  if (canReviewEntityChangeRequest(actor, ENTITY_MANPOWER_RECORD)) {
    count += counts.manpowerRecordCount;
  }
  if (canReviewEntityChangeRequest(actor, ENTITY_SEASON_REOPEN)) {
    count += counts.seasonReopenCount;
  }
  if (canReviewEntityChangeRequest(actor, ENTITY_BIO_FIELD_SETUP)) {
    count += counts.bioFieldSetupCount ?? 0;
  }
  return count;
}

export function reviewerRolesForEntityType(entityType: ChangeRequestEntityType): string[] {
  switch (entityType) {
    case ENTITY_PESTICIDE_APPLICATION:
      return ['auditor'];
    case ENTITY_BUMBLE_BEE_BOX_INSPECTION:
    case ENTITY_BUMBLE_BEE_DEPLOYMENT:
    case ENTITY_BUMBLE_BEE_INVENTORY:
    case ENTITY_BUMBLE_BEE_ORDER:
      return ['pest_agronomist'];
    case ENTITY_MANPOWER_RECORD:
      return ['operation_manager'];
    case ENTITY_SEASON_REOPEN:
      return ['auditor'];
    case ENTITY_BIO_FIELD_SETUP:
      return ['pest_agronomist'];
    default: {
      const _exhaustive: never = entityType;
      return _exhaustive;
    }
  }
}
