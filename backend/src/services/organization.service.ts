import crypto from 'crypto';
import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { UserRole } from '../models/user.model';
import { DEFAULT_ORGANIZATION_ID } from '../constants/organization';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function mapOrg(row: Record<string, unknown>): OrganizationRow {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    settings: (row.settings as Record<string, unknown>) || {},
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'org';
}

function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getOrganizationById(orgId: string): Promise<OrganizationRow> {
  const result = await dbPool.query(
    'SELECT * FROM organizations WHERE id = $1 AND is_active = true',
    [orgId],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError('Organization not found');
  }
  return mapOrg(result.rows[0]);
}

export async function listOrganizationMembers(orgId: string) {
  const result = await dbPool.query(
    `SELECT id, name, email, role, is_active, created_at
     FROM users
     WHERE organization_id = $1 AND deleted_at IS NULL
     ORDER BY name`,
    [orgId],
  );
  return result.rows;
}

export async function updateOrganization(
  orgId: string,
  data: { name?: string; settings?: Record<string, unknown> },
): Promise<OrganizationRow> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name) {
    updates.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.settings) {
    updates.push(`settings = COALESCE(settings, '{}'::jsonb) || $${idx++}::jsonb`);
    params.push(JSON.stringify(data.settings));
  }
  updates.push('updated_at = NOW()');
  params.push(orgId);

  const result = await dbPool.query(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (result.rowCount === 0) {
    throw new NotFoundError('Organization not found');
  }
  return mapOrg(result.rows[0]);
}

export async function isPublicRegistrationAllowed(): Promise<boolean> {
  const result = await dbPool.query(
    `SELECT settings FROM organizations WHERE id = $1 AND is_active = true`,
    [DEFAULT_ORGANIZATION_ID],
  );
  const settings = (result.rows[0]?.settings || {}) as Record<string, unknown>;
  if (settings.allow_registration === false) return false;
  return settings.allow_registration !== false;
}

export async function createOrganization(params: {
  name: string;
  slug?: string;
  settings?: Record<string, unknown>;
}): Promise<OrganizationRow> {
  let slug = params.slug || slugify(params.name);
  const base = slug;
  let attempt = 0;
  while (attempt < 20) {
    try {
      const result = await dbPool.query(
        `INSERT INTO organizations (name, slug, settings)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [params.name, slug, JSON.stringify(params.settings || { allow_registration: false })],
      );
      return mapOrg(result.rows[0]);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        attempt += 1;
        slug = `${base}-${attempt}`;
        continue;
      }
      throw err;
    }
  }
  throw new AppError('Could not generate unique organization slug', 'CONFLICT', 409);
}

export async function seedMinimalOrgStructure(orgId: string): Promise<{ countryId: string; siteId: string }> {
  const countryResult = await dbPool.query(
    `INSERT INTO countries (name, code, organization_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ['Main Country', 'MC', orgId],
  );
  const countryId = countryResult.rows[0].id as string;

  const siteResult = await dbPool.query(
    `INSERT INTO sites (country_id, name, organization_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [countryId, 'Main Site', orgId],
  );
  const siteId = siteResult.rows[0].id as string;

  return { countryId, siteId };
}

export async function createOrganizationInvite(params: {
  organizationId: string;
  email: string;
  role: UserRole;
  createdBy: string;
  expiresInDays?: number;
}): Promise<{ inviteToken: string; expiresAt: string }> {
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashInviteToken(inviteToken);
  const expiresAt = new Date(Date.now() + (params.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);

  await dbPool.query(
    `INSERT INTO organization_invites (organization_id, email, role, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.organizationId,
      params.email.toLowerCase(),
      params.role,
      tokenHash,
      expiresAt.toISOString(),
      params.createdBy,
    ],
  );

  return { inviteToken, expiresAt: expiresAt.toISOString() };
}

export interface ValidatedInvite {
  organizationId: string;
  email: string;
  role: UserRole;
  inviteId: string;
}

export async function validateInviteToken(token: string): Promise<ValidatedInvite> {
  const tokenHash = hashInviteToken(token);
  const result = await dbPool.query(
    `SELECT id, organization_id, email, role, expires_at, used_at
     FROM organization_invites
     WHERE token_hash = $1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Invalid or expired invite', 'FORBIDDEN', 403);
  }
  if (row.used_at) {
    throw new AppError('Invite has already been used', 'FORBIDDEN', 403);
  }
  if (new Date(row.expires_at) < new Date()) {
    throw new AppError('Invite has expired', 'FORBIDDEN', 403);
  }
  return {
    organizationId: row.organization_id,
    email: row.email,
    role: row.role as UserRole,
    inviteId: row.id,
  };
}

export async function markInviteUsed(inviteId: string, userId: string): Promise<void> {
  await dbPool.query(
    `UPDATE organization_invites SET used_at = NOW(), used_by = $2 WHERE id = $1`,
    [inviteId, userId],
  );
}

export async function listOrganizations(): Promise<OrganizationRow[]> {
  const result = await dbPool.query(
    'SELECT * FROM organizations ORDER BY created_at ASC',
  );
  return result.rows.map(mapOrg);
}

export async function getUserOrganizationId(userId: string): Promise<string | null> {
  const result = await dbPool.query(
    'SELECT organization_id FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId],
  );
  return result.rows[0]?.organization_id ?? null;
}
