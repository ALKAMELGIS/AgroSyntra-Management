import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { dbPool } from '../db/client';
import { UserRole } from '../models/user.model';
import { AppError } from '../utils/errors';
import { canCreateHarvestTeamLeader } from '../utils/roleAccess';
import { AssignmentRepository } from '../repositories/assignment.repository';

const SALT_ROUNDS = 10;

export interface FieldStaffInput {
  name: string;
  employeeId: string;
  pin: string;
  role: 'scouter' | 'operator';
  siteId: string;
  organizationId: string;
  assignedBy: string;
}

const assignmentRepo = new AssignmentRepository();

function syntheticEmail(employeeId: string): string {
  return `${employeeId.trim().toLowerCase()}@field.internal`;
}

async function assertSiteInOrg(siteId: string, organizationId: string): Promise<void> {
  const result = await dbPool.query(
    'SELECT id FROM sites WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [siteId, organizationId],
  );
  if (result.rows.length === 0) {
    throw new AppError('Site not found in your organization', 'NOT_FOUND', 404);
  }
}

/**
 * `siteIds` limits results to those sites. An empty array means the caller has
 * no sites, so nothing is returned (it is never treated as "no filter").
 */
export async function listFieldStaff(organizationId: string, siteIds?: string[]) {
  if (siteIds && siteIds.length === 0) return [];
  let query = `
    SELECT u.id, u.name, u.email, u.role, u.employee_id, u.is_active, u.created_at,
           w.id AS worker_id, w.is_team_leader, w.site_id, s.name AS site_name
    FROM users u
    LEFT JOIN workers w ON w.user_id = u.id
    LEFT JOIN sites s ON s.id = w.site_id
    WHERE u.organization_id = $1
      AND u.role IN ('scouter', 'operator')
      AND u.deleted_at IS NULL
  `;
  const params: unknown[] = [organizationId];
  if (siteIds && siteIds.length > 0) {
    params.push(siteIds);
    query += ` AND w.site_id = ANY($${params.length}::uuid[])`;
  }
  query += ' ORDER BY u.name ASC';
  const result = await dbPool.query(query, params);
  return result.rows;
}

async function assignUserToSiteInTransaction(
  client: PoolClient,
  userId: string,
  siteId: string,
  assignedBy: string,
): Promise<void> {
  await client.query(
    `INSERT INTO user_site_assignments (user_id, site_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, site_id) DO NOTHING`,
    [userId, siteId, assignedBy],
  );
}

export async function listEligibleWorkers(
  organizationId: string,
  siteIds?: string[],
  siteIdFilter?: string,
) {
  if (siteIds && (siteIds.length === 0 || (siteIdFilter && !siteIds.includes(siteIdFilter)))) {
    return [];
  }
  let query = `
    SELECT w.id, w.employee_id, w.name, w.category, w.is_team_leader,
           w.site_id, s.name AS site_name,
           w.pin_hash IS NOT NULL AS has_pin,
           u.role AS linked_user_role
    FROM workers w
    LEFT JOIN sites s ON s.id = w.site_id
    LEFT JOIN users u ON u.id = w.user_id
    WHERE w.organization_id = $1
      AND w.is_active = true
      AND w.user_id IS NULL
  `;
  const params: unknown[] = [organizationId];
  if (siteIdFilter) {
    params.push(siteIdFilter);
    query += ` AND w.site_id = $${params.length}`;
  } else if (siteIds && siteIds.length > 0) {
    params.push(siteIds);
    query += ` AND w.site_id = ANY($${params.length}::uuid[])`;
  }
  query += ' ORDER BY w.name ASC';
  const result = await dbPool.query(query, params);
  return result.rows;
}

export interface LinkFieldStaffInput {
  workerId: string;
  role: 'scouter' | 'operator';
  pin: string;
  siteId?: string;
  organizationId: string;
  assignedBy: string;
  /** When set, the worker's current site and the target site must both be in this list. */
  allowedSiteIds?: string[];
}

const OTHER_SITE_ERROR = 'You can only manage field staff at your assigned sites';

