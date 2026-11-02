/** Central view vs operate permissions by role. */

export const ROLE_LABELS = {
  ceo: 'CEO',
  farm_manager: 'Farm Manager',
  operation_manager: 'Operation Manager',
  agronomist: 'Agronomist',
  pest_agronomist: 'Pest Agronomist',
  scouter: 'Scouter',
  worker: 'Data Entry Worker',
  operator: 'Operator',
  intern_student: 'Intern Student',
  intern_teacher: 'Intern Teacher',
  auditor: 'Auditor',
};

const DATA_ENTRY_OPERATE = new Set(['worker', 'agronomist']);
const REPORTS_OPERATE = new Set(['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker', 'pest_agronomist']);
const USER_MGMT_OPERATE = new Set(['ceo', 'farm_manager', 'operation_manager']);
/** Tasks, shift schedule and the workers roster. Manpower days use the MANPOWER_* sets below. */
const WORKFORCE_OPERATE = new Set(['worker', 'agronomist']);
/** Mirrors backend/src/utils/roleAccess.ts. Typed days are always stored pending by the server. */
const MANPOWER_SUBMIT = new Set(['worker', 'operator']);
const MANPOWER_IMPORT = new Set(['worker']);
const MANPOWER_APPROVE = new Set(['operation_manager']);
const MANPOWER_ACTIVITY_CREATE = new Set(['worker', 'operation_manager']);
const MANPOWER_ROSTER = new Set(['worker', 'operation_manager']);
/** Manpower cost: who sees it, and who sets hourly rates (mirrors backend). */
export const MANPOWER_COST_VIEW_ROLES = ['worker', 'operation_manager', 'farm_manager', 'ceo'];
const MANPOWER_COST_VIEW = new Set(MANPOWER_COST_VIEW_ROLES);
const MANPOWER_RATE_EDIT = new Set(['worker', 'operation_manager']);
/** Roles whose site picker follows /assignments/my-access. Farm managers see sites in their zones plus direct sites. */
const SITE_SCOPED_ROLES = new Set(['farm_manager', 'operation_manager', 'worker', 'agronomist', 'pest_agronomist', 'scouter', 'operator', 'auditor']);
/** Mirrors backend roleAccess.ts: scouting reports are written by SC, PA, AG; CEO / FM / OM watch. */
const SCOUTING_OPERATE = new Set(['scouter', 'agronomist', 'pest_agronomist']);

/**
 * Roles that can open a data-entry page but not write to it (the API refuses
 * every write except from the worker and the agronomist).
 */
const DATA_ENTRY_VIEW_ONLY = new Set([
  'operation_manager', 'ceo', 'farm_manager', 'pest_agronomist',
  'scouter', 'operator', 'auditor', 'intern_student', 'intern_teacher',
]);
const IPM_VIEW_ONLY = new Set(['operation_manager', 'worker', 'ceo', 'farm_manager', 'scouter']);
const WORKFORCE_VIEW_ONLY = new Set(['operation_manager', 'ceo', 'farm_manager', 'pest_agronomist']);

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || '';
}

export function isSiteScopedRole(role) {
  return SITE_SCOPED_ROLES.has(role);
}

export function canOperateDataEntry(user) {
  return DATA_ENTRY_OPERATE.has(user?.role);
}

export function canOperateReports(user) {
  return REPORTS_OPERATE.has(user?.role);
}

export function canOperateUserManagement(user) {
  return USER_MGMT_OPERATE.has(user?.role);
}

export function canOperateWorkforce(user) {
  return WORKFORCE_OPERATE.has(user?.role);
}

export function canApproveManpowerRecords(user) {
  return MANPOWER_APPROVE.has(user?.role);
}

/** Operation Managers may edit the activity reference lookup only. */
export function canEditManpowerReference(user) {
  return user?.role === 'operation_manager';
}

export function canViewManpowerCost(user) {
  return MANPOWER_COST_VIEW.has(user?.role);
}

/** Data Entry Workers and Operation Managers set Casual / Permanent / personal hourly rates. */
export function canEditManpowerRates(user) {
  return MANPOWER_RATE_EDIT.has(user?.role);
}

/** Worker and operator type manpower days (Daily Activity Sheet). */
export function canSubmitManpower(user) {
  return MANPOWER_SUBMIT.has(user?.role);
}

/** Only the data entry worker imports manpower from Excel. */
export function canImportManpower(user) {
  return MANPOWER_IMPORT.has(user?.role);
}

/** Worker and operation manager add activity names / save import aliases. */
export function canCreateManpowerActivity(user) {
  return MANPOWER_ACTIVITY_CREATE.has(user?.role);
}

/** Worker and operation manager manage the manpower workers list and varieties. */
export function canManageManpowerRoster(user) {
  return MANPOWER_ROSTER.has(user?.role);
}

/**
 * Operation manager: any record. Worker / operator: only records they typed
 * themselves while still pending. Everyone else: none.
 */
export function canModifyManpowerRecord(user, record) {
  if (canApproveManpowerRecords(user)) return true;
  const userId = user?.id || user?.userId;
  return canSubmitManpower(user)
    && record?.approval_status === 'pending'
    && Boolean(userId)
    && record?.created_by === userId;
}

