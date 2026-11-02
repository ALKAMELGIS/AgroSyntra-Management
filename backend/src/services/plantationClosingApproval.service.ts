import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';
import { userCanApproveAsOperationManager } from './plantationOpeningApproval.service';
import { notifyUser } from './userNotify.service';

/**
 * Operation Manager approval of plantation closing rows.
 *
 * The site's Operation Manager writes closing rows live (approved). Workers and
 * agronomists may import, add and edit closing rows, but what they save is
 * pending until the site OM approves it. A rejected row carries a reason; the
 * submitter can correct it, which sends it back to pending. CEO and farm
 * manager are view-only.
 */

type Queryable = { query: typeof dbPool.query };

export type ClosingApprovalStatus = 'approved' | 'pending' | 'rejected';
export type ClosingWriteMode = 'live' | 'pending';

export interface ClosingUser {
  userId: string;
  role: string;
  email?: string;
}

export interface ClosingSheetState {
  id: string;
  site_id: string;
}

export interface ClosingRowState {
  id: string;
  closing_sheet_id: string;
  approval_status: ClosingApprovalStatus;
  submitted_by: string | null;
  site_id: string;
}

export const PLANTATION_WORKBOOK_PATH = '/admin/crop-history?tab=plantation-workbook';

/** Roles whose closing writes are held for the site OM's approval. */
const PROPOSER_ROLES = new Set(['worker', 'agronomist']);

function forbidden(message: string): AppError {
  return new AppError(message, 'FORBIDDEN', 403);
}

export async function loadClosingSheet(
  sheetId: string,
  orgId: string,
  db: Queryable = dbPool,
): Promise<ClosingSheetState> {
  const r = await db.query(
    `SELECT id, site_id FROM plantation_closing_sheets
     WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
    [sheetId, orgId],
  );
  const sheet = r.rows[0] as ClosingSheetState | undefined;
  if (!sheet) throw new AppError('Closing sheet not found', 'NOT_FOUND', 404);
  return sheet;
}

export async function loadClosingRow(
  id: string,
  orgId: string,
  db: Queryable = dbPool,
  opts: { forUpdate?: boolean } = {},
): Promise<ClosingRowState> {
  const r = await db.query(
    `SELECT pcr.id, pcr.closing_sheet_id, pcr.approval_status, pcr.submitted_by, pcs.site_id
     FROM plantation_closing_records pcr
     JOIN plantation_closing_sheets pcs ON pcs.id = pcr.closing_sheet_id
     WHERE pcr.id = $1 AND (pcr.organization_id IS NULL OR pcr.organization_id = $2)${
      opts.forUpdate ? ' FOR UPDATE OF pcr' : ''
    }`,
    [id, orgId],
  );
  const row = r.rows[0] as ClosingRowState | undefined;
  if (!row) throw new AppError('Closing record not found', 'NOT_FOUND', 404);
  return row;
}

/**
 * How the user's closing writes on this site land: live for the site OM,
 * pending for a worker or agronomist. Anyone else gets 403.
 */
export async function closingWriteModeFor(
  user: ClosingUser,
  siteId: string,
  db: Queryable = dbPool,
): Promise<ClosingWriteMode> {
  if (await userCanApproveAsOperationManager(user.userId, user.role, siteId, db)) return 'live';
  if (PROPOSER_ROLES.has(user.role)) return 'pending';
  throw forbidden('You can view closing sheets but not change them');
}

/** A worker/agronomist may edit only rows that are still pending or were rejected. */
export function assertProposerCanEdit(row: ClosingRowState): void {
  if (row.approval_status === 'approved') {
    throw forbidden('This closing row is approved — only the operation manager can change it');
  }
}

/** A worker/agronomist may delete only their own pending or rejected rows. */
export function assertProposerCanDelete(row: ClosingRowState, user: ClosingUser): void {
  if (row.approval_status === 'approved' || row.submitted_by !== user.userId) {
    throw forbidden('You can delete only your own closing rows that are not approved yet');
  }
}

export async function assertSiteOperationManager(
  user: ClosingUser,
  siteId: string,
  db: Queryable = dbPool,
): Promise<void> {
  const ok = await userCanApproveAsOperationManager(user.userId, user.role, siteId, db);
  if (!ok) {
    throw forbidden('Only an Operation Manager assigned to this site can approve closing rows');
  }
}

/** Active Operation Managers of the organization assigned to the site. */
export async function siteOperationManagerIds(siteId: string, orgId: string): Promise<string[]> {
  const r = await dbPool.query(
    `SELECT u.id FROM users u
     JOIN user_site_assignments usa ON usa.user_id = u.id
     WHERE usa.site_id = $1 AND u.role = 'operation_manager' AND u.is_active = true
       AND (u.organization_id IS NULL OR u.organization_id = $2)`,
    [siteId, orgId],
  );
  return [...new Set(r.rows.map((row: { id: string }) => row.id))];
}

/** Tell the site's OMs that closing rows are waiting (one notification per save). Never throws. */
export async function notifyClosingPending(
  siteId: string,
  orgId: string,
  sheetId: string,
  count: number,
): Promise<void> {
  if (count <= 0) return;
  try {
    const omIds = await siteOperationManagerIds(siteId, orgId);
    const message = `${count} plantation closing row${count === 1 ? '' : 's'} waiting for your approval.`;
    await Promise.all(
      omIds.map((uid) =>
        notifyUser(uid, {
          title: 'Plantation closing approval needed',
          message,
          severity: 'info',
          entityType: 'plantation_closing',
          entityId: sheetId,
          path: PLANTATION_WORKBOOK_PATH,
        }).catch(() => undefined),
      ),
    );
  } catch {
    // Notifications are best-effort; the save already succeeded.
  }
}

/** Tell the submitter their closing row was rejected. Never throws. */
export async function notifyClosingRejected(
  submitterId: string | null,
  rowId: string,
  reason: string,
): Promise<void> {
  if (!submitterId) return;
  try {
    await notifyUser(submitterId, {
      title: 'Plantation closing row rejected',
      message: `A plantation closing row you submitted was rejected. Reason: ${reason}`,
      severity: 'warning',
      entityType: 'plantation_closing',
      entityId: rowId,
      path: PLANTATION_WORKBOOK_PATH,
    });
  } catch {
    // best-effort
  }
}