export async function linkWorkerAsFieldStaff(input: LinkFieldStaffInput) {
  if (input.role !== 'scouter' && input.role !== 'operator') {
    throw new AppError('Invalid field staff role', 'VALIDATION', 400);
  }
  if (input.pin.length < 4) {
    throw new AppError('PIN must be at least 4 characters', 'VALIDATION', 400);
  }

  const workerRes = await dbPool.query(
    `SELECT w.id, w.employee_id, w.name, w.category, w.is_team_leader, w.site_id, w.user_id, w.organization_id
     FROM workers w
     WHERE w.id = $1 AND w.is_active = true`,
    [input.workerId],
  );
  const worker = workerRes.rows[0];
  if (!worker || worker.organization_id !== input.organizationId) {
    throw new AppError('Worker not found', 'NOT_FOUND', 404);
  }
  if (worker.user_id) {
    throw new AppError('Worker is already linked to an app account', 'CONFLICT', 409);
  }

  const resolvedSiteId = input.siteId || worker.site_id;
  if (!resolvedSiteId) {
    throw new AppError('Site is required — assign a site to this worker', 'VALIDATION', 400);
  }
  if (input.allowedSiteIds) {
    const workerSiteAllowed = !worker.site_id || input.allowedSiteIds.includes(worker.site_id);
    if (!workerSiteAllowed || !input.allowedSiteIds.includes(resolvedSiteId)) {
      throw new AppError(OTHER_SITE_ERROR, 'FORBIDDEN', 403);
    }
  }
  await assertSiteInOrg(resolvedSiteId, input.organizationId);

  const email = syntheticEmail(worker.employee_id);
  const existingEmail = await dbPool.query(
    'SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL',
    [email],
  );
  if (existingEmail.rows.length > 0) {
    throw new AppError('Employee ID already in use as an app account', 'CONFLICT', 409);
  }

  const pinHash = await bcrypt.hash(input.pin, SALT_ROUNDS);
  const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);
  const isTeamLeaderAfterLink = input.role === 'operator' ? true : worker.is_team_leader;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, name, role, organization_id, employee_id, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, employee_id, is_active, created_at`,
      [
        email,
        unusablePassword,
        worker.name.trim(),
        input.role,
        input.organizationId,
        worker.employee_id.trim(),
        pinHash,
      ],
    );
    const user = userRes.rows[0];

    const workerUpdateRes = await client.query(
      `UPDATE workers
       SET user_id = $1, pin_hash = $2,
           is_team_leader = CASE WHEN $3 = 'operator' THEN true ELSE is_team_leader END,
           site_id = COALESCE($4, site_id),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, employee_id, name, category, is_team_leader, site_id, user_id`,
      [user.id, pinHash, input.role, input.siteId || null, worker.id],
    );

    await assignUserToSiteInTransaction(client, user.id, resolvedSiteId, input.assignedBy);

    await client.query('COMMIT');
    return {
      user,
      worker: { ...workerUpdateRes.rows[0], linked_user_role: input.role, is_team_leader: isTeamLeaderAfterLink },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createFieldStaff(input: FieldStaffInput) {
  if (input.role !== 'scouter' && input.role !== 'operator') {
    throw new AppError('Invalid field staff role', 'VALIDATION', 400);
  }
  if (input.pin.length < 4) {
    throw new AppError('PIN must be at least 4 characters', 'VALIDATION', 400);
  }

  await assertSiteInOrg(input.siteId, input.organizationId);

  const email = syntheticEmail(input.employeeId);
  const existingEmail = await dbPool.query(
    'SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL',
    [email],
  );
  if (existingEmail.rows.length > 0) {
    throw new AppError('Employee ID already in use', 'CONFLICT', 409);
  }

  const existingWorker = await dbPool.query(
    'SELECT id FROM workers WHERE employee_id = $1',
    [input.employeeId.trim()],
  );
  if (existingWorker.rows.length > 0) {
    throw new AppError('Employee ID already registered as a worker', 'CONFLICT', 409);
  }

  const pinHash = await bcrypt.hash(input.pin, SALT_ROUNDS);
  const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);
  const isTeamLeader = input.role === 'operator';

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO users (email, password_hash, name, role, organization_id, employee_id, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, employee_id, is_active, created_at`,
      [
        email,
        unusablePassword,
        input.name.trim(),
        input.role,
        input.organizationId,
        input.employeeId.trim(),
        pinHash,
      ],
    );
    const user = userRes.rows[0];

    const workerRes = await client.query(
      `INSERT INTO workers (employee_id, name, category, is_team_leader, site_id, organization_id, user_id, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, employee_id, name, is_team_leader, site_id`,
      [
        input.employeeId.trim(),
        input.name.trim(),
        input.role === 'operator' ? 'Operator' : 'Scouter',
        isTeamLeader,
        input.siteId,
        input.organizationId,
        user.id,
        pinHash,
      ],
    );

    await assignUserToSiteInTransaction(client, user.id, input.siteId, input.assignedBy);

    await client.query('COMMIT');
    return { user, worker: workerRes.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sites a field-staff account belongs to: the linked worker's site (the same
 * site the Field Staff list shows), or, when there is no worker row / site,
 * the account's own site assignments. Returns null when the account is not a
 * field-staff user in this organization.
 */
