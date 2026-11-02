import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';
import { logAuditEvent } from './auditLog.service';

/**
 * Operation Manager approval of plantation opening rows.
 *
 * The approval columns are named farm_manager_* for historical reasons, but only
 * an Operation Manager assigned to the row's site can approve (or undo). An
 * approved row is locked: it cannot be edited or deleted until the approval is
 * undone, and undoing requires a reason. Both events go to the audit log.
 */

export const APPROVED_LOCK_MESSAGE = 'This row is approved — undo the approval first';

type Queryable = { query: typeof dbPool.query };

export interface OpeningApprovalUser {
  userId: string;
  role: string;
  email?: string;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

interface OpeningRowState {
  id: string;
  site_id: string;
  farm_manager_approved: boolean | null;
}

export async function userCanApproveAsOperationManager(
  userId: string,
  role: string,
  siteId: string,
  db: Queryable = dbPool,
): Promise<boolean> {
  if (role !== 'operation_manager') return false;
  const r = await db.query(
    `SELECT 1 FROM user_site_assignments WHERE user_id = $1 AND site_id = $2 LIMIT 1`,
    [userId, siteId],
  );
  return r.rowCount !== null && r.rowCount > 0;
}

async function loadOpeningRow(
  id: string,
  orgId: string,
  db: Queryable,
  opts: { siteId?: string; forUpdate?: boolean } = {},
): Promise<OpeningRowState | null> {
  const params: unknown[] = [id, orgId];
  let siteClause = '';
  if (opts.siteId) {
    params.push(opts.siteId);
    siteClause = ' AND site_id = $3';
  }
  const r = await db.query(
    `SELECT id, site_id, farm_manager_approved FROM plantation_opening_records
     WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)${siteClause}${
      opts.forUpdate ? ' FOR UPDATE' : ''
    }`,
    params,
  );
  return (r.rows[0] as OpeningRowState | undefined) ?? null;
}

/**
 * Throws 409 when the opening row is approved. A missing row is left to the
 * caller (existing edit/delete behaviour is a silent no-op for unknown ids).
 * Pass forUpdate inside a transaction to hold the row until the write lands.
 */
export async function assertOpeningRowEditable(
  id: string,
  orgId: string,
  db: Queryable = dbPool,
  opts: { siteId?: string; forUpdate?: boolean } = {},
): Promise<void> {
  const row = await loadOpeningRow(id, orgId, db, opts);
  if (row?.farm_manager_approved) {
    throw new AppError(APPROVED_LOCK_MESSAGE, 'CONFLICT', 409);
  }
}

export async function approveOpeningRecord(
  id: string,
  orgId: string,
  user: OpeningApprovalUser,
  meta: RequestMeta = {},
): Promise<{ alreadyApproved: true } | { farmManagerName: string }> {
  const row = await loadOpeningRow(id, orgId, dbPool);
  if (!row) {
    throw new AppError('Record not found', 'NOT_FOUND', 404);
  }
  if (row.farm_manager_approved) {
    return { alreadyApproved: true };
  }

  const allowed = await userCanApproveAsOperationManager(user.userId, user.role, row.site_id);
  if (!allowed) {
    throw new AppError('Only an Operation Manager assigned to this site can approve', 'FORBIDDEN', 403);
  }

  const nameRow = await dbPool.query(`SELECT name FROM users WHERE id = $1`, [user.userId]);
  const omName = (nameRow.rows[0]?.name as string) || user.email || 'Operation Manager';
  await dbPool.query(
    `UPDATE plantation_opening_records SET
      farm_manager_approved = TRUE,
      farm_manager_approved_at = NOW(),
      farm_manager_approved_by = $1,
      farm_manager_name = $2,
      farm_manager_date = CURRENT_DATE,
      updated_at = NOW()
     WHERE id = $3`,
    [user.userId, omName, id],
  );

  await logAuditEvent({
    userId: user.userId,
    action: 'UPDATE',
    entity: 'plantation_opening',
    entityId: id,
    changes: { farm_manager_approved: { from: false, to: true } },
    metadata: { type: 'plantation_opening_approved', siteId: row.site_id, approverName: omName },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { farmManagerName: omName };
}

export async function revokeOpeningApproval(
  id: string,
  orgId: string,
  user: OpeningApprovalUser,
  reason: string,
  meta: RequestMeta = {},
): Promise<void> {
  const trimmed = (reason ?? '').trim();
  if (!trimmed) {
    throw new AppError('A reason is required to undo an approval', 'VALIDATION_ERROR', 400);
  }

  const row = await loadOpeningRow(id, orgId, dbPool);
  if (!row) {
    throw new AppError('Record not found', 'NOT_FOUND', 404);
  }

  const allowed = await userCanApproveAsOperationManager(user.userId, user.role, row.site_id);
  if (!allowed) {
    throw new AppError('Only an Operation Manager assigned to this site can undo the approval', 'FORBIDDEN', 403);
  }

  if (!row.farm_manager_approved) {
    throw new AppError('This row is not approved', 'CONFLICT', 409);
  }

  const updated = await dbPool.query(
    `UPDATE plantation_opening_records SET
      farm_manager_approved = FALSE,
      farm_manager_approved_at = NULL,
      farm_manager_approved_by = NULL,
      farm_manager_name = NULL,
      farm_manager_date = NULL,
      updated_at = NOW()
     WHERE id = $1 AND farm_manager_approved = TRUE
     RETURNING id`,
    [id],
  );
  if (!updated.rowCount) {
    throw new AppError('This row is not approved', 'CONFLICT', 409);
  }

  await logAuditEvent({
    userId: user.userId,
    action: 'UPDATE',
    entity: 'plantation_opening',
    entityId: id,
    changes: { farm_manager_approved: { from: true, to: false } },
    metadata: { type: 'plantation_opening_approval_revoked', siteId: row.site_id, reason: trimmed },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}
