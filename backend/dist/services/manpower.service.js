"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertManpowerRecordInOrg = assertManpowerRecordInOrg;
exports.workerOrganizationId = workerOrganizationId;
exports.workerLogin = workerLogin;
exports.setWorkerPin = setWorkerPin;
exports.listWorkers = listWorkers;
exports.searchWorkers = searchWorkers;
exports.createWorker = createWorker;
exports.bulkCreateWorkers = bulkCreateWorkers;
exports.updateWorker = updateWorker;
exports.deactivateWorker = deactivateWorker;
exports.listActivities = listActivities;
exports.ensureManpowerActivity = ensureManpowerActivity;
exports.updateActivityPivotColumn = updateActivityPivotColumn;
exports.listVarieties = listVarieties;
exports.createVariety = createVariety;
exports.listRecords = listRecords;
exports.getRecordById = getRecordById;
exports.createRecord = createRecord;
exports.bulkCreateRecords = bulkCreateRecords;
exports.updateRecord = updateRecord;
exports.deleteRecord = deleteRecord;
exports.findManpowerOverlaps = findManpowerOverlaps;
exports.notifyApproversForNewSubmission = notifyApproversForNewSubmission;
exports.countPendingManpowerApprovalClashes = countPendingManpowerApprovalClashes;
exports.countPendingManpowerApprovals = countPendingManpowerApprovals;
exports.badgeCountForManpowerApprovals = badgeCountForManpowerApprovals;
exports.notifyManpowerApproversPendingSubmission = notifyManpowerApproversPendingSubmission;
exports.listPendingApprovals = listPendingApprovals;
exports.approveManpowerSubmission = approveManpowerSubmission;
exports.rejectManpowerSubmission = rejectManpowerSubmission;
exports.approveManpowerWorkerInSubmission = approveManpowerWorkerInSubmission;
exports.rejectManpowerWorkerInSubmission = rejectManpowerWorkerInSubmission;
exports.createManpowerSubmissionId = createManpowerSubmissionId;
exports.getDailySummary = getDailySummary;
exports.getDetailPivotSummary = getDetailPivotSummary;
exports.getHoursDetail = getHoursDetail;
exports.getFieldsWithVariety = getFieldsWithVariety;
exports.getWorkerSprayCalendarContext = getWorkerSprayCalendarContext;
exports.getSprayCalendarForSite = getSprayCalendarForSite;
exports.getSprayCalendarFields = getSprayCalendarFields;
exports.listActivityReferences = listActivityReferences;
exports.createActivityReference = createActivityReference;
exports.updateActivityReference = updateActivityReference;
exports.deleteActivityReference = deleteActivityReference;
exports.getPerformanceSummary = getPerformanceSummary;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const client_1 = require("../db/client");
const config_1 = require("../config");
const push_notification_service_1 = require("./push-notification.service");
const websocket_1 = require("../websocket");
const roleAccess_1 = require("../utils/roleAccess");
const manpowerOverlaps_1 = require("../utils/manpowerOverlaps");
const ipmService = __importStar(require("./ipm.service"));
const manpowerDetailPivot_1 = require("../utils/manpowerDetailPivot");
const manpowerPerformance_1 = require("../utils/manpowerPerformance");
const errors_1 = require("../utils/errors");
const manpowerReferenceSheets_1 = require("../utils/manpowerReferenceSheets");
const RECORD_ORG_EXPR = 'COALESCE(r.organization_id, w.organization_id)';
/**
 * SITE SCOPING — open product decision (PR 1):
 * When siteId is set, listRecords and fetchPivotRawRows filter by worker home site
 * (w.site_id) only. Field-area site (fa.site_id) is used on the LEFT JOIN to resolve
 * crop names, not to include workers based at another site who worked this site's fields.
 *
 * Before changing behaviour, decide explicitly:
 *   Option A (current): w.site_id = $siteId
 *   Option B: (w.site_id = $siteId OR fa.site_id = $siteId)
 */
