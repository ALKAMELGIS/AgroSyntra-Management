import { UserRole } from '../models/user.model';
import { AppError } from './errors';

const DATA_ENTRY_OPERATE = new Set<UserRole>(['worker', 'agronomist']);
/** Tasks, shift schedule and the workers roster. Manpower days use the MANPOWER_* sets below. */
const WORKFORCE_OPERATE = new Set<UserRole>(['worker', 'agronomist']);
/** Who may type a manpower day. Typed days are always stored pending (the server decides). */
const MANPOWER_SUBMIT = new Set<UserRole>(['worker', 'operator']);
/** Who may import manpower days from Excel (stored approved). */
const MANPOWER_IMPORT = new Set<UserRole>(['worker']);
/** Who may approve or reject manpower submissions. */
const MANPOWER_APPROVE = new Set<UserRole>(['operation_manager']);
/** Who may add activity names / save import aliases (Excel import). Pivot column + reference stay OM-only. */
const MANPOWER_ACTIVITY_CREATE = new Set<UserRole>(['worker', 'operation_manager']);
/** Who may manage the manpower workers roster and varieties. */
const MANPOWER_ROSTER = new Set<UserRole>(['worker', 'operation_manager']);

/** Who may see manpower cost (approved hours × rate). */
const MANPOWER_COST_VIEW = new Set<UserRole>(['worker', 'operation_manager', 'farm_manager', 'ceo']);
/** Who may set Casual / Permanent / personal hourly rates. */
const MANPOWER_RATE_EDIT = new Set<UserRole>(['worker', 'operation_manager']);

/**
 * Who may create or edit scouting reports. CEO, farm manager and operation
 * manager only watch; review / send back stays with the pest agronomist and
 * the IPM admin (canReviewScouting in ipmAccess.ts).
 */
const SCOUTING_OPERATE = new Set<UserRole>([
  'scouter',
  'agronomist',
  'pest_agronomist',
]);

export interface RoleActor {
  userId: string;
  role: UserRole;
}

export function canOperateDataEntry(role: UserRole): boolean {
  return DATA_ENTRY_OPERATE.has(role);
}

export function canOperateWorkforce(role: UserRole): boolean {
  return WORKFORCE_OPERATE.has(role);
}

export function canApproveManpowerRecords(role: UserRole): boolean {
  return MANPOWER_APPROVE.has(role);
}

export function canEditManpowerReference(role: UserRole): boolean {
  return role === 'operation_manager';
}

export function assertCanEditManpowerReference(actor: RoleActor): void {
  if (!canEditManpowerReference(actor.role)) {
    throw new AppError(
      'Only Operation Managers can change the manpower activity reference',
      'FORBIDDEN',
      403,
    );
  }
}

export function assertCanApproveManpowerRecords(actor: RoleActor): void {
  if (!canApproveManpowerRecords(actor.role)) {
    throw new AppError(
      'Only Operation Managers can approve or reject manpower activity submissions',
      'FORBIDDEN',
      403,
    );
  }
}

export const MANPOWER_COST_VIEW_ROLES = [...MANPOWER_COST_VIEW];

export function canViewManpowerCost(role: UserRole): boolean {
  return MANPOWER_COST_VIEW.has(role);
}

export function canEditManpowerRates(role: UserRole): boolean {
  return MANPOWER_RATE_EDIT.has(role);
}

export function assertCanEditManpowerRates(actor: RoleActor): void {
  if (!canEditManpowerRates(actor.role)) {
    throw new AppError(
      'Only Data Entry Workers and Operation Managers can change manpower rates',
      'FORBIDDEN',
      403,
    );
  }
}

export function canSubmitManpower(role: UserRole): boolean {
  return MANPOWER_SUBMIT.has(role);
}

export function assertCanSubmitManpower(actor: RoleActor): void {
  if (!canSubmitManpower(actor.role)) {
    throw new AppError(
      'Only data entry workers and operators can submit manpower activity',
      'FORBIDDEN',
      403,
    );
  }
}

export function canImportManpower(role: UserRole): boolean {
  return MANPOWER_IMPORT.has(role);
}

export function assertCanImportManpower(actor: RoleActor): void {
  if (!canImportManpower(actor.role)) {
    throw new AppError(
      'Only data entry workers can import manpower activity from Excel',
      'FORBIDDEN',
      403,
    );
  }
}

