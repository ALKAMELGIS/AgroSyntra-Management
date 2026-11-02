const DEFAULT_ADMIN_EMAILS = ['abdullah@elite.com'];

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function getIpmAdminEmails() {
  const fromEnv = process.env.REACT_APP_IPM_ADMIN_EMAILS;
  if (!fromEnv) return DEFAULT_ADMIN_EMAILS.map(normalizeEmail);
  return fromEnv.split(',').map(normalizeEmail).filter(Boolean);
}

export function isIpmAdminEmail(email) {
  if (!email) return false;
  return getIpmAdminEmails().includes(normalizeEmail(email));
}

export function isIpmAdmin(user) {
  return isIpmAdminEmail(user?.email);
}

export function canCreatePesticideApplication(user) {
  if (!user?.role) return false;
  return isIpmAdmin(user) || user.role === 'pest_agronomist' || user.role === 'operator';
}

export function canApprovePesticideApplication(user) {
  if (!user?.role) return false;
  return isIpmAdmin(user) || user.role === 'pest_agronomist';
}

export function canRequestApplicationChange(user) {
  return user?.role === 'pest_agronomist';
}

export function canDirectEditDeleteApplication(user) {
  return isIpmAdmin(user);
}

export function canReviewChangeRequests(user) {
  if (!user?.role) return false;
  return user.role === 'auditor' || isIpmAdmin(user);
}

export function canManagePppMsds(user) {
  return canReviewChangeRequests(user);
}

/**
 * Pest catalog and product catalog (products, bio products, site product lists
 * and prices, crop-specific PHI): workers, the pest agronomist and the IPM admin
 * edit; everyone else watches. MSDS files stay with the auditor (canManagePppMsds).
 * Mirrors canEditIpmCatalog in backend/src/utils/ipmAccess.ts.
 */
export function canEditIpmCatalog(user) {
  if (!user) return false;
  return user.role === 'worker' || user.role === 'pest_agronomist' || isIpmAdmin(user);
}

export const ENTITY_PESTICIDE_APPLICATION ='pesticide_application';
export const ENTITY_BUMBLE_BEE_BOX_INSPECTION = 'bumble_bee_box_inspection';

export function canRequestInspectionChange(user) {
  return user?.role === 'scouter';
}

export function canReviewInspectionChangeRequests(user) {
  if (!user?.role) return false;
  return user.role === 'pest_agronomist' || isIpmAdmin(user);
}

/** Only the pest agronomist or the IPM admin may review scouting reports (reviewed / resolved / send back). */
export function canReviewScouting(user) {
  if (!user) return false;
  return user.role === 'pest_agronomist' || isIpmAdmin(user);
}

// ─── Biological control record (mirrors backend/src/utils/ipmAccess.ts) ───

/** Pest agronomist or IPM admin: live edits, setup, catalog, approvals. */
export function canManageBio(user) {
  if (!user) return false;
  return user.role === 'pest_agronomist' || isIpmAdmin(user);
}

/** Scouter: weekly cells only, saved as pending until approved. */
export function canProposeBioCells(user) {
  return user?.role === 'scouter' && !canManageBio(user);
}

/** Excel import: bio manager (approved) or data-entry worker (pending). */
export function canImportBio(user) {
  return canManageBio(user) || user?.role === 'worker';
}

/** Scouter or worker: may ask for a field table to be deleted (change request). */
export function canRequestBioDelete(user) {
  return !canManageBio(user) && (user?.role === 'scouter' || user?.role === 'worker');
}

/** Statuses in which the scouter who wrote a report may still edit it. */
export const SCOUTING_OWNER_EDITABLE_STATUSES = ['submitted', 'returned'];

// ─── Bumble bees (mirrors backend/src/utils/ipmAccess.ts) ───

/** Pest agronomist or IPM admin: bumble-bee changes go live; they approve the scouter's. */
export function canManageBumbleBees(user) {
  if (!user) return false;
  return user.role === 'pest_agronomist' || isIpmAdmin(user);
}

/**
 * Scouter: bumble-bee changes (deployments, boxes on hand, orders, inspection
 * edits and deletes) are sent for approval. Filing a new inspection is direct.
 */
export function canProposeBumbleBees(user) {
  return user?.role === 'scouter' && !canManageBumbleBees(user);
}

export function autoApprovedOnCreate(user) {
  return isIpmAdmin(user) || user?.role === 'pest_agronomist';
}
