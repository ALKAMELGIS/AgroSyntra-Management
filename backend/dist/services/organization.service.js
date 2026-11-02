"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrganizationById = getOrganizationById;
exports.listOrganizationMembers = listOrganizationMembers;
exports.updateOrganization = updateOrganization;
exports.isPublicRegistrationAllowed = isPublicRegistrationAllowed;
exports.createOrganization = createOrganization;
exports.seedMinimalOrgStructure = seedMinimalOrgStructure;
exports.createOrganizationInvite = createOrganizationInvite;
exports.validateInviteToken = validateInviteToken;
exports.markInviteUsed = markInviteUsed;
exports.listOrganizations = listOrganizations;
exports.getUserOrganizationId = getUserOrganizationId;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const organization_1 = require("../constants/organization");
function mapOrg(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        settings: row.settings || {},
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function slugify(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'org';
}
function hashInviteToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
async function getOrganizationById(orgId) {
    const result = await client_1.dbPool.query('SELECT * FROM organizations WHERE id = $1 AND is_active = true', [orgId]);
    if (result.rowCount === 0) {
        throw new errors_1.NotFoundError('Organization not found');
    }
    return mapOrg(result.rows[0]);
}
async function listOrganizationMembers(orgId) {
    const result = await client_1.dbPool.query(`SELECT id, name, email, role, is_active, created_at
     FROM users
     WHERE organization_id = $1 AND deleted_at IS NULL
     ORDER BY name`, [orgId]);
    return result.rows;
}
async function updateOrganization(orgId, data) {
    const updates = [];
    const params = [];
    let idx = 1;
    if (data.name) {
        updates.push(`name = $${idx++}`);
        params.push(data.name);
    }
    if (data.settings) {
        updates.push(`settings = $${idx++}`);
        params.push(JSON.stringify(data.settings));
    }
    updates.push('updated_at = NOW()');
    params.push(orgId);
    const result = await client_1.dbPool.query(`UPDATE organizations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rowCount === 0) {
        throw new errors_1.NotFoundError('Organization not found');
    }
    return mapOrg(result.rows[0]);
}
async function isPublicRegistrationAllowed() {
    const result = await client_1.dbPool.query(`SELECT settings FROM organizations WHERE id = $1 AND is_active = true`, [organization_1.DEFAULT_ORGANIZATION_ID]);
    const settings = (result.rows[0]?.settings || {});
    if (settings.allow_registration === false)
        return false;
    return settings.allow_registration !== false;
}
async function createOrganization(params) {
    let slug = params.slug || slugify(params.name);
    const base = slug;
    let attempt = 0;
    while (attempt < 20) {
        try {
            const result = await client_1.dbPool.query(`INSERT INTO organizations (name, slug, settings)
         VALUES ($1, $2, $3)
         RETURNING *`, [params.name, slug, JSON.stringify(params.settings || { allow_registration: false })]);
            return mapOrg(result.rows[0]);
        }
        catch (err) {
            const code = err.code;
            if (code === '23505') {
                attempt += 1;
                slug = `${base}-${attempt}`;
                continue;
            }
            throw err;
        }
    }
    throw new errors_1.AppError('Could not generate unique organization slug', 'CONFLICT', 409);
}
async function seedMinimalOrgStructure(orgId) {
    const countryResult = await client_1.dbPool.query(`INSERT INTO countries (name, code, organization_id)
     VALUES ($1, $2, $3)
     RETURNING id`, ['Main Country', 'MC', orgId]);
    const countryId = countryResult.rows[0].id;
    const siteResult = await client_1.dbPool.query(`INSERT INTO sites (country_id, name, organization_id)
     VALUES ($1, $2, $3)
     RETURNING id`, [countryId, 'Main Site', orgId]);
    const siteId = siteResult.rows[0].id;
    return { countryId, siteId };
}
async function createOrganizationInvite(params) {
    const inviteToken = crypto_1.default.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(inviteToken);
    const expiresAt = new Date(Date.now() + (params.expiresInDays ?? 14) * 24 * 60 * 60 * 1000);
    await client_1.dbPool.query(`INSERT INTO organization_invites (organization_id, email, role, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`, [
        params.organizationId,
        params.email.toLowerCase(),
        params.role,
        tokenHash,
        expiresAt.toISOString(),
        params.createdBy,
    ]);
    return { inviteToken, expiresAt: expiresAt.toISOString() };
}
async function validateInviteToken(token) {
    const tokenHash = hashInviteToken(token);
    const result = await client_1.dbPool.query(`SELECT id, organization_id, email, role, expires_at, used_at
     FROM organization_invites
     WHERE token_hash = $1`, [tokenHash]);
    const row = result.rows[0];
    if (!row) {
        throw new errors_1.AppError('Invalid or expired invite', 'FORBIDDEN', 403);
    }
    if (row.used_at) {
        throw new errors_1.AppError('Invite has already been used', 'FORBIDDEN', 403);
    }
    if (new Date(row.expires_at) < new Date()) {
        throw new errors_1.AppError('Invite has expired', 'FORBIDDEN', 403);
    }
    return {
        organizationId: row.organization_id,
        email: row.email,
        role: row.role,
        inviteId: row.id,
    };
}
async function markInviteUsed(inviteId, userId) {
    await client_1.dbPool.query(`UPDATE organization_invites SET used_at = NOW(), used_by = $2 WHERE id = $1`, [inviteId, userId]);
}
async function listOrganizations() {
    const result = await client_1.dbPool.query('SELECT * FROM organizations ORDER BY created_at ASC');
    return result.rows.map(mapOrg);
}
async function getUserOrganizationId(userId) {
    const result = await client_1.dbPool.query('SELECT organization_id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
    return result.rows[0]?.organization_id ?? null;
}