export function canCreateManpowerActivity(role: UserRole): boolean {
  return MANPOWER_ACTIVITY_CREATE.has(role);
}

export function assertCanCreateManpowerActivity(actor: RoleActor): void {
  if (!canCreateManpowerActivity(actor.role)) {
    throw new AppError(
      'Only data entry workers and Operation Managers can add manpower activity names',
      'FORBIDDEN',
      403,
    );
  }
}

export function canManageManpowerRoster(role: UserRole): boolean {
  return MANPOWER_ROSTER.has(role);
}

export function assertCanManageManpowerRoster(actor: RoleActor): void {
  if (!canManageManpowerRoster(actor.role)) {
    throw new AppError(
      'Only data entry workers and Operation Managers can change the manpower workers list',
      'FORBIDDEN',
      403,
    );
  }
}

export interface ManpowerRecordAccessInfo {
  approval_status?: string | null;
  created_by?: string | null;
}

/**
 * The operation manager may edit or delete any manpower record (approved ones
 * still need a change request from everyone who cannot review them). A
 * submitter (worker or operator) may only touch records they typed themselves
 * while those are still pending. Nobody else may modify manpower records.
 */
export function canModifyManpowerRecord(
  actor: RoleActor,
  record: ManpowerRecordAccessInfo,
): boolean {
  if (canApproveManpowerRecords(actor.role)) return true;
  return canSubmitManpower(actor.role)
    && record.approval_status === 'pending'
    && Boolean(record.created_by)
    && record.created_by === actor.userId;
}

export function assertCanModifyManpowerRecord(
  actor: RoleActor,
  record: ManpowerRecordAccessInfo,
): void {
  if (!canModifyManpowerRecord(actor, record)) {
    throw new AppError(
      'You do not have permission to modify this manpower record',
      'FORBIDDEN',
      403,
    );
  }
}

export interface ManpowerImportCorrectionInfo extends ManpowerRecordAccessInfo {
  submission_id?: string | null;
}

/**
 * Hours corrections sent by the Excel import (bulk-update): the importing
 * worker may change only records they created themselves that are either
 * still pending, or were stored by their own Excel import (approved on import,
 * so no submission). Approved typed days and anyone else's records go through
 * the change-request flow instead.
 */
export function canImportCorrectManpowerRecord(
  actor: RoleActor,
  record: ManpowerImportCorrectionInfo,
): boolean {
  if (!canImportManpower(actor.role)) return false;
  if (!record.created_by || record.created_by !== actor.userId) return false;
  if (record.approval_status === 'pending') return true;
  return record.approval_status === 'approved' && !record.submission_id;
}

export function canOperateScouting(role: UserRole): boolean {
  return SCOUTING_OPERATE.has(role);
}

export function assertCanOperateDataEntry(actor: RoleActor): void {
  if (!canOperateDataEntry(actor.role)) {
    throw new AppError(
      'You do not have permission to create or modify operational data entries',
      'FORBIDDEN',
      403,
    );
  }
}

export function assertCanOperateWorkforce(actor: RoleActor): void {
  if (!canOperateWorkforce(actor.role)) {
    throw new AppError(
      'You do not have permission to create or modify workforce records',
      'FORBIDDEN',
      403,
    );
  }
}

export function assertCanOperateScouting(actor: RoleActor): void {
  if (!canOperateScouting(actor.role)) {
    throw new AppError(
      'You do not have permission to create or modify scouting reports',
      'FORBIDDEN',
      403,
    );
  }
}

export function isSiteScopedRole(role: UserRole): boolean {
  return [
    'operation_manager',
    'worker',
    'agronomist',
    'pest_agronomist',
    'scouter',
    'operator',
    'auditor',
  ].includes(role);
}

/**
 * Field Staff management (create a PIN-login scouter/operator, link a worker,
 * reset a PIN). Every allowed role is site-scoped: the field-staff routes limit
 * them to the sites they are assigned to (user_site_assignments).
 */
const FIELD_STAFF_MANAGE = new Set<UserRole>([
  'pest_agronomist',
  'agronomist',
  'operation_manager',
  'worker',
]);

export function canManageFieldStaff(role: UserRole): boolean {
  return FIELD_STAFF_MANAGE.has(role);
}

/** The team-leader flag is part of the workers list: worker + operation manager. */
export function canCreateHarvestTeamLeader(role: UserRole): boolean {
  return canManageManpowerRoster(role);
}