export async function getFieldStaffSiteIds(
  userId: string,
  organizationId: string,
): Promise<string[] | null> {
  const result = await dbPool.query(
    `SELECT u.id, w.site_id AS worker_site_id,
            ARRAY(SELECT usa.site_id FROM user_site_assignments usa WHERE usa.user_id = u.id) AS assigned_site_ids
     FROM users u
     LEFT JOIN workers w ON w.user_id = u.id
     WHERE u.id = $1 AND u.organization_id = $2
       AND u.role IN ('scouter', 'operator') AND u.deleted_at IS NULL`,
    [userId, organizationId],
  );
  if (result.rows.length === 0) return null;
  const workerSites = result.rows
    .map((r) => r.worker_site_id as string | null)
    .filter((s): s is string => Boolean(s));
  if (workerSites.length > 0) return Array.from(new Set(workerSites));
  return ((result.rows[0].assigned_site_ids as string[] | null) ?? []).filter(Boolean);
}

export async function updateFieldStaffPin(
  userId: string,
  pin: string,
  organizationId: string,
  allowedSiteIds?: string[],
) {
  if (pin.length < 4) {
    throw new AppError('PIN must be at least 4 characters', 'VALIDATION', 400);
  }
  const staffSiteIds = await getFieldStaffSiteIds(userId, organizationId);
  if (!staffSiteIds) {
    throw new AppError('Field staff user not found', 'NOT_FOUND', 404);
  }
  if (allowedSiteIds && !staffSiteIds.some((siteId) => allowedSiteIds.includes(siteId))) {
    throw new AppError(OTHER_SITE_ERROR, 'FORBIDDEN', 403);
  }
  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

  await dbPool.query('UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2', [pinHash, userId]);
  await dbPool.query(
    'UPDATE workers SET pin_hash = $1, updated_at = NOW() WHERE user_id = $2',
    [pinHash, userId],
  );
}

export async function getLinkedWorkerByEmployeeId(employeeId: string) {
  const result = await dbPool.query(
    `SELECT w.*, u.id AS linked_user_id, u.role AS linked_user_role, u.is_active AS user_is_active,
            u.organization_id
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.employee_id = $1 AND w.is_active = true`,
    [employeeId.trim()],
  );
  return result.rows[0] || null;
}

export async function assertHarvestTeamLeaderCreate(
  role: UserRole,
  isTeamLeader: boolean,
  linkedUserId?: string | null,
) {
  if (!isTeamLeader) return;
  if (linkedUserId) {
    throw new AppError('Cannot create a team leader with a linked app account via this flow', 'FORBIDDEN', 403);
  }
  if (!canCreateHarvestTeamLeader(role)) {
    throw new AppError(
      'Only data entry workers and Operation Managers may create harvest/maintenance team leaders',
      'FORBIDDEN',
      403,
    );
  }
}

export async function assertWorkerUpdateAllowed(
  workerId: string,
  updates: { isTeamLeader?: boolean },
) {
  const result = await dbPool.query(
    `SELECT w.is_team_leader, w.user_id, u.role
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = $1`,
    [workerId],
  );
  const row = result.rows[0];
  if (!row) return;

  if (row.role === 'operator' && updates.isTeamLeader === false) {
    throw new AppError('Operators must remain team leaders', 'FORBIDDEN', 403);
  }
  if (!row.user_id && updates.isTeamLeader === false && row.is_team_leader) {
    throw new AppError('Harvest team leaders must remain team leaders', 'FORBIDDEN', 403);
  }
}
