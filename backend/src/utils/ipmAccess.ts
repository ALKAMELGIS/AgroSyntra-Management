import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '../models/user.model';
import { AppError } from './errors';

export interface IpmActor {
  userId: string;
  email: string;
  role: UserRole;
}

const DEFAULT_ADMIN_EMAILS = ['abdullah@elite.com'];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getIpmAdminEmails(): string[] {
  const fromEnv = process.env.IPM_ADMIN_EMAILS;
  if (!fromEnv) return DEFAULT_ADMIN_EMAILS.map(normalizeEmail);
  return fromEnv.split(',').map((e) => normalizeEmail(e)).filter(Boolean);
}

export function isIpmAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getIpmAdminEmails().includes(normalizeEmail(email));
}

export function isIpmAdmin(actor: IpmActor): boolean {
  return isIpmAdminEmail(actor.email);
}

export function canCreatePesticideApplication(actor: IpmActor): boolean {
  return isIpmAdmin(actor) || actor.role === 'pest_agronomist' || actor.role === 'operator';
}

export function canApprovePesticideApplication(actor: IpmActor): boolean {
  return isIpmAdmin(actor) || actor.role === 'pest_agronomist';
}

export function canRequestApplicationChange(actor: IpmActor): boolean {
  return actor.role === 'pest_agronomist';
}

export function canDirectEditDeleteApplication(actor: IpmActor): boolean {
  return isIpmAdmin(actor);
}

export function canReviewChangeRequests(actor: IpmActor): boolean {
  return actor.role === 'auditor' || isIpmAdmin(actor);
}

export function canManagePppMsds(actor: IpmActor): boolean {
  return canReviewChangeRequests(actor);
}

export function assertCanManagePppMsds(actor: IpmActor): void {
  if (!canManagePppMsds(actor)) {
    throw new AppError('Only auditors may import or delete PPP MSDS files', 'FORBIDDEN', 403);
  }
}

// ─── Pest catalog and product catalog ───────────────────────────

/**
 * Pest catalog and product catalog (pesticide products, bio products, site
 * product lists and prices, crop-specific PHI): only workers, the pest
 * agronomist and the IPM admin edit. Everyone else watches. No approval step.
 * MSDS files are separate and stay with the auditor (canManagePppMsds).
 */
export function canEditIpmCatalog(actor: Pick<IpmActor, 'email' | 'role'> | null | undefined): boolean {
  if (!actor) return false;
  return actor.role === 'worker' || actor.role === 'pest_agronomist' || isIpmAdminEmail(actor.email);
}

export function assertCanEditIpmCatalog(actor: Pick<IpmActor, 'email' | 'role'> | null | undefined): void {
  if (!canEditIpmCatalog(actor)) {
    throw new AppError(
      'Only workers and the pest agronomist may change the pest and product catalogs',
      'FORBIDDEN',
      403,
    );
  }
}

/** Express guard for catalog write routes. Use after `auth`. */
export function requireIpmCatalogEditor(
  req: Request & { user?: { email: string; role: UserRole } },
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
    return;
  }
  try {
    assertCanEditIpmCatalog(req.user);
    next();
  } catch (error) {
    next(error);
  }
}

export const ENTITY_PESTICIDE_APPLICATION ='pesticide_application';
export const ENTITY_BUMBLE_BEE_BOX_INSPECTION = 'bumble_bee_box_inspection';
export const ENTITY_BUMBLE_BEE_DEPLOYMENT = 'bumble_bee_deployment';
export const ENTITY_BUMBLE_BEE_INVENTORY = 'bumble_bee_inventory';
export const ENTITY_BUMBLE_BEE_ORDER = 'bumble_bee_order';

export function canRequestInspectionChange(actor: IpmActor): boolean {
  return actor.role === 'scouter';
}

// ─── Bumble bees ─────────────────────────────────────────────────

/** Pest agronomist or IPM admin: bumble-bee changes go live, and they approve the scouter's. */
export function canManageBumbleBees(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return actor.role === 'pest_agronomist' || isIpmAdminEmail(actor.email);
}

/** Scouter: bumble-bee changes (other than filing a new inspection) wait for approval. */
export function canProposeBumbleBees(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return actor.role === 'scouter' && !canManageBumbleBees(actor);
}

export type BumbleBeeWriteMode = 'live' | 'propose';

/** How `actor`'s bumble-bee write is handled; everyone else only watches (403). */
export function resolveBumbleBeeWriteMode(actor: Pick<IpmActor, 'email' | 'role'>): BumbleBeeWriteMode {
  if (canManageBumbleBees(actor)) return 'live';
  if (canProposeBumbleBees(actor)) return 'propose';
  throw new AppError(
    'Only the pest agronomist and scouters may change bumble bee records',
    'FORBIDDEN',
    403,
  );
}

