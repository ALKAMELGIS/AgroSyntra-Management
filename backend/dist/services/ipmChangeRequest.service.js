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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChangeRequest = createChangeRequest;
exports.listChangeRequests = listChangeRequests;
exports.reviewChangeRequest = reviewChangeRequest;
exports.getPendingRequestForEntity = getPendingRequestForEntity;
exports.countPendingChangeRequests = countPendingChangeRequests;
exports.getPendingChangeRequestBadgeCount = getPendingChangeRequestBadgeCount;
const client_1 = require("../db/client");
const push_notification_service_1 = require("./push-notification.service");
const websocket_1 = require("../websocket");
const errors_1 = require("../utils/errors");
const ipmAccess_1 = require("../utils/ipmAccess");
const changeRequestAccess_1 = require("../utils/changeRequestAccess");
const roleAccess_1 = require("../utils/roleAccess");
const ipmService = __importStar(require("./ipm.service"));
const manpowerService = __importStar(require("./manpower.service"));
const auditLog_service_1 = require("./auditLog.service");
function parseJsonField(value) {
    if (!value)
        return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        }
        catch {
            return {};
        }
    }
    if (typeof value === 'object')
        return value;
    return {};
}
function mapChangeRequest(row) {
    return {
        id: row.id,
        organizationId: row.organization_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        requestedBy: row.requested_by,
        requestedByName: row.requested_by_name,
        requestedByEmail: row.requested_by_email,
        reason: row.reason,
        proposedPayload: row.proposed_payload,
        snapshotBefore: row.snapshot_before,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedByName: row.reviewed_by_name,
        reviewedAt: row.reviewed_at,
        reviewerComment: row.reviewer_comment,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
const PESTICIDE_SNAPSHOT_SQL = `SELECT pa.*, f.name AS field_name, pp.name AS product_name,
            COALESCE(pa.crop_name, c.name) AS crop_name,
            c.name AS field_crop_name
     FROM pesticide_applications pa
     LEFT JOIN fields f ON f.id = pa.field_id
     LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     WHERE pa.id = ANY($1::uuid[])`;
function uniqueEntityIds(ids) {
    return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}
function compactPesticideSnapshot(row) {
    return {
        id: row.id,
        field_name: row.field_name ?? null,
        crop_name: row.crop_name ?? row.field_crop_name ?? null,
        product_name: row.product_name ?? null,
        application_date: row.application_date ?? null,
    };
}
function pesticideDeleteIdsFromPayload(payload, fallbackId) {
    const raw = payload.entityIds;
    if (Array.isArray(raw) && raw.length > 0) {
        return uniqueEntityIds(raw.map((id) => String(id)));
    }
    return fallbackId ? [fallbackId] : [];
}
async function getPesticideSnapshots(ids) {
    const uniqueIds = uniqueEntityIds(ids);
    const result = await client_1.dbPool.query(PESTICIDE_SNAPSHOT_SQL, [uniqueIds]);
    if (result.rows.length !== uniqueIds.length) {
        throw new errors_1.NotFoundError('Pesticide application not found');
    }
    const byId = new Map(result.rows.map((row) => [String(row.id), row]));
    return uniqueIds.map((id) => {
        const row = byId.get(id);
        if (!row)
            throw new errors_1.NotFoundError('Pesticide application not found');
        return row;
    });
}
async function getEntitySnapshot(entityType, id, organizationId) {
    if (entityType === ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
        return ipmService.getBumbleBeeBoxInspection(id);
    }
    if (entityType === changeRequestAccess_1.ENTITY_MANPOWER_RECORD) {
        if (!organizationId) {
            throw new errors_1.AppError('Organization context is required for manpower change requests', 'VALIDATION_ERROR', 400);
        }
        return manpowerService.getRecordById(id, organizationId);
    }
    const rows = await getPesticideSnapshots([id]);
    return rows[0];
}
function inspectionRowToComparablePayload(row) {
    return {
        inspectionDate: String(row.inspection_date || '').split('T')[0],
        boxes100: Number(row.boxes_100) || 0,
        boxes80: Number(row.boxes_80) || 0,
        boxes60: Number(row.boxes_60) || 0,
        boxes40: Number(row.boxes_40) || 0,
        boxes20: Number(row.boxes_20) || 0,
        boxes0: Number(row.boxes_0) || 0,
        notes: String(row.notes ?? ''),
    };
}
function inspectionProposedToComparablePayload(proposed) {
    return {
        inspectionDate: String(proposed.inspectionDate || '').split('T')[0],
        boxes100: Number(proposed.boxes100) || 0,
        boxes80: Number(proposed.boxes80) || 0,
        boxes60: Number(proposed.boxes60) || 0,
        boxes40: Number(proposed.boxes40) || 0,
        boxes20: Number(proposed.boxes20) || 0,
        boxes0: Number(proposed.boxes0) || 0,
        notes: String(proposed.notes ?? ''),
    };
}
function inspectionProposedMatchesRow(row, proposed) {
    const a = inspectionRowToComparablePayload(row);
    const b = inspectionProposedToComparablePayload(proposed);
    return a.inspectionDate === b.inspectionDate
        && a.boxes100 === b.boxes100
        && a.boxes80 === b.boxes80
        && a.boxes60 === b.boxes60
        && a.boxes40 === b.boxes40
        && a.boxes20 === b.boxes20
        && a.boxes0 === b.boxes0
        && a.notes === b.notes;
}
function manpowerRowToComparablePayload(row) {
    return {
        activity: String(row.activity ?? ''),
        unit: String(row.unit ?? ''),
        variety: String(row.variety ?? ''),
        location: String(row.location ?? ''),
        section: String(row.section ?? ''),
        startTime: String(row.start_time ?? '').substring(0, 5),
        endTime: String(row.end_time ?? '').substring(0, 5),
        target: row.target == null ? '' : String(row.target),
        actual: row.actual == null ? '' : String(row.actual),
        workHours: row.work_hours == null ? '' : String(row.work_hours),
        overtime: row.overtime == null ? '' : String(row.overtime),
        totalHours: row.total_hours == null ? '' : String(row.total_hours),
    };
}
function manpowerProposedToComparablePayload(proposed) {
    return {
        activity: String(proposed.activity ?? ''),
        unit: String(proposed.unit ?? ''),
        variety: String(proposed.variety ?? ''),
        location: String(proposed.location ?? ''),
        section: String(proposed.section ?? ''),
        startTime: String(proposed.startTime ?? '').substring(0, 5),
        endTime: String(proposed.endTime ?? '').substring(0, 5),
        target: proposed.target == null ? '' : String(proposed.target),
        actual: proposed.actual == null ? '' : String(proposed.actual),
        workHours: proposed.workHours == null ? '' : String(proposed.workHours),
        overtime: proposed.overtime == null ? '' : String(proposed.overtime),
        totalHours: proposed.totalHours == null ? '' : String(proposed.totalHours),
    };
}
function manpowerProposedMatchesRow(row, proposed) {
    const a = manpowerRowToComparablePayload(row);
    const b = manpowerProposedToComparablePayload(proposed);
    return Object.keys(a).every((key) => a[key] === b[key]);
}
async function notifyUsersByRoles(roles, opts) {
    if (roles.length === 0)
        return;
    const rolePlaceholders = roles.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await client_1.dbPool.query(`SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND is_active = true`, roles);
    if (usersResult.rows.length === 0)
        return;
    const alertResult = await client_1.dbPool.query(`INSERT INTO alert_events (entity_type, entity_id, severity, title, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`, [opts.entityType, opts.entityId, opts.severity, opts.title, opts.message]);
    const alertEvent = alertResult.rows[0];
    const values = [];
    const params = [alertEvent.id, opts.title, opts.message, opts.severity];
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
            title: opts.title,
            body: opts.message,
            type: 'alert',
            data: {
                entityType: opts.entityType,
                path: opts.path,
                entityId: opts.entityId,
            },
        }).catch(() => { });
    }
}
async function notifyUser(userId, opts) {
    const alertResult = await client_1.dbPool.query(`INSERT INTO alert_events (entity_type, entity_id, severity, title, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`, [opts.entityType, opts.entityId, opts.severity, opts.title, opts.message]);
    const alertEvent = alertResult.rows[0];
    await client_1.dbPool.query(`INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ($1, $2, $3, $4, $5)`, [userId, alertEvent.id, opts.title, opts.message, opts.severity]);
    (0, websocket_1.emitAlert)(alertEvent, userId);
    push_notification_service_1.pushNotificationService.sendToUser(userId, {
        title: opts.title,
        body: opts.message,
        type: 'alert',
        data: {
            entityType: opts.entityType,
            path: opts.path,
            entityId: opts.entityId,
        },
    }).catch(() => { });
}
function changeRequestEntityLabel(entityType) {
    switch (entityType) {
        case ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION:
            return 'bumble bee inspection';
        case changeRequestAccess_1.ENTITY_MANPOWER_RECORD:
            return 'manpower record';
        case ipmAccess_1.ENTITY_PESTICIDE_APPLICATION:
            return 'pesticide application';
        case changeRequestAccess_1.ENTITY_SEASON_REOPEN:
            return 'season reopen';
        default: {
            const _exhaustive = entityType;
            return _exhaustive;
        }
    }
}
async function assertNoPendingForEntities(entityType, entityIds) {
    const ids = uniqueEntityIds(entityIds);
    if (ids.length === 0)
        return;
    const existing = await client_1.dbPool.query(`SELECT id FROM ipm_change_requests
     WHERE entity_type = $1
       AND status = 'pending'
       AND (
         entity_id = ANY($2::uuid[])
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements_text(COALESCE(proposed_payload->'entityIds', '[]'::jsonb)) eid
           WHERE eid = ANY($3::text[])
         )
       )
     LIMIT 1`, [entityType, ids, ids]);
    if (existing.rows.length > 0) {
        throw new errors_1.AppError('A pending change request already exists for this record', 'CONFLICT', 409);
    }
}
async function createChangeRequest(actor, input) {
    const entityType = input.entityType || ipmAccess_1.ENTITY_PESTICIDE_APPLICATION;
    const requestedIds = uniqueEntityIds(input.entityIds?.length ? input.entityIds : input.entityId ? [input.entityId] : []);
    if (requestedIds.length === 0) {
        throw new errors_1.AppError('entityId or entityIds is required', 'VALIDATION_ERROR', 400);
    }
    if (requestedIds.length > 1 && (entityType !== ipmAccess_1.ENTITY_PESTICIDE_APPLICATION || input.action !== 'delete')) {
        throw new errors_1.AppError('Bulk change requests are only supported for pesticide application deletes', 'VALIDATION_ERROR', 400);
    }
    const entityId = requestedIds[0];
    const isBulkPesticideDelete = entityType === ipmAccess_1.ENTITY_PESTICIDE_APPLICATION
        && input.action === 'delete'
        && requestedIds.length > 1;
    if (entityType === changeRequestAccess_1.ENTITY_MANPOWER_RECORD) {
        (0, roleAccess_1.assertCanOperateWorkforce)(actor);
        if (!input.organizationId) {
            throw new errors_1.AppError('Organization context is required for manpower change requests', 'VALIDATION_ERROR', 400);
        }
    }
    else if (entityType === ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
        (0, ipmAccess_1.assertCanRequestInspectionChange)(actor);
        const inspection = await ipmService.getBumbleBeeBoxInspection(entityId);
        if (inspection.created_by !== actor.userId) {
            throw new errors_1.AppError('You can only request changes to your own inspections', 'FORBIDDEN', 403);
        }
        if ((0, ipmAccess_1.canScouterDirectModifyInspection)(actor, inspection)) {
            throw new errors_1.AppError('Use direct edit or delete within 3 minutes of saving; change requests are for later corrections', 'VALIDATION_ERROR', 400);
        }
    }
    else {
        (0, ipmAccess_1.assertCanRequestChange)(actor);
    }
    if (!input.reason?.trim()) {
        throw new errors_1.AppError('Reason is required for change requests', 'VALIDATION_ERROR', 400);
    }
    if (input.action === 'update' && (!input.proposedPayload || Object.keys(input.proposedPayload).length === 0)) {
        throw new errors_1.AppError('Proposed changes are required for update requests', 'VALIDATION_ERROR', 400);
    }
    let snapshotBefore;
    let pesticideRows = null;
    if (entityType === ipmAccess_1.ENTITY_PESTICIDE_APPLICATION) {
        pesticideRows = await getPesticideSnapshots(requestedIds);
        snapshotBefore = isBulkPesticideDelete
            ? {
                bulk: true,
                count: pesticideRows.length,
                records: pesticideRows.map(compactPesticideSnapshot),
            }
            : pesticideRows[0];
    }
    else {
        snapshotBefore = await getEntitySnapshot(entityType, entityId, input.organizationId);
    }
    if (entityType === ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
        const fieldId = String(snapshotBefore.field_id || '');
        if (fieldId) {
            const lastDeploy = await ipmService.getBumbleBeeLastForField(fieldId);
            if (lastDeploy) {
                snapshotBefore.deploy_total = Number(lastDeploy.box_count_total ?? lastDeploy.box_count);
            }
        }
    }
    if (entityType === changeRequestAccess_1.ENTITY_MANPOWER_RECORD) {
        const approvalStatus = String(snapshotBefore.approval_status || '');
        if (approvalStatus !== 'approved') {
            throw new errors_1.AppError('Change requests are only required for approved manpower records', 'VALIDATION_ERROR', 400);
        }
        if (input.action === 'update'
            && input.proposedPayload
            && manpowerProposedMatchesRow(snapshotBefore, input.proposedPayload)) {
            throw new errors_1.AppError('Proposed changes must differ from the current record', 'VALIDATION_ERROR', 400);
        }
    }
    else if (entityType === ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION
        && input.action === 'update'
        && input.proposedPayload
        && inspectionProposedMatchesRow(snapshotBefore, input.proposedPayload)) {
        throw new errors_1.AppError('Proposed changes must differ from the current inspection', 'VALIDATION_ERROR', 400);
    }
    await assertNoPendingForEntities(entityType, requestedIds);
    const orgId = input.organizationId
        || pesticideRows?.[0]?.organization_id
        || snapshotBefore.organization_id
        || null;
    const proposedPayload = isBulkPesticideDelete
        ? { entityIds: requestedIds }
        : input.proposedPayload;
    const result = await client_1.dbPool.query(`INSERT INTO ipm_change_requests
       (entity_type, entity_id, action, requested_by, reason, proposed_payload, snapshot_before, organization_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`, [
        entityType,
        entityId,
        input.action,
        actor.userId,
        input.reason.trim(),
        proposedPayload ? JSON.stringify(proposedPayload) : null,
        JSON.stringify(snapshotBefore),
        orgId,
    ]);
    const request = mapChangeRequest(result.rows[0]);
    await (0, auditLog_service_1.logAuditEvent)({
        userId: actor.userId,
        action: 'UPDATE',
        entity: entityType,
        entityId,
        metadata: {
            changeRequestId: request.id,
            changeAction: input.action,
            reason: input.reason.trim(),
            type: 'change_request_created',
            entityIds: isBulkPesticideDelete ? requestedIds : undefined,
        },
    });
    const label = changeRequestEntityLabel(entityType);
    const notifyMessage = isBulkPesticideDelete
        ? `Delete request for ${requestedIds.length} pesticide applications is pending your review.`
        : `A ${input.action} request for a ${label} is pending your review.`;
    notifyUsersByRoles((0, changeRequestAccess_1.reviewerRolesForEntityType)(entityType), {
        title: `Change request — ${label}`,
        message: notifyMessage,
        severity: 'info',
        entityType: 'change_request',
        entityId: request.id,
        path: '/audit/change-requests',
    }).catch(() => { });
    return request;
}
async function listChangeRequests(actor, opts) {
    if (!(0, changeRequestAccess_1.canListChangeRequests)(actor)) {
        throw new errors_1.AppError('You do not have permission to view change requests', 'FORBIDDEN', 403);
    }
    const reviewable = (0, changeRequestAccess_1.getReviewableEntityTypes)(actor).filter((type) => type !== changeRequestAccess_1.ENTITY_SEASON_REOPEN);
    if (reviewable.length === 0) {
        return [];
    }
    const params = [];
    const where = [];
    if (opts.entityType) {
        if (opts.entityType === changeRequestAccess_1.ENTITY_SEASON_REOPEN || !reviewable.includes(opts.entityType)) {
            return [];
        }
        params.push(opts.entityType);
        where.push(`cr.entity_type = $${params.length}`);
    }
    else {
        params.push(reviewable);
        where.push(`cr.entity_type = ANY($${params.length}::text[])`);
    }
    if (opts.status) {
        params.push(opts.status);
        where.push(`cr.status = $${params.length}`);
    }
    if (opts.entityId) {
        params.push(opts.entityId);
        where.push(`cr.entity_id = $${params.length}`);
    }
    const limit = Math.min(opts.limit || 100, 500);
    const offset = opts.offset || 0;
    params.push(limit, offset);
    const result = await client_1.dbPool.query(`SELECT cr.*,
            ru.name AS requested_by_name, ru.email AS requested_by_email,
            rv.name AS reviewed_by_name
     FROM ipm_change_requests cr
     LEFT JOIN users ru ON ru.id = cr.requested_by
     LEFT JOIN users rv ON rv.id = cr.reviewed_by
     WHERE ${where.join(' AND ')}
     ORDER BY cr.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return result.rows.map(mapChangeRequest);
}
async function reviewChangeRequest(actor, id, decision, reviewerComment, siteId) {
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const reqResult = await client.query(`SELECT * FROM ipm_change_requests WHERE id = $1 FOR UPDATE`, [id]);
        if (reqResult.rows.length === 0) {
            throw new errors_1.NotFoundError('Change request not found');
        }
        const row = reqResult.rows[0];
        (0, changeRequestAccess_1.assertCanReviewEntityChangeRequest)(actor, row.entity_type);
        if (row.status !== 'pending') {
            throw new errors_1.AppError('Change request is no longer pending', 'CONFLICT', 409);
        }
        if (decision === 'approved') {
            if (row.entity_type === changeRequestAccess_1.ENTITY_MANPOWER_RECORD) {
                const snapshot = parseJsonField(row.snapshot_before);
                const orgId = String(snapshot.organization_id || '');
                if (!orgId) {
                    throw new errors_1.AppError('Manpower record organization missing from snapshot', 'VALIDATION_ERROR', 400);
                }
                if (row.action === 'delete') {
                    await manpowerService.deleteRecord(row.entity_id, orgId);
                }
                else {
                    const payload = parseJsonField(row.proposed_payload);
                    await manpowerService.updateRecord(row.entity_id, orgId, payload);
                }
            }
            else if (row.entity_type === ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION) {
                if (row.action === 'delete') {
                    await ipmService.deleteBumbleBeeBoxInspection(row.entity_id);
                }
                else {
                    const payload = parseJsonField(row.proposed_payload);
                    await ipmService.updateBumbleBeeBoxInspection(row.entity_id, payload, {
                        skipDeployTotalCheck: true,
                    });
                }
            }
            else if (row.action === 'delete') {
                const payload = parseJsonField(row.proposed_payload);
                const ids = pesticideDeleteIdsFromPayload(payload, row.entity_id);
                if (ids.length > 1) {
                    const orgId = String(row.organization_id || '');
                    if (!orgId) {
                        throw new errors_1.AppError('Organization context is required to approve bulk deletes', 'VALIDATION_ERROR', 400);
                    }
                    await ipmService.bulkDeletePesticideApplications(ids, orgId);
                }
                else {
                    await ipmService.deletePesticideApplication(ids[0] || row.entity_id);
                }
            }
            else {
                const payload = parseJsonField(row.proposed_payload);
                const payloadSiteId = typeof payload.siteId === 'string' ? payload.siteId : null;
                await ipmService.updatePesticideApplication(row.entity_id, payload, row.requested_by, siteId || payloadSiteId);
            }
        }
        const updated = await client.query(`UPDATE ipm_change_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
           reviewer_comment = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`, [decision, actor.userId, reviewerComment?.trim() || null, id]);
        await client.query('COMMIT');
        const request = mapChangeRequest(updated.rows[0]);
        await (0, auditLog_service_1.logAuditEvent)({
            userId: actor.userId,
            action: 'UPDATE',
            entity: row.entity_type,
            entityId: row.entity_id,
            metadata: {
                changeRequestId: id,
                decision,
                reviewerComment: reviewerComment?.trim() || null,
                changeAction: row.action,
                type: 'change_request_reviewed',
            },
        });
        const label = changeRequestEntityLabel(row.entity_type);
        notifyUser(row.requested_by, {
            title: `Change request ${decision}`,
            message: `Your ${row.action} request for a ${label} was ${decision}.${reviewerComment?.trim() ? ` Comment: ${reviewerComment.trim()}` : ''}`,
            severity: decision === 'approved' ? 'info' : 'warning',
            entityType: 'change_request',
            entityId: id,
            path: '/audit/change-requests',
        }).catch(() => { });
        return request;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function getPendingRequestForEntity(entityType, entityId) {
    const result = await client_1.dbPool.query(`SELECT cr.*, ru.name AS requested_by_name, ru.email AS requested_by_email
     FROM ipm_change_requests cr
     LEFT JOIN users ru ON ru.id = cr.requested_by
     WHERE cr.entity_type = $1 AND cr.entity_id = $2 AND cr.status = 'pending'
     ORDER BY cr.created_at DESC LIMIT 1`, [entityType, entityId]);
    return result.rows[0] ? mapChangeRequest(result.rows[0]) : null;
}
async function countPendingChangeRequests(organizationId) {
    const result = await client_1.dbPool.query(`SELECT entity_type, COUNT(*)::int AS count
     FROM ipm_change_requests
     WHERE status = 'pending' AND organization_id = $1
     GROUP BY entity_type`, [organizationId]);
    const counts = {
        pesticideApplicationCount: 0,
        bumbleBeeInspectionCount: 0,
        manpowerRecordCount: 0,
        seasonReopenCount: 0,
        totalCount: 0,
    };
    for (const row of result.rows) {
        const n = Number(row.count) || 0;
        counts.totalCount += n;
        switch (row.entity_type) {
            case ipmAccess_1.ENTITY_PESTICIDE_APPLICATION:
                counts.pesticideApplicationCount = n;
                break;
            case ipmAccess_1.ENTITY_BUMBLE_BEE_BOX_INSPECTION:
                counts.bumbleBeeInspectionCount = n;
                break;
            case changeRequestAccess_1.ENTITY_MANPOWER_RECORD:
                counts.manpowerRecordCount = n;
                break;
            default:
                break;
        }
    }
    return counts;
}
async function getPendingChangeRequestBadgeCount(actor, organizationId) {
    if (!(0, changeRequestAccess_1.canListChangeRequests)(actor))
        return 0;
    const counts = await countPendingChangeRequests(organizationId);
    return (0, changeRequestAccess_1.badgeCountForRole)(actor, counts);
}