/**
 * Mirrors backend canImportCorrectManpowerRecord: an Excel re-import may change
 * hours only on the importer's own records that are pending or were stored by
 * their own import (approved, no submission). Others need a change request.
 */
export function canImportCorrectManpowerRecord(user, record) {
  if (!canImportManpower(user)) return false;
  const userId = user?.id || user?.userId;
  if (!userId || record?.created_by !== userId) return false;
  if (record?.approval_status === 'pending') return true;
  return record?.approval_status === 'approved' && !record?.submission_id;
}

export function canOperateScouting(user) {
  return SCOUTING_OPERATE.has(user?.role);
}

/** Roles that manage Field Staff (only at their assigned sites; enforced by the API). */
export const FIELD_STAFF_MANAGER_ROLES = ['pest_agronomist', 'agronomist', 'operation_manager', 'worker'];

export function canManageFieldStaff(user) {
  return FIELD_STAFF_MANAGER_ROLES.includes(user?.role);
}

/**
 * Add, edit, rename and delete fields and field types, change valve counts and
 * valves, and save field boundaries. The farm manager (no data entry) and the
 * CEO watch. Matches the API.
 */
const FIELD_EDIT = new Set(['operation_manager', 'worker']);

export function canEditFields(user) {
  return FIELD_EDIT.has(user?.role);
}

export function canManageSeasons(user) {
  return user?.role === 'farm_manager' || user?.role === 'operation_manager';
}

/*
 * Operations / admin write rights. Mirror the backend route guards; the API enforces them.
 */
/** Recipe create / edit / delete (approval stays with the operations manager). */
export const RECIPE_EDITOR_ROLES = ['worker', 'agronomist', 'operation_manager'];
/** Inventory items + stock movements, cost entries, GPS equipment / positions. */
export const OPS_STOCK_WRITER_ROLES = ['operation_manager', 'worker'];
/** Restore deleted Pump Room sheets (Recovery page). */
export const SHEET_RESTORE_ROLES = ['worker', 'agronomist', 'operation_manager'];
/** Agronomic threshold create / delete. */
export const THRESHOLD_EDITOR_ROLES = ['ceo', 'operation_manager'];
/** GIS layer writes (create, edit, delete, upload, sync, link, discover, test). */
export const GIS_EDITOR_ROLES = ['ceo', 'operation_manager'];
/** API keys, webhooks and API integrations. */
export const INTEGRATION_ADMIN_ROLES = ['ceo', 'operation_manager'];
/** Feature flags and the AI / OpenWeather keys. */
export const SYSTEM_ADMIN_ROLES = ['ceo'];
/** Training authoring (lessons, quizzes, questions, question bank, AI tools). */
export const TRAINING_AUTHOR_ROLES = ['intern_teacher'];

const hasRole = (roles) => (user) => roles.includes(user?.role);
export const canEditRecipes = hasRole(RECIPE_EDITOR_ROLES);
export const canWriteOpsStock = hasRole(OPS_STOCK_WRITER_ROLES);
export const canRestoreDeletedSheets = hasRole(SHEET_RESTORE_ROLES);
export const canEditThresholds = hasRole(THRESHOLD_EDITOR_ROLES);
export const canEditGis = hasRole(GIS_EDITOR_ROLES);
export const canManageIntegrations = hasRole(INTEGRATION_ADMIN_ROLES);
export const canManageSystemSettings = hasRole(SYSTEM_ADMIN_ROLES);
export const canAuthorTraining = hasRole(TRAINING_AUTHOR_ROLES);

/** Pages where roles may view but not submit changes. */
export const PAGE_KEYS = {
  DATA_ENTRY: 'dataEntry',
  IPM: 'ipm',
  SCOUTING: 'scouting',
  DASHBOARD: 'dashboard',
  DAILY_BRIEF: 'dailyBrief',
  WORKFORCE: 'workforce',
};

export function isReadOnlyOnPage(user, pageKey) {
  const role = user?.role;
  if (!role) return true;

  switch (pageKey) {
    case PAGE_KEYS.DATA_ENTRY:
      return DATA_ENTRY_VIEW_ONLY.has(role);
    case PAGE_KEYS.IPM:
      return IPM_VIEW_ONLY.has(role);
    case PAGE_KEYS.SCOUTING:
      return !canOperateScouting(user);
    case PAGE_KEYS.DASHBOARD:
      return role === 'worker';
    case PAGE_KEYS.DAILY_BRIEF:
      return role === 'worker';
    case PAGE_KEYS.WORKFORCE:
      return WORKFORCE_VIEW_ONLY.has(role);
    default: {
      const _exhaustive = pageKey;
      void _exhaustive;
      return false;
    }
  }
}

export function canCreateBumbleBeeInspection(user) {
  return user?.role === 'scouter';
}

export function canViewAllNavAreas(role) {
  return role === 'ceo' || role === 'farm_manager' || role === 'operation_manager' || role === 'agronomist';
}