export function canReviewInspectionChangeRequests(actor: IpmActor): boolean {
  return actor.role === 'pest_agronomist' || isIpmAdmin(actor);
}

/** Only the pest agronomist or the IPM admin may mark scouting reports reviewed/resolved or send them back. */
export function canReviewScouting(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return actor.role === 'pest_agronomist' || isIpmAdminEmail(actor.email);
}

// ─── Biological control record ───────────────────────────────────

/**
 * The "bio manager": pest agronomist or IPM admin. Writes live (approved) cells,
 * owns setup, catalog, UOM and deletes, and approves or rejects pending values.
 */
export function canManageBio(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return actor.role === 'pest_agronomist' || isIpmAdminEmail(actor.email);
}

/** Scouters may type weekly cells; what they enter waits for approval. */
export function canProposeBioCells(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return actor.role === 'scouter' && !canManageBio(actor);
}

/** Excel import: the bio manager (approved values) or a data-entry worker (pending values). */
export function canImportBio(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return canManageBio(actor) || actor.role === 'worker';
}

/** Scouters and workers ask for a field table to be deleted through a change request. */
export function canRequestBioDelete(actor: Pick<IpmActor, 'email' | 'role'>): boolean {
  return !canManageBio(actor) && (actor.role === 'scouter' || actor.role === 'worker');
}

/** Statuses in which the scouter who wrote a report may still edit it. */
export const SCOUTING_OWNER_EDITABLE_STATUSES = ['submitted', 'returned'];

/**
 * Roles that may edit (and delete) any scouting report in their organization,
 * whatever its status. CEO, farm manager and operation manager only watch.
 */
const SCOUTING_ELEVATED_EDIT_ROLES: ReadonlyArray<string> = ['agronomist', 'pest_agronomist'];

/** Who may delete a scouting report: the pest agronomist and the agronomist. */
export function canDeleteScoutingReport(actor: Pick<IpmActor, 'role'>): boolean {
  return SCOUTING_ELEVATED_EDIT_ROLES.includes(actor.role);
}

/**
 * Whether `actor` may edit `report` (fields or photos). The pest agronomist and
 * the agronomist may edit any report; a scouter only their own report while it
 * is submitted or sent back. Nobody else edits.
 */
export function canEditScoutingReport(
  actor: Pick<IpmActor, 'userId' | 'email' | 'role'>,
  report: { scout_user_id?: string | null; status?: string | null },
): boolean {
  if (SCOUTING_ELEVATED_EDIT_ROLES.includes(actor.role)) return true;
  return actor.role === 'scouter'
    && report.scout_user_id === actor.userId
    && SCOUTING_OWNER_EDITABLE_STATUSES.includes(String(report.status || 'submitted'));
}

export function assertCanRequestInspectionChange(actor: IpmActor): void {
  if (!canRequestInspectionChange(actor)) {
    throw new AppError('Only scouters may request bumble bee inspection changes', 'FORBIDDEN', 403);
  }
}

export type InitialApproval = {
  status: 'pending' | 'approved';
  authorizedBy: string | null;
};

export function resolveInitialApproval(actor: IpmActor): InitialApproval {
  if (isIpmAdmin(actor) || actor.role === 'pest_agronomist') {
    return { status: 'approved', authorizedBy: actor.userId };
  }
  return { status: 'pending', authorizedBy: null };
}

export function assertCanCreateApplication(actor: IpmActor): void {
  if (!canCreatePesticideApplication(actor)) {
    throw new AppError('Only operators and pest agronomists may create pesticide applications', 'FORBIDDEN', 403);
  }
}

export function assertCanApproveApplication(actor: IpmActor): void {
  if (!canApprovePesticideApplication(actor)) {
    throw new AppError('Only pest agronomists may approve pesticide applications', 'FORBIDDEN', 403);
  }
}

export function assertCanDirectEditDelete(actor: IpmActor): void {
  if (!canDirectEditDeleteApplication(actor)) {
    throw new AppError(
      'Direct edits and deletes require a change request. Submit one for auditor review.',
      'FORBIDDEN',
      403,
    );
  }
}

export function assertCanRequestChange(actor: IpmActor): void {
  if (!canRequestApplicationChange(actor)) {
    throw new AppError('Only pest agronomists may request application changes', 'FORBIDDEN', 403);
  }
}

export function assertCanReviewChanges(actor: IpmActor): void {
  if (!canReviewChangeRequests(actor)) {
    throw new AppError('Only auditors may review change requests', 'FORBIDDEN', 403);
  }
}

export function toIpmActor(user: { userId: string; email: string; role: UserRole }): IpmActor {
  return { userId: user.userId, email: user.email, role: user.role };
}
