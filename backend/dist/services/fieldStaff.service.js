"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFieldStaff = listFieldStaff;
exports.listEligibleWorkers = listEligibleWorkers;
exports.linkWorkerAsFieldStaff = linkWorkerAsFieldStaff;
exports.createFieldStaff = createFieldStaff;
exports.updateFieldStaffPin = updateFieldStaffPin;
exports.getLinkedWorkerByEmployeeId = getLinkedWorkerByEmployeeId;
exports.assertHarvestTeamLeaderCreate = assertHarvestTeamLeaderCreate;
exports.assertWorkerUpdateAllowed = assertWorkerUpdateAllowed;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const assignment_repository_1 = require("../repositories/assignment.repository");
const SALT_ROUNDS = 10;
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
function syntheticEmail(employeeId) {
    return `${employeeId.trim().toLowerCase()}@field.internal`;
}
async function assertSiteInOrg(siteId, organizationId) {
    const result = await client_1.dbPool.query('SELECT id FROM sites WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [siteId, organizationId]);
    if (result.rows.length === 0) {
        throw new errors_1.AppError('Site not found in your organization', 'NOT_FOUND', 404);
    }
}
async function listFieldStaff(organizationId, siteIds) {
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
    const params = [organizationId];
    if (siteIds && siteIds.length > 0) {
        params.push(siteIds);
        query += ` AND w.site_id = ANY($${params.length}::uuid[])`;
    }
    query += ' ORDER BY u.name ASC';
    const result = await client_1.dbPool.query(query, params);
    return result.rows;
}
async function assignUserToSiteInTransaction(client, userId, siteId, assignedBy) {
    await client.query(`INSERT INTO user_site_assignments (user_id, site_id, assigned_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, site_id) DO NOTHING`, [userId, siteId, assignedBy]);
}
async function listEligibleWorkers(organizationId, siteIds, siteIdFilter) {
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
    const params = [organizationId];
    if (siteIdFilter) {
        params.push(siteIdFilter);
        query += ` AND w.site_id = $${params.length}`;
    }
    else if (siteIds && siteIds.length > 0) {
        params.push(siteIds);
        query += ` AND w.site_id = ANY($${params.length}::uuid[])`;
    }
    query += ' ORDER BY w.name ASC';
    const result = await client_1.dbPool.query(query, params);
    return result.rows;
}
async function linkWorkerAsFieldStaff(input) {
    if (input.role !== 'scouter' && input.role !== 'operator') {
        throw new errors_1.AppError('Invalid field staff role', 'VALIDATION', 400);
    }
    if (input.pin.length < 4) {
        throw new errors_1.AppError('PIN must be at least 4 characters', 'VALIDATION', 400);
    }
    const workerRes = await client_1.dbPool.query(`SELECT w.id, w.employee_id, w.name, w.category, w.is_team_leader, w.site_id, w.user_id, w.organization_id
     FROM workers w
     WHERE w.id = $1 AND w.is_active = true`, [input.workerId]);
    const worker = workerRes.rows[0];
    if (!worker || worker.organization_id !== input.organizationId) {
        throw new errors_1.AppError('Worker not found', 'NOT_FOUND', 404);
    }
    if (worker.user_id) {
        throw new errors_1.AppError('Worker is already linked to an app account', 'CONFLICT', 409);
    }
    const resolvedSiteId = input.siteId || worker.site_id;
    if (!resolvedSiteId) {
        throw new errors_1.AppError('Site is required — assign a site to this worker', 'VALIDATION', 400);
    }
    await assertSiteInOrg(resolvedSiteId, input.organizationId);
    const email = syntheticEmail(worker.employee_id);
    const existingEmail = await client_1.dbPool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL', [email]);
    if (existingEmail.rows.length > 0) {
        throw new errors_1.AppError('Employee ID already in use as an app account', 'CONFLICT', 409);
    }
    const pinHash = await bcryptjs_1.default.hash(input.pin, SALT_ROUNDS);
    const unusablePassword = await bcryptjs_1.default.hash(crypto_1.default.randomBytes(32).toString('hex'), SALT_ROUNDS);
    const isTeamLeaderAfterLink = input.role === 'operator' ? true : worker.is_team_leader;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(`INSERT INTO users (email, password_hash, name, role, organization_id, employee_id, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, employee_id, is_active, created_at`, [
            email,
            unusablePassword,
            worker.name.trim(),
            input.role,
            input.organizationId,
            worker.employee_id.trim(),
            pinHash,
        ]);
        const user = userRes.rows[0];
        const workerUpdateRes = await client.query(`UPDATE workers
       SET user_id = $1, pin_hash = $2,
           is_team_leader = CASE WHEN $3 = 'operator' THEN true ELSE is_team_leader END,
           site_id = COALESCE($4, site_id),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, employee_id, name, category, is_team_leader, site_id, user_id`, [user.id, pinHash, input.role, input.siteId || null, worker.id]);
        await assignUserToSiteInTransaction(client, user.id, resolvedSiteId, input.assignedBy);
        await client.query('COMMIT');
        return {
            user,
            worker: { ...workerUpdateRes.rows[0], linked_user_role: input.role, is_team_leader: isTeamLeaderAfterLink },
        };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function createFieldStaff(input) {
    if (input.role !== 'scouter' && input.role !== 'operator') {
        throw new errors_1.AppError('Invalid field staff role', 'VALIDATION', 400);
    }
    if (input.pin.length < 4) {
        throw new errors_1.AppError('PIN must be at least 4 characters', 'VALIDATION', 400);
    }
    await assertSiteInOrg(input.siteId, input.organizationId);
    const email = syntheticEmail(input.employeeId);
    const existingEmail = await client_1.dbPool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL', [email]);
    if (existingEmail.rows.length > 0) {
        throw new errors_1.AppError('Employee ID already in use', 'CONFLICT', 409);
    }
    const existingWorker = await client_1.dbPool.query('SELECT id FROM workers WHERE employee_id = $1', [input.employeeId.trim()]);
    if (existingWorker.rows.length > 0) {
        throw new errors_1.AppError('Employee ID already registered as a worker', 'CONFLICT', 409);
    }
    const pinHash = await bcryptjs_1.default.hash(input.pin, SALT_ROUNDS);
    const unusablePassword = await bcryptjs_1.default.hash(crypto_1.default.randomBytes(32).toString('hex'), SALT_ROUNDS);
    const isTeamLeader = input.role === 'operator';
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(`INSERT INTO users (email, password_hash, name, role, organization_id, employee_id, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, employee_id, is_active, created_at`, [
            email,
            unusablePassword,
            input.name.trim(),
            input.role,
            input.organizationId,
            input.employeeId.trim(),
            pinHash,
        ]);
        const user = userRes.rows[0];
        const workerRes = await client.query(`INSERT INTO workers (employee_id, name, category, is_team_leader, site_id, organization_id, user_id, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, employee_id, name, is_team_leader, site_id`, [
            input.employeeId.trim(),
            input.name.trim(),
            input.role === 'operator' ? 'Operator' : 'Scouter',
            isTeamLeader,
            input.siteId,
            input.organizationId,
            user.id,
            pinHash,
        ]);
        await assignUserToSiteInTransaction(client, user.id, input.siteId, input.assignedBy);
        await client.query('COMMIT');
        return { user, worker: workerRes.rows[0] };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function updateFieldStaffPin(userId, pin, organizationId) {
    if (pin.length < 4) {
        throw new errors_1.AppError('PIN must be at least 4 characters', 'VALIDATION', 400);
    }
    const pinHash = await bcryptjs_1.default.hash(pin, SALT_ROUNDS);
    const userCheck = await client_1.dbPool.query(`SELECT id, role FROM users WHERE id = $1 AND organization_id = $2
     AND role IN ('scouter', 'operator') AND deleted_at IS NULL`, [userId, organizationId]);
    if (userCheck.rows.length === 0) {
        throw new errors_1.AppError('Field staff user not found', 'NOT_FOUND', 404);
    }
    await client_1.dbPool.query('UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2', [pinHash, userId]);
    await client_1.dbPool.query('UPDATE workers SET pin_hash = $1, updated_at = NOW() WHERE user_id = $2', [pinHash, userId]);
}
async function getLinkedWorkerByEmployeeId(employeeId) {
    const result = await client_1.dbPool.query(`SELECT w.*, u.id AS linked_user_id, u.role AS linked_user_role, u.is_active AS user_is_active,
            u.organization_id
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.employee_id = $1 AND w.is_active = true`, [employeeId.trim()]);
    return result.rows[0] || null;
}
async function assertHarvestTeamLeaderCreate(role, isTeamLeader, linkedUserId) {
    if (!isTeamLeader)
        return;
    if (linkedUserId) {
        throw new errors_1.AppError('Cannot create a team leader with a linked app account via this flow', 'FORBIDDEN', 403);
    }
    if (role !== 'worker') {
        throw new errors_1.AppError('Only data entry workers may create harvest/maintenance team leaders', 'FORBIDDEN', 403);
    }
}
async function assertWorkerUpdateAllowed(workerId, updates) {
    const result = await client_1.dbPool.query(`SELECT w.is_team_leader, w.user_id, u.role
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = $1`, [workerId]);
    const row = result.rows[0];
    if (!row)
        return;
    if (row.role === 'operator' && updates.isTeamLeader === false) {
        throw new errors_1.AppError('Operators must remain team leaders', 'FORBIDDEN', 403);
    }
    if (!row.user_id && updates.isTeamLeader === false && row.is_team_leader) {
        throw new errors_1.AppError('Harvest team leaders must remain team leaders', 'FORBIDDEN', 403);
    }
}