async function assertManpowerRecordInOrg(recordId, organizationId) {
    const result = await client_1.dbPool.query(`SELECT r.id FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     WHERE r.id = $1 AND r.deleted_at IS NULL AND ${RECORD_ORG_EXPR} = $2`, [recordId, organizationId]);
    if (result.rows.length === 0) {
        throw new errors_1.NotFoundError('Record not found');
    }
}
async function workerOrganizationId(workerId) {
    const result = await client_1.dbPool.query('SELECT organization_id FROM workers WHERE id = $1', [workerId]);
    return result.rows[0]?.organization_id ?? null;
}
const SALT_ROUNDS = 10;
const WORKER_TOKEN_EXPIRES = '12h';
// ─── Worker Auth ────────────────────────────────────────────────
async function workerLogin(employeeId, pin) {
    const result = await client_1.dbPool.query(`SELECT w.id, w.employee_id, w.name, w.category, w.pin_hash, w.is_team_leader, w.is_active, w.site_id,
            u.role AS linked_user_role
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.employee_id = $1`, [employeeId]);
    const worker = result.rows[0];
    if (!worker)
        throw Object.assign(new Error('Invalid employee ID'), { status: 401 });
    if (!worker.is_active)
        throw Object.assign(new Error('Worker account is deactivated'), { status: 403 });
    if (!worker.is_team_leader) {
        throw Object.assign(new Error('This account is not set up as a team leader. Contact your supervisor.'), { status: 403 });
    }
    if (!worker.pin_hash)
        throw Object.assign(new Error('PIN not set. Contact your supervisor.'), { status: 403 });
    const valid = await bcryptjs_1.default.compare(pin, worker.pin_hash);
    if (!valid)
        throw Object.assign(new Error('Invalid PIN'), { status: 401 });
    const token = jsonwebtoken_1.default.sign({
        tokenType: 'worker',
        workerId: worker.id,
        employeeId: worker.employee_id,
        name: worker.name,
        isTeamLeader: worker.is_team_leader,
        siteId: worker.site_id,
    }, config_1.config.auth.jwtSecret, { expiresIn: WORKER_TOKEN_EXPIRES });
    return {
        token,
        worker: {
            id: worker.id,
            employeeId: worker.employee_id,
            name: worker.name,
            category: worker.category,
            isTeamLeader: worker.is_team_leader,
            siteId: worker.site_id,
        },
    };
}
async function setWorkerPin(workerId, pin) {
    const hash = await bcryptjs_1.default.hash(pin, SALT_ROUNDS);
    await client_1.dbPool.query('UPDATE workers SET pin_hash = $1, updated_at = NOW() WHERE id = $2', [hash, workerId]);
}
// ─── Workers CRUD ───────────────────────────────────────────────
async function listWorkers(filters) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (filters.organizationId) {
        conditions.push(`w.organization_id = $${idx}`);
        params.push(filters.organizationId);
        idx++;
    }
    if (filters.activeOnly !== false) {
        conditions.push(`w.is_active = true`);
    }
    if (filters.search) {
        conditions.push(`(w.name ILIKE $${idx} OR w.employee_id ILIKE $${idx})`);
        params.push(`%${filters.search}%`);
        idx++;
    }
    if (filters.category) {
        conditions.push(`w.category = $${idx}`);
        params.push(filters.category);
        idx++;
    }
    if (filters.isTeamLeader !== undefined) {
        conditions.push(`w.is_team_leader = $${idx}`);
        params.push(filters.isTeamLeader);
        idx++;
    }
    if (filters.siteId) {
        conditions.push(`w.site_id = $${idx}`);
        params.push(filters.siteId);
        idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await client_1.dbPool.query(`SELECT w.id, w.employee_id, w.name, w.category, w.is_team_leader, w.is_active,
            w.site_id, w.user_id, u.role AS linked_user_role,
            w.pin_hash IS NOT NULL AS has_pin, w.created_at
     FROM workers w
     LEFT JOIN users u ON u.id = w.user_id
     ${where}
     ORDER BY w.name ASC`, params);
    return result.rows;
}
async function searchWorkers(query, siteId) {
    if (siteId) {
        const result = await client_1.dbPool.query(`SELECT id, employee_id, name, category, is_team_leader, site_id
       FROM workers
       WHERE is_active = true AND (name ILIKE $1 OR employee_id ILIKE $1) AND site_id = $2
       ORDER BY name ASC LIMIT 30`, [`%${query}%`, siteId]);
        return result.rows;
    }
    const result = await client_1.dbPool.query(`SELECT id, employee_id, name, category, is_team_leader, site_id
     FROM workers
     WHERE is_active = true AND (name ILIKE $1 OR employee_id ILIKE $1)
     ORDER BY name ASC LIMIT 30`, [`%${query}%`]);
    return result.rows;
}
async function createWorker(data) {
    const result = await client_1.dbPool.query(`INSERT INTO workers (employee_id, name, category, is_team_leader, site_id, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, employee_id, name, category, is_team_leader, is_active, site_id`, [data.employeeId, data.name, data.category || 'Casual', data.isTeamLeader || false, data.siteId || null, data.organizationId]);
    return result.rows[0];
}
async function bulkCreateWorkers(workers, siteId, organizationId) {
    let created = 0, skipped = 0;
    const errors = [];
    for (const w of workers) {
        try {
            const result = await client_1.dbPool.query(`INSERT INTO workers (employee_id, name, category, site_id, organization_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (employee_id) DO NOTHING
         RETURNING id`, [w.employeeId, w.name, w.category || 'Casual', siteId || null, organizationId]);
            if (result.rowCount && result.rowCount > 0)
                created++;
            else
                skipped++;
        }
        catch (err) {
            errors.push(`${w.employeeId}: ${err.message}`);
        }
    }
    return { created, skipped, errors };
}
async function updateWorker(id, data) {
    const sets = ['updated_at = NOW()'];
    const params = [];
    let idx = 1;
    if (data.name !== undefined) {
        sets.push(`name = $${idx}`);
        params.push(data.name);
        idx++;
    }
    if (data.category !== undefined) {
        sets.push(`category = $${idx}`);
        params.push(data.category);
        idx++;
    }
    if (data.isTeamLeader !== undefined) {
        sets.push(`is_team_leader = $${idx}`);
        params.push(data.isTeamLeader);
        idx++;
    }
    if (data.isActive !== undefined) {
        sets.push(`is_active = $${idx}`);
        params.push(data.isActive);
        idx++;
    }
    if (data.siteId !== undefined) {
        sets.push(`site_id = $${idx}`);
        params.push(data.siteId || null);
        idx++;
    }
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE workers SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, employee_id, name, category, is_team_leader, is_active, site_id`, params);
    return result.rows[0];
}
async function deactivateWorker(id) {
    await client_1.dbPool.query('UPDATE workers SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
}
// ─── Activities ─────────────────────────────────────────────────
/** Postgres undefined_column: migration 143 has not run on this database yet. */
const PG_UNDEFINED_COLUMN = '42703';
function isMissingPivotColumn(err) {
    return err?.code === PG_UNDEFINED_COLUMN;
}
/** Catalog rows, falling back to a NULL pivot_column before migration 143 runs. */
async function queryActivityCatalog() {
    try {
        return await client_1.dbPool.query(`SELECT id, name, default_unit, pivot_column
       FROM manpower_activities
       WHERE is_active = true
       ORDER BY name ASC`);
    }
    catch (err) {
        if (!isMissingPivotColumn(err))
            throw err;
        return client_1.dbPool.query(`SELECT id, name, default_unit, NULL AS pivot_column
       FROM manpower_activities
       WHERE is_active = true
       ORDER BY name ASC`);
    }
}
async function listActivities(opts) {
    const catalog = await queryActivityCatalog();
    if (!opts?.siteId || !opts?.organizationId) {
        return catalog.rows;
    }
    const extras = await client_1.dbPool.query(`SELECT MIN(r.activity) AS name, MAX(r.unit) AS default_unit
     FROM manpower_activity_references r
     WHERE r.site_id = $1 AND r.organization_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM manpower_activities a
         WHERE a.is_active = true
           AND lower(btrim(a.name)) = lower(btrim(r.activity))
       )
     GROUP BY lower(btrim(r.activity))
     ORDER BY 1`, [opts.siteId, opts.organizationId]);
    const extraRows = extras.rows.map((row) => ({
        id: null,
        name: row.name,
        default_unit: row.default_unit,
        pivot_column: null,
    }));
    return [...catalog.rows, ...extraRows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
async function ensureManpowerActivity(name, defaultUnit) {
    const trimmed = name.trim();
    if (!trimmed)
        return;
    const existing = await client_1.dbPool.query(`SELECT id FROM manpower_activities WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 1`, [trimmed]);
    if (existing.rows.length > 0) {
        if (defaultUnit) {
            await client_1.dbPool.query(`UPDATE manpower_activities
         SET default_unit = COALESCE(NULLIF(btrim(default_unit), ''), $2)
         WHERE id = $1 AND is_active = true`, [existing.rows[0].id, defaultUnit.trim()]);
        }
        await client_1.dbPool.query(`UPDATE manpower_activities SET is_active = true WHERE id = $1 AND is_active IS DISTINCT FROM true`, [existing.rows[0].id]);
        return;
    }
    await client_1.dbPool.query(`INSERT INTO manpower_activities (name, default_unit, is_active) VALUES ($1, $2, true)`, [trimmed, defaultUnit == null || String(defaultUnit).trim() === '' ? null : String(defaultUnit).trim()]);
}
/**
 * Empty map when migration 143 has not run, so the pivot falls back to alias and
 * fuzzy matching instead of failing the whole report.
 */
async function loadActivityPivotColumnMap() {
    try {
        const result = await client_1.dbPool.query(`SELECT name, pivot_column
       FROM manpower_activities
       WHERE is_active = true AND pivot_column IS NOT NULL`);
        return (0, manpowerDetailPivot_1.buildActivityPivotColumnMap)(result.rows);
    }
    catch (err) {
        if (!isMissingPivotColumn(err))
            throw err;
        return new Map();
    }
}
async function updateActivityPivotColumn(activityId, pivotColumn) {
    if (pivotColumn != null && !manpowerDetailPivot_1.VALID_PIVOT_COLUMN_KEYS.includes(pivotColumn)) {
        throw new Error(`Invalid pivot column: ${pivotColumn}`);
    }
    let result;
    try {
        result = await client_1.dbPool.query(`UPDATE manpower_activities
       SET pivot_column = $2
       WHERE id = $1 AND is_active = true
       RETURNING id, name, pivot_column`, [activityId, pivotColumn]);
    }
    catch (err) {
        if (!isMissingPivotColumn(err))
            throw err;
        const notMigrated = new Error('Activity column mapping is unavailable until migration 143 has been applied to this database.');
        notMigrated.status = 503;
        throw notMigrated;
    }
    if (result.rows.length === 0) {
        throw new errors_1.NotFoundError('Activity not found');
    }
    return result.rows[0];
}
// ─── Varieties ──────────────────────────────────────────────────
async function listVarieties(cropId, cropName) {
    if (cropId) {
        const result = await client_1.dbPool.query('SELECT id, name, crop_id FROM crop_varieties WHERE is_active = true AND crop_id = $1 ORDER BY name', [cropId]);
        return result.rows;
    }
    if (cropName && String(cropName).trim()) {
        const result = await client_1.dbPool.query(`SELECT cv.id, cv.name, cv.crop_id
       FROM crop_varieties cv
       JOIN crops c ON c.id = cv.crop_id
       WHERE cv.is_active = true
         AND lower(btrim(c.name)) = lower(btrim($1))
       ORDER BY cv.name`, [cropName]);
        return result.rows;
    }
    const result = await client_1.dbPool.query('SELECT id, name, crop_id FROM crop_varieties WHERE is_active = true ORDER BY name');
    return result.rows;
}
async function createVariety(name, cropId) {
    const result = await client_1.dbPool.query('INSERT INTO crop_varieties (name, crop_id) VALUES ($1, $2) RETURNING id, name, crop_id', [name, cropId || null]);
    return result.rows[0];
}
// ─── Records ────────────────────────────────────────────────────
async function listRecords(filters) {
    const conditions = ['r.deleted_at IS NULL'];
    const params = [];
    let idx = 1;
    params.push(filters.organizationId);
    conditions.push(`${RECORD_ORG_EXPR} = $${idx}`);
    idx++;
    if (filters.siteId) {
        params.push(filters.siteId);
        conditions.push(`w.site_id = $${idx}`);
        idx++;
    }
    if (filters.approvedOnly) {
        conditions.push(`r.approval_status = 'approved'`);
    }
    else if (filters.approvalStatus) {
        conditions.push(`r.approval_status = $${idx}`);
        params.push(filters.approvalStatus);
        idx++;
    }
    if (filters.date) {
        conditions.push(`r.record_date = $${idx}`);
        params.push(filters.date);
        idx++;
    }
    else {
        if (filters.startDate) {
            conditions.push(`r.record_date >= $${idx}`);
            params.push(filters.startDate);
            idx++;
        }
        if (filters.endDate) {
            conditions.push(`r.record_date <= $${idx}`);
            params.push(filters.endDate);
            idx++;
        }
    }
    if (filters.workerId) {
        conditions.push(`r.worker_id = $${idx}`);
        params.push(filters.workerId);
        idx++;
    }
    if (filters.activity) {
        conditions.push(`r.activity ILIKE $${idx}`);
        params.push(`%${filters.activity}%`);
        idx++;
    }
    if (filters.location) {
        conditions.push(`r.location ILIKE $${idx}`);
        params.push(`%${filters.location}%`);
        idx++;
    }
    if (filters.submittedBy) {
        conditions.push(`r.submitted_by = $${idx}`);
        params.push(filters.submittedBy);
        idx++;
    }
    if (filters.search) {
        conditions.push(`(w.name ILIKE $${idx} OR r.activity ILIKE $${idx} OR r.location ILIKE $${idx})`);
        params.push(`%${filters.search}%`);
        idx++;
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = filters.limit || 500;
    const offset = filters.offset || 0;
    const countResult = await client_1.dbPool.query(`SELECT COUNT(*) FROM manpower_records r JOIN workers w ON w.id = r.worker_id ${where}`, params);
    params.push(limit);
    params.push(offset);
    const result = await client_1.dbPool.query(`SELECT r.*, w.employee_id, w.name AS worker_name, w.category AS worker_category,
            sub.name AS submitted_by_name
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN workers sub ON sub.id = r.submitted_by
     ${where}
     ORDER BY r.record_date DESC, w.name ASC, r.task_sequence ASC
     LIMIT $${idx} OFFSET $${idx + 1}`, params);
    return { data: result.rows, total: parseInt(countResult.rows[0].count) };
}
function normalizeOptionalActivity(activity) {
    if (activity == null)
        return null;
    const t = String(activity).trim();
    return t === '' ? null : t;
}
async function getRecordById(id, organizationId) {
    const result = await client_1.dbPool.query(`SELECT r.*, w.employee_id, w.name AS worker_name, w.category AS worker_category,
            w.site_id AS worker_site_id,
            sub.name AS submitted_by_name
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN workers sub ON sub.id = r.submitted_by
     WHERE r.id = $1 AND r.deleted_at IS NULL AND ${RECORD_ORG_EXPR} = $2`, [id, organizationId]);
    if (result.rows.length === 0) {
        throw new errors_1.NotFoundError('Record not found');
    }
    return result.rows[0];
}
async function createRecord(data) {
    const approvalStatus = data.approvalStatus || 'approved';
    const orgId = data.organizationId ?? await workerOrganizationId(data.workerId);
    const result = await client_1.dbPool.query(`INSERT INTO manpower_records
       (record_date, worker_id, task_sequence, activity, unit, variety, location, section,
        start_time, end_time, target, actual, work_hours, overtime, total_hours,
        submitted_by, created_by, approval_status, submission_id, organization_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`, [
        data.recordDate, data.workerId, data.taskSequence || 1,
        normalizeOptionalActivity(data.activity), data.unit || null, data.variety || null,
        data.location || null, data.section || null,
        data.startTime || null, data.endTime || null,
        data.target ?? null, data.actual ?? null,
        data.workHours ?? null, data.overtime || 0, data.totalHours ?? null,
        data.submittedBy || null, data.createdBy || null,
        approvalStatus, data.submissionId || null, orgId,
    ]);
    return result.rows[0];
}
async function bulkCreateRecords(records, options) {
    if (records.length === 0)
        return [];
    const approvalStatus = options?.approvalStatus ?? 'approved';
    const submissionId = options?.submissionId ?? null;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const results = [];
        for (const rec of records) {
            const orgId = rec.organizationId ?? await workerOrganizationId(rec.workerId);
            const result = await client.query(`INSERT INTO manpower_records
           (record_date, worker_id, task_sequence, activity, unit, variety, location, section,
            start_time, end_time, target, actual, work_hours, overtime, total_hours,
            submitted_by, created_by, approval_status, submission_id, organization_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`, [
                rec.recordDate, rec.workerId, rec.taskSequence || 1,
                normalizeOptionalActivity(rec.activity), rec.unit || null, rec.variety || null,
                rec.location || null, rec.section || null,
                rec.startTime || null, rec.endTime || null,
                rec.target ?? null, rec.actual ?? null,
                rec.workHours ?? null, rec.overtime || 0, rec.totalHours ?? null,
                rec.submittedBy || null, rec.createdBy || null,
                approvalStatus, submissionId, orgId,
            ]);
            results.push(result.rows[0]);
        }
        await client.query('COMMIT');
        return results;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function updateRecord(id, organizationId, data) {
    await assertManpowerRecordInOrg(id, organizationId);
    const sets = ['updated_at = NOW()'];
    const params = [];
    let idx = 1;
    const fields = [
        'record_date', 'worker_id', 'task_sequence', 'activity', 'unit', 'variety',
        'location', 'section', 'start_time', 'end_time',
        'target', 'actual', 'work_hours', 'overtime', 'total_hours',
    ];
    const camelToSnake = {
        recordDate: 'record_date', workerId: 'worker_id', taskSequence: 'task_sequence',
        startTime: 'start_time', endTime: 'end_time', workHours: 'work_hours',
        totalHours: 'total_hours',
    };
    for (const [key, value] of Object.entries(data)) {
        const col = camelToSnake[key] || key;
        if (fields.includes(col) && value !== undefined) {
            sets.push(`${col} = $${idx}`);
            params.push(value);
            idx++;
        }
    }
    if (sets.length <= 1)
        return null;
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE manpower_records SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    return result.rows[0];
}
async function deleteRecord(id, organizationId) {
    await assertManpowerRecordInOrg(id, organizationId);
    await client_1.dbPool.query('UPDATE manpower_records SET deleted_at = NOW() WHERE id = $1', [id]);
}
function submissionGroupKey(row) {
    return row.submission_id || `legacy:${row.record_date}:${row.submitted_by || 'unknown'}`;
}
function mapApprovalRecordRow(row) {
    return {
        id: row.id,
        recordDate: row.record_date,
        workerId: row.worker_id,
        employeeId: row.employee_id,
        workerName: row.worker_name,
        workerCategory: row.worker_category,
        taskSequence: row.task_sequence,
        activity: row.activity,
        unit: row.unit,
        variety: row.variety,
        location: row.location,
        section: row.section,
        startTime: row.start_time,
        endTime: row.end_time,
        target: row.target,
        actual: row.actual,
        workHours: row.work_hours,
        overtime: row.overtime,
        totalHours: row.total_hours,
        submittedBy: row.submitted_by,
        submittedByName: row.submitted_by_name,
        approvalStatus: row.approval_status,
        submissionId: row.submission_id,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
    };
}
function overlapSubmissionKey(row) {
    if (row.submission_id)
        return row.submission_id;
    const date = row.record_date instanceof Date
        ? row.record_date.toISOString().slice(0, 10)
        : String(row.record_date).slice(0, 10);
    return `legacy:${date}:${row.submitted_by || 'unknown'}`;
}
function mapOverlapRow(row) {
    const recordDate = row.record_date instanceof Date
        ? row.record_date.toISOString().slice(0, 10)
        : String(row.record_date).slice(0, 10);
    return {
        workerId: row.worker_id,
        workerName: row.worker_name,
        recordDate,
        approvalStatus: row.approval_status,
        otherSubmitterName: row.other_submitter_name || 'Unknown',
        submissionKey: overlapSubmissionKey(row),
    };
}
async function findManpowerOverlaps(opts) {
    if (!opts.workerIds.length)
        return [];
    const params = [opts.organizationId, opts.recordDate, opts.workerIds];
    let excludeSql = '';
    if (opts.excludeSubmissionId) {
        params.push(opts.excludeSubmissionId);
        excludeSql = `AND (r.submission_id IS DISTINCT FROM $${params.length})`;
    }
    const result = await client_1.dbPool.query(`SELECT r.worker_id, r.record_date, r.approval_status, r.submission_id, r.submitted_by,
            w.name AS worker_name,
            COALESCE(sub.name, creator.name, 'Unknown') AS other_submitter_name
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN workers sub ON sub.id = r.submitted_by
     LEFT JOIN users creator ON creator.id = r.created_by
     WHERE r.deleted_at IS NULL
       AND r.approval_status IN ('pending', 'approved')
       AND COALESCE(r.organization_id, w.organization_id) = $1
       AND r.record_date::date = $2::date
       AND r.worker_id = ANY($3::uuid[])
       ${excludeSql}
     ORDER BY w.name ASC`, params);
    const seen = new Set();
    const unique = [];
    for (const row of result.rows.map(mapOverlapRow)) {
        const key = `${row.workerId}|${row.submissionKey}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(row);
    }
    return unique;
}
async function notifyApproversForNewSubmission(organizationId, submissionId, records) {
    if (!records.length)
        return;
    const workerIds = [...new Set(records.map((r) => r.workerId).filter(Boolean))];
    const recordDate = records[0].recordDate;
    const overlaps = workerIds.length && recordDate
        ? await findManpowerOverlaps({
            organizationId,
            recordDate,
            workerIds,
            excludeSubmissionId: submissionId,
        })
        : [];
    await notifyManpowerApproversPendingSubmission(organizationId, submissionId, records.length, overlaps);
}
async function loadOverlapRowsForPending(organizationId, pendingRows) {
    if (pendingRows.length === 0)
        return [];
    const workerIds = [...new Set(pendingRows.map((r) => r.worker_id))];
    const dates = [...new Set(pendingRows.map((r) => (r.record_date instanceof Date ? r.record_date.toISOString().slice(0, 10) : String(r.record_date).slice(0, 10))))];
    const result = await client_1.dbPool.query(`SELECT r.worker_id, r.record_date, r.approval_status, r.submission_id, r.submitted_by,
            w.name AS worker_name,
            COALESCE(sub.name, creator.name, 'Unknown') AS other_submitter_name
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN workers sub ON sub.id = r.submitted_by
     LEFT JOIN users creator ON creator.id = r.created_by
     WHERE r.deleted_at IS NULL
       AND r.approval_status IN ('pending', 'approved')
       AND COALESCE(r.organization_id, w.organization_id) = $1
       AND r.worker_id = ANY($2::uuid[])
       AND r.record_date::date = ANY($3::date[])
     ORDER BY w.name ASC`, [organizationId, workerIds, dates]);
    return result.rows.map(mapOverlapRow);
}
async function countPendingManpowerApprovalClashes(organizationId) {
    const result = await client_1.dbPool.query(`SELECT COUNT(DISTINCT COALESCE(r.submission_id::text,
              'legacy:' || r.record_date::text || ':' || COALESCE(r.submitted_by::text, 'unknown')))::int AS count
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     WHERE r.deleted_at IS NULL
       AND r.approval_status = 'pending'
       AND COALESCE(r.organization_id, w.organization_id) = $1
       AND EXISTS (
         SELECT 1
         FROM manpower_records o
         JOIN workers ow ON ow.id = o.worker_id
         WHERE o.deleted_at IS NULL
           AND o.approval_status IN ('pending', 'approved')
           AND o.worker_id = r.worker_id
           AND o.record_date::date = r.record_date::date
           AND COALESCE(o.organization_id, ow.organization_id) = $1
           AND COALESCE(o.submission_id::text,
                 'legacy:' || o.record_date::text || ':' || COALESCE(o.submitted_by::text, 'unknown'))
               IS DISTINCT FROM
               COALESCE(r.submission_id::text,
                 'legacy:' || r.record_date::text || ':' || COALESCE(r.submitted_by::text, 'unknown'))
       )`, [organizationId]);
    return result.rows[0]?.count || 0;
}
async function countPendingManpowerApprovals(organizationId) {
    const result = await client_1.dbPool.query(`SELECT COUNT(*)::int AS count
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     WHERE r.deleted_at IS NULL
       AND r.approval_status = 'pending'
       AND COALESCE(r.organization_id, w.organization_id) = $1`, [organizationId]);
    return result.rows[0]?.count || 0;
}
function badgeCountForManpowerApprovals(role, count) {
    if (!role || !(0, roleAccess_1.canApproveManpowerRecords)(role))
        return 0;
    return count;
}
const MANPOWER_APPROVER_ROLES = [
    'operation_manager',
    'worker',
    'agronomist',
    'ceo',
    'farm_manager',
];
async function notifyManpowerApproversPendingSubmission(organizationId, submissionId, recordCount, clashOverlaps) {
    const rolePlaceholders = MANPOWER_APPROVER_ROLES.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await client_1.dbPool.query(`SELECT id FROM users
     WHERE organization_id = $${MANPOWER_APPROVER_ROLES.length + 1}
       AND role IN (${rolePlaceholders})
       AND is_active = true`, [...MANPOWER_APPROVER_ROLES, organizationId]);
    if (usersResult.rows.length === 0)
        return;
    const hasClash = Boolean(clashOverlaps && clashOverlaps.length > 0);
    const title = hasClash
        ? 'Clash: manpower submission pending approval'
        : 'Manpower submission pending approval';
    const clashNames = [...new Set((clashOverlaps || []).map((c) => c.workerName))];
    const message = hasClash
        ? `Clash: ${clashNames.join(', ')} already have hours this date. ${recordCount} record${recordCount === 1 ? '' : 's'} awaiting review.`
        : `${recordCount} record${recordCount === 1 ? '' : 's'} submitted and awaiting your review.`;
    const severity = hasClash ? 'warning' : 'info';
    const alertResult = await client_1.dbPool.query(`INSERT INTO alert_events (entity_type, entity_id, severity, title, message)
     VALUES ('manpower_submission', $1, $2, $3, $4)
     RETURNING *`, [submissionId, severity, title, message]);
    const alertEvent = alertResult.rows[0];
    const values = [];
    const params = [alertEvent.id, title, message, severity];
    let paramIdx = params.length + 1;
    for (const user of usersResult.rows) {
        values.push(`($${paramIdx}, $1, $2, $3, $4)`);
        params.push(user.id);
        paramIdx++;
    }
    await client_1.dbPool.query(`INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ${values.join(', ')}`, params);
    for (const user of usersResult.rows) {
        (0, websocket_1.emitAlert)(alertEvent, user.id);
        push_notification_service_1.pushNotificationService.sendToUser(user.id, {
            title,
            body: message,
            type: 'alert',
            data: {
                entityType: 'manpower_submission',
                path: '/manpower-record',
                submissionId,
            },
        }).catch(() => { });
    }
}
async function listPendingApprovals(organizationId, filters) {
    const conditions = [
        'r.deleted_at IS NULL',
        `r.approval_status = 'pending'`,
        'COALESCE(r.organization_id, w.organization_id) = $1',
    ];
    const params = [organizationId];
    let idx = 2;
    if (filters.startDate) {
        conditions.push(`r.record_date >= $${idx}`);
        params.push(filters.startDate);
        idx++;
    }
    if (filters.endDate) {
        conditions.push(`r.record_date <= $${idx}`);
        params.push(filters.endDate);
        idx++;
    }
    if (filters.siteId) {
        conditions.push(`w.site_id = $${idx}`);
        params.push(filters.siteId);
        idx++;
    }
    const result = await client_1.dbPool.query(`SELECT r.*, w.employee_id, w.name AS worker_name, w.category AS worker_category,
            COALESCE(sub.name, creator.name) AS submitted_by_name
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN workers sub ON sub.id = r.submitted_by
     LEFT JOIN users creator ON creator.id = r.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.record_date DESC, COALESCE(sub.name, creator.name) ASC NULLS LAST, w.name ASC, r.task_sequence ASC`, params);
    const submissionMap = new Map();
    for (const row of result.rows) {
        const key = submissionGroupKey(row);
        if (!submissionMap.has(key)) {
            submissionMap.set(key, {
                submissionId: row.submission_id || key,
                submissionKey: key,
                recordDate: row.record_date,
                submittedBy: row.submitted_by,
                submittedByName: row.submitted_by_name || 'Unknown',
                pendingTaskCount: 0,
                pendingWorkerIds: new Set(),
                workers: new Map(),
            });
        }
        const submission = submissionMap.get(key);
        submission.pendingTaskCount += 1;
        submission.pendingWorkerIds.add(row.worker_id);
        if (!submission.workers.has(row.worker_id)) {
            submission.workers.set(row.worker_id, {
                workerId: row.worker_id,
                employeeId: row.employee_id,
                workerName: row.worker_name,
                workerCategory: row.worker_category,
                records: [],
            });
        }
        submission.workers.get(row.worker_id).records.push(mapApprovalRecordRow(row));
    }
    const overlapRows = await loadOverlapRowsForPending(organizationId, result.rows);
    const grouped = Array.from(submissionMap.values()).map((s) => ({
        submissionId: s.submissionId,
        submissionKey: s.submissionKey,
        recordDate: s.recordDate,
        submittedBy: s.submittedBy,
        submittedByName: s.submittedByName,
        pendingTaskCount: s.pendingTaskCount,
        pendingWorkerCount: s.pendingWorkerIds.size,
        workers: Array.from(s.workers.values()).map((w) => ({
            ...w,
            totalHours: w.records.reduce((sum, rec) => sum + (Number(rec.workHours) || 0), 0),
        })),
    }));
    return (0, manpowerOverlaps_1.sortSubmissionsClashesFirst)((0, manpowerOverlaps_1.attachClashesToSubmissions)(grouped, overlapRows));
}
async function resolveSubmissionScope(submissionKey, organizationId) {
    const isLegacy = submissionKey.startsWith('legacy:');
    let where;
    let params;
    if (isLegacy) {
        const [, recordDate, submittedBy] = submissionKey.split(':');
        where = `r.deleted_at IS NULL
      AND r.approval_status = 'pending'
      AND r.submission_id IS NULL
      AND r.record_date = $1
      AND COALESCE(r.submitted_by::text, 'unknown') = $2
      AND COALESCE(r.organization_id, w.organization_id) = $3`;
        params = [recordDate, submittedBy, organizationId];
    }
    else {
        where = `r.deleted_at IS NULL
      AND r.approval_status = 'pending'
      AND r.submission_id = $1
      AND COALESCE(r.organization_id, w.organization_id) = $2`;
        params = [submissionKey, organizationId];
    }
    return { where, params, isLegacy, submissionId: isLegacy ? null : submissionKey };
}
async function approveManpowerSubmission(submissionKey, organizationId, reviewerUserId) {
    const { where, params } = await resolveSubmissionScope(submissionKey, organizationId);
    const result = await client_1.dbPool.query(`UPDATE manpower_records r
     SET approval_status = 'approved',
         reviewed_by = $${params.length + 1},
         reviewed_at = NOW(),
         rejection_reason = NULL,
         updated_at = NOW()
     FROM workers w
     WHERE r.worker_id = w.id AND ${where}
     RETURNING r.id`, [...params, reviewerUserId]);
    return { approvedCount: result.rowCount || 0 };
}
async function rejectManpowerSubmission(submissionKey, organizationId, reviewerUserId, reason) {
    const trimmed = reason?.trim();
    if (!trimmed) {
        throw Object.assign(new Error('Rejection reason is required'), { status: 400 });
    }
    const { where, params } = await resolveSubmissionScope(submissionKey, organizationId);
    const result = await client_1.dbPool.query(`UPDATE manpower_records r
     SET approval_status = 'rejected',
         reviewed_by = $${params.length + 1},
         reviewed_at = NOW(),
         rejection_reason = $${params.length + 2},
         updated_at = NOW()
     FROM workers w
     WHERE r.worker_id = w.id AND ${where}
     RETURNING r.id`, [...params, reviewerUserId, trimmed]);
    return { rejectedCount: result.rowCount || 0 };
}
async function approveManpowerWorkerInSubmission(submissionKey, workerId, organizationId, reviewerUserId) {
    const { where, params } = await resolveSubmissionScope(submissionKey, organizationId);
    const result = await client_1.dbPool.query(`UPDATE manpower_records r
     SET approval_status = 'approved',
         reviewed_by = $${params.length + 1},
         reviewed_at = NOW(),
         rejection_reason = NULL,
         updated_at = NOW()
     FROM workers w
     WHERE r.worker_id = w.id
       AND r.worker_id = $${params.length + 2}
       AND ${where}
     RETURNING r.id`, [...params, reviewerUserId, workerId]);
    return { approvedCount: result.rowCount || 0 };
}
async function rejectManpowerWorkerInSubmission(submissionKey, workerId, organizationId, reviewerUserId, reason) {
    const trimmed = reason?.trim();
    if (!trimmed) {
        throw Object.assign(new Error('Rejection reason is required'), { status: 400 });
    }
    const { where, params } = await resolveSubmissionScope(submissionKey, organizationId);
    const result = await client_1.dbPool.query(`UPDATE manpower_records r
     SET approval_status = 'rejected',
         reviewed_by = $${params.length + 1},
         reviewed_at = NOW(),
         rejection_reason = $${params.length + 2},
         updated_at = NOW()
     FROM workers w
     WHERE r.worker_id = w.id
       AND r.worker_id = $${params.length + 3}
       AND ${where}
     RETURNING r.id`, [...params, reviewerUserId, trimmed, workerId]);
    return { rejectedCount: result.rowCount || 0 };
}
function createManpowerSubmissionId() {
    return (0, crypto_1.randomUUID)();
}
// ─── Summary ────────────────────────────────────────────────────
async function getDailySummary(organizationId, date) {
    const result = await client_1.dbPool.query(`SELECT
       COUNT(DISTINCT r.worker_id) AS total_workers,
       COALESCE(SUM(r.total_hours), 0) AS total_hours,
       COALESCE(SUM(r.overtime), 0) AS total_overtime,
       r.activity,
       COUNT(*) AS record_count,
       COALESCE(SUM(r.work_hours), 0) AS activity_hours
     FROM manpower_records r
     WHERE r.record_date = $1
       AND r.deleted_at IS NULL
       AND r.approval_status = 'approved'
       AND COALESCE(r.organization_id, (SELECT w.organization_id FROM workers w WHERE w.id = r.worker_id LIMIT 1)) = $2
     GROUP BY r.activity
     ORDER BY activity_hours DESC`, [date, organizationId]);
    const totals = await client_1.dbPool.query(`SELECT
       COUNT(DISTINCT worker_id) AS total_workers,
       COALESCE(SUM(total_hours), 0) AS total_hours,
       COALESCE(SUM(overtime), 0) AS total_overtime
     FROM manpower_records r
     WHERE record_date = $1
       AND deleted_at IS NULL
       AND approval_status = 'approved'
       AND COALESCE(r.organization_id, (SELECT w.organization_id FROM workers w WHERE w.id = r.worker_id LIMIT 1)) = $2`, [date, organizationId]);
    return {
        date,
        ...totals.rows[0],
        byActivity: result.rows,
    };
}
async function fetchPivotRawRows(organizationId, filters) {
    const conditions = ['r.deleted_at IS NULL'];
    const params = [];
    let idx = 1;
    params.push(filters.startDate);
    conditions.push(`r.record_date >= $${idx}`);
    idx += 1;
    params.push(filters.endDate);
    conditions.push(`r.record_date <= $${idx}`);
    idx += 1;
    params.push(organizationId);
    conditions.push(`COALESCE(r.organization_id, w.organization_id) = $${idx}`);
    idx += 1;
    if (filters.approvedOnly) {
        conditions.push(`r.approval_status = 'approved'`);
    }
    let siteParamIdx = null;
    if (filters.siteId) {
        params.push(filters.siteId);
        siteParamIdx = idx;
        conditions.push(`w.site_id = $${idx}`);
        idx += 1;
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const siteJoin = siteParamIdx != null
        ? `AND fa.site_id = $${siteParamIdx}`
        : '';
    const result = await client_1.dbPool.query(`SELECT r.record_date, r.variety, r.activity, r.location, r.section, r.worker_id,
            w.category AS worker_category,
            w.name AS worker_name,
            w.employee_id,
            c.name AS field_crop_name,
            c_var.name AS variety_crop_name,
            GREATEST(COALESCE(r.work_hours,
              EXTRACT(EPOCH FROM (r.end_time - r.start_time)) / 3600.0), 0) AS hours,
            (r.work_hours IS NULL AND (r.start_time IS NULL OR r.end_time IS NULL)) AS hours_missing,
            r.actual, r.unit, r.total_hours
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN fields f ON normalize_manpower_location(f.name) = normalize_manpower_location(r.location)
       AND f.deleted_at IS NULL
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id AND fa.deleted_at IS NULL ${siteJoin}
     LEFT JOIN crops c ON c.id = f.current_crop_id
     LEFT JOIN crop_varieties cv ON TRIM(cv.name) = TRIM(r.variety)
     LEFT JOIN crops c_var ON c_var.id = cv.crop_id
     ${where}`, params);
    return result.rows;
}
async function getDetailPivotSummary(organizationId, filters) {
    const rawRows = await fetchPivotRawRows(organizationId, filters);
    const columnMap = await loadActivityPivotColumnMap();
    const maps = (0, manpowerDetailPivot_1.buildPivotMapsFromRows)(rawRows, columnMap);
    const cells = (0, manpowerDetailPivot_1.pivotMapsToCells)(maps);
    const crops = (0, manpowerDetailPivot_1.fieldCropsOrdered)(maps.crops);
    const includeGeneral = maps.crops.includes('General');
    let siteCrops = [];
    let siteVarieties = [];
    if (filters.siteId) {
        const siteMeta = await getSiteCropAndVarietyLists(filters.siteId);
        siteCrops = siteMeta.siteCrops;
        siteVarieties = siteMeta.siteVarieties;
    }
    return {
        startDate: filters.startDate,
        endDate: filters.endDate,
        dates: maps.dates,
        crops,
        includeGeneral,
        siteCrops,
        siteVarieties,
        cells,
        missingHoursCount: maps.missingHoursCount,
        activities: manpowerDetailPivot_1.WORKERS_COUNT_GRID_COLUMNS.map(({ key, label }) => ({ key, label })),
    };
}
async function getHoursDetail(organizationId, filters) {
    const rawRows = await fetchPivotRawRows(organizationId, {
        startDate: filters.startDate,
        endDate: filters.endDate,
        siteId: filters.siteId,
        approvedOnly: filters.approvedOnly ?? true,
    });
    const columnMap = await loadActivityPivotColumnMap();
    const resolved = (0, manpowerDetailPivot_1.resolveAndNormalizeRows)(rawRows, columnMap);
    const filtered = (0, manpowerDetailPivot_1.filterRowsForCell)(resolved, {
        crop: filters.crop || '',
        variety: filters.variety,
        activity: filters.activity,
        groupBy: filters.groupBy || 'crop',
    });
    const rows = (0, manpowerDetailPivot_1.groupRowsForDrillDown)(filtered);
    return {
        startDate: filters.startDate,
        endDate: filters.endDate,
        crop: filters.crop,
        variety: filters.variety || null,
        activity: filters.activity,
        groupBy: filters.groupBy || 'crop',
        rows,
    };
}
async function getSiteCropAndVarietyLists(siteId) {
    const cropsResult = await client_1.dbPool.query(`SELECT DISTINCT c.name
     FROM (
       SELECT fac.crop_id AS crop_id
       FROM farm_area_crops fac
       JOIN farm_areas fa ON fa.id = fac.farm_area_id
       WHERE fa.site_id = $1 AND fa.deleted_at IS NULL
       UNION
       SELECT f.current_crop_id AS crop_id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1
         AND f.deleted_at IS NULL
         AND fa.deleted_at IS NULL
         AND f.current_crop_id IS NOT NULL
       UNION
       SELECT pr.crop_id AS crop_id
       FROM planting_records pr
       JOIN fields f ON f.id = pr.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1
         AND f.deleted_at IS NULL
         AND fa.deleted_at IS NULL
         AND pr.crop_id IS NOT NULL
     ) site_crops
     JOIN crops c ON c.id = site_crops.crop_id
     ORDER BY c.name ASC`, [siteId]);
    const varietiesResult = await client_1.dbPool.query(`SELECT DISTINCT cv.name
     FROM planting_records pr
     JOIN crop_varieties cv ON cv.id = pr.variety_id
     JOIN fields f ON f.id = pr.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1
       AND f.deleted_at IS NULL
       AND pr.variety_id IS NOT NULL
     ORDER BY cv.name ASC`, [siteId]);
    return {
        siteCrops: cropsResult.rows.map((r) => r.name),
        siteVarieties: varietiesResult.rows.map((r) => r.name),
    };
}
// ─── Fields with Variety ────────────────────────────────────────
async function getFieldsWithVariety(siteId) {
    if (!siteId)
        return [];
    const fieldsResult = await client_1.dbPool.query(`SELECT f.id, f.name, f.current_crop_id, c.name AS crop_name,
            f.variety_id, cv.name AS variety_name
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     LEFT JOIN crop_varieties cv ON cv.id = f.variety_id
     WHERE f.deleted_at IS NULL AND fa.site_id = $1
     ORDER BY f.name ASC`, [siteId]);
    const varietyResult = await client_1.dbPool.query(`SELECT pr.field_id, cv.name AS variety_name
     FROM planting_records pr
     JOIN crop_varieties cv ON cv.id = pr.variety_id
     JOIN fields f ON f.id = pr.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1
       AND f.deleted_at IS NULL
       AND pr.field_id IS NOT NULL
       AND pr.variety_id IS NOT NULL
     ORDER BY cv.name ASC`, [siteId]);
    const varietiesByField = new Map();
    for (const row of varietyResult.rows) {
        if (!varietiesByField.has(row.field_id)) {
            varietiesByField.set(row.field_id, []);
        }
        const list = varietiesByField.get(row.field_id);
        if (!list.includes(row.variety_name)) {
            list.push(row.variety_name);
        }
    }
    return fieldsResult.rows.map((field) => {
        const varieties = varietiesByField.get(field.id) || [];
        return {
            ...field,
            varieties,
            variety_name: varieties[0] || null,
        };
    });
}
async function getWorkerSprayCalendarContext(workerId) {
    const result = await client_1.dbPool.query(`SELECT w.site_id,
            COALESCE(w.organization_id, s.organization_id) AS organization_id
     FROM workers w
     LEFT JOIN sites s ON s.id = w.site_id
     WHERE w.id = $1`, [workerId]);
    const row = result.rows[0];
    if (!row) {
        throw Object.assign(new Error('Worker not found'), { status: 404 });
    }
    return {
        siteId: row.site_id ?? null,
        organizationId: row.organization_id ?? null,
    };
}
async function getSprayCalendarForSite(siteId, organizationId, startDate, endDate) {
    const result = await ipmService.listPesticideApplications({
        organizationId,
        siteId,
        status: 'approved',
        startDate,
        endDate,
        calendarDateWindow: true,
        limit: 500,
    });
    return result.items.sort((a, b) => String(a.application_date).localeCompare(String(b.application_date)));
}
async function getSprayCalendarFields(siteId) {
    const result = await client_1.dbPool.query(`SELECT f.id, f.name
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1 AND f.deleted_at IS NULL
     ORDER BY f.name ASC`, [siteId]);
    return result.rows;
}
function blankToNull(value) {
    if (value == null)
        return null;
    const t = String(value).trim();
    return t === '' ? null : t;
}
async function listActivityReferences(organizationId, siteId) {
    await seedActivityReferencesIfEmpty(organizationId, siteId);
    const result = await client_1.dbPool.query(`SELECT id, organization_id, site_id, activity, crop, variety, unit, target, sheet,
            created_at, updated_at
     FROM manpower_activity_references
     WHERE organization_id = $1 AND site_id = $2
     ORDER BY crop ASC NULLS FIRST, variety ASC NULLS FIRST, activity ASC`, [organizationId, siteId]);
    return result.rows.map((row) => ({
        ...row,
        sheet: row.sheet || (0, manpowerReferenceSheets_1.referenceSheetForActivity)(row.activity),
    }));
}
async function seedActivityReferencesIfEmpty(organizationId, siteId) {
    const existing = await client_1.dbPool.query(`SELECT COUNT(*)::int AS n
     FROM manpower_activity_references
     WHERE organization_id = $1 AND site_id = $2`, [organizationId, siteId]);
    if (existing.rows[0].n > 0)
        return;
    const catalog = await client_1.dbPool.query(`SELECT name, default_unit FROM manpower_activities WHERE is_active = true ORDER BY name ASC`);
    if (catalog.rows.length === 0)
        return;
    const { siteCrops } = await getSiteCropAndVarietyLists(siteId);
    const seedRows = (0, manpowerReferenceSheets_1.buildReferenceSeedRows)(catalog.rows, siteCrops);
    if (seedRows.length === 0)
        return;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`manpower-ref-seed:${organizationId}:${siteId}`]);
        const again = await client.query(`SELECT COUNT(*)::int AS n
       FROM manpower_activity_references
       WHERE organization_id = $1 AND site_id = $2`, [organizationId, siteId]);
        if (again.rows[0].n > 0) {
            await client.query('COMMIT');
            return;
        }
        const insertSql = `
      INSERT INTO manpower_activity_references
        (organization_id, site_id, activity, crop, variety, unit, target, sheet)
      VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6)
      ON CONFLICT DO NOTHING`;
        for (const row of seedRows) {
            await client.query(insertSql, [
                organizationId,
                siteId,
                row.activity,
                row.crop,
                row.unit,
                row.sheet,
            ]);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function createActivityReference(data) {
    const activity = data.activity.trim();
    const sheet = (0, manpowerReferenceSheets_1.normalizeStoredSheet)(data.sheet, activity);
    const result = await client_1.dbPool.query(`INSERT INTO manpower_activity_references
       (organization_id, site_id, activity, crop, variety, unit, target, sheet, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, organization_id, site_id, activity, crop, variety, unit, target, sheet,
               created_at, updated_at`, [
        data.organizationId,
        data.siteId,
        activity,
        blankToNull(data.crop),
        blankToNull(data.variety),
        blankToNull(data.unit),
        data.target == null || Number.isNaN(Number(data.target)) ? null : Number(data.target),
        sheet,
        data.createdBy || null,
    ]);
    const created = result.rows[0];
    await ensureManpowerActivity(created.activity, created.unit);
    return created;
}
async function updateActivityReference(id, organizationId, data) {
    const existing = await client_1.dbPool.query(`SELECT * FROM manpower_activity_references WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
    if (existing.rows.length === 0) {
        throw new errors_1.NotFoundError('Reference not found');
    }
    const row = existing.rows[0];
    const activity = data.activity != null ? data.activity.trim() : row.activity;
    const crop = data.crop !== undefined ? blankToNull(data.crop) : row.crop;
    const variety = data.variety !== undefined ? blankToNull(data.variety) : row.variety;
    const unit = data.unit !== undefined ? blankToNull(data.unit) : row.unit;
    const target = data.target !== undefined
        ? (data.target == null || Number.isNaN(Number(data.target)) ? null : Number(data.target))
        : row.target;
    const sheet = data.sheet !== undefined
        ? (0, manpowerReferenceSheets_1.normalizeStoredSheet)(data.sheet, activity)
        : (row.sheet || (0, manpowerReferenceSheets_1.referenceSheetForActivity)(activity));
    const result = await client_1.dbPool.query(`UPDATE manpower_activity_references
     SET activity = $3,
         crop = $4,
         variety = $5,
         unit = $6,
         target = $7,
         sheet = $8,
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING id, organization_id, site_id, activity, crop, variety, unit, target, sheet,
               created_at, updated_at`, [id, organizationId, activity, crop, variety, unit, target, sheet]);
    const updated = result.rows[0];
    await ensureManpowerActivity(updated.activity, updated.unit);
    return updated;
}
async function deleteActivityReference(id, organizationId) {
    const result = await client_1.dbPool.query(`DELETE FROM manpower_activity_references WHERE id = $1 AND organization_id = $2 RETURNING id`, [id, organizationId]);
    if (result.rows.length === 0) {
        throw new errors_1.NotFoundError('Reference not found');
    }
}
async function getPerformanceSummary(organizationId, filters) {
    const [rawRows, refs] = await Promise.all([
        fetchPivotRawRows(organizationId, {
            startDate: filters.startDate,
            endDate: filters.endDate,
            siteId: filters.siteId,
            approvedOnly: true,
        }),
        listActivityReferences(organizationId, filters.siteId),
    ]);
    const resolved = (0, manpowerDetailPivot_1.resolveAndNormalizeRows)(rawRows);
    const vsTarget = (0, manpowerPerformance_1.buildVsTargetRows)(resolved, refs);
    const workerSummary = (0, manpowerPerformance_1.buildWorkerSummary)(vsTarget);
    const overtime = (0, manpowerPerformance_1.buildOvertimeRows)(resolved);
    return {
        startDate: filters.startDate,
        endDate: filters.endDate,
        vsTarget,
        workerSummary,
        overtime,
    };
}
