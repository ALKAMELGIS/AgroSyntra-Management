"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seasonsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const auditLog_service_1 = require("../../services/auditLog.service");
const seasons_service_1 = require("../../services/seasons.service");
exports.seasonsRouter = (0, express_1.Router)();
exports.seasonsRouter.use(auth_1.auth);
const uuidQuery = zod_1.z.string().uuid();
const SEASON_MANAGERS = ['farm_manager', 'operation_manager'];
function requireActor(req) {
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) {
        throw new errors_1.AppError('Authentication required', 'UNAUTHORIZED', 401);
    }
    return { userId, role };
}
exports.seasonsRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const parsed = uuidQuery.safeParse(req.query.site_id);
    if (!parsed.success) {
        throw new errors_1.AppError('site_id is required', 'VALIDATION_ERROR', 400);
    }
    (0, tenant_1.requireOrgId)(req);
    const rows = await (0, seasons_service_1.listSeasons)(parsed.data);
    res.json({ success: true, data: rows });
}));
exports.seasonsRouter.get('/open', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const parsed = uuidQuery.safeParse(req.query.site_id);
    if (!parsed.success) {
        throw new errors_1.AppError('site_id is required', 'VALIDATION_ERROR', 400);
    }
    (0, tenant_1.requireOrgId)(req);
    const open = await (0, seasons_service_1.getOpenSeason)(parsed.data);
    res.json({ success: true, data: open });
}));
function mapReopenRequest(row) {
    return {
        id: row.id,
        entityType: 'season_reopen',
        seasonId: row.season_id,
        seasonName: row.season_name,
        siteId: row.site_id,
        siteName: row.site_name,
        reason: row.reason,
        status: row.status,
        requestedBy: row.requested_by,
        requestedByName: row.requested_by_name,
        requestedByEmail: row.requested_by_email,
        reviewedBy: row.reviewed_by,
        reviewedByName: row.reviewed_by_name,
        reviewedAt: row.reviewed_at,
        reviewerComment: row.reviewer_comment,
        createdAt: row.created_at,
    };
}
async function withSeasonTx(fn) {
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
const reopenStatusQuery = zod_1.z.enum(['pending', 'approved', 'rejected']).optional().or(zod_1.z.literal(''));
exports.seasonsRouter.get('/reopen-requests', (0, auth_1.authorize)('auditor'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const parsed = reopenStatusQuery.safeParse(req.query.status);
    if (!parsed.success) {
        throw new errors_1.AppError('Invalid status', 'VALIDATION_ERROR', 400);
    }
    const rows = await (0, seasons_service_1.listSeasonReopenRequests)({
        organizationId: orgId,
        status: parsed.data || undefined,
    });
    res.json({ success: true, data: rows.map(mapReopenRequest) });
}));
exports.seasonsRouter.get('/reopen-requests/pending-count', (0, auth_1.authorize)('auditor'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const count = await (0, seasons_service_1.countPendingSeasonReopenRequests)(orgId);
    res.json({ success: true, data: { count } });
}));
exports.seasonsRouter.post('/reopen-requests/:requestId/approve', (0, auth_1.authorize)('auditor'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const userId = req.user?.userId;
    if (!userId) {
        throw new errors_1.AppError('Authentication required', 'UNAUTHORIZED', 401);
    }
    const data = zod_1.z.object({
        reviewerComment: zod_1.z.string().optional(),
    }).parse(req.body ?? {});
    const result = await withSeasonTx((client) => (0, seasons_service_1.reviewSeasonReopen)({
        requestId: req.params.requestId,
        decision: 'approved',
        userId,
        organizationId: orgId,
        comment: data.reviewerComment,
    }, client));
    await (0, auditLog_service_1.logAuditEvent)({
        userId,
        action: 'UPDATE',
        entity: 'season',
        entityId: result.request.season_id,
        metadata: {
            reopenRequestId: result.request.id,
            decision: 'approved',
            discardedNextSeasonId: result.reopen?.discardedNextSeasonId,
            plantingsRestored: result.reopen?.plantingsRestored,
            cropHistoryReopened: result.reopen?.cropHistoryReopened,
        },
    });
    res.json({ success: true, data: { request: mapReopenRequest(result.request), reopen: result.reopen } });
}));
exports.seasonsRouter.post('/reopen-requests/:requestId/reject', (0, auth_1.authorize)('auditor'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const userId = req.user?.userId;
    if (!userId) {
        throw new errors_1.AppError('Authentication required', 'UNAUTHORIZED', 401);
    }
    const data = zod_1.z.object({
        reviewerComment: zod_1.z.string().optional(),
    }).parse(req.body ?? {});
    const result = await withSeasonTx((client) => (0, seasons_service_1.reviewSeasonReopen)({
        requestId: req.params.requestId,
        decision: 'rejected',
        userId,
        organizationId: orgId,
        comment: data.reviewerComment,
    }, client));
    await (0, auditLog_service_1.logAuditEvent)({
        userId,
        action: 'UPDATE',
        entity: 'season',
        entityId: result.request.season_id,
        metadata: {
            reopenRequestId: result.request.id,
            decision: 'rejected',
        },
    });
    res.json({ success: true, data: { request: mapReopenRequest(result.request) } });
}));
exports.seasonsRouter.get('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const season = await (0, seasons_service_1.getSeasonById)(req.params.id);
    if (!season) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    res.json({ success: true, data: season });
}));
const createSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    startDate: zod_1.z.string().min(1),
    plannedEndDate: zod_1.z.string().min(1),
    status: zod_1.z.enum(['open', 'closed']).optional(),
});
const startSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1).optional(),
    startDate: zod_1.z.string().min(1).optional(),
    plannedEndDate: zod_1.z.string().min(1).optional(),
});
exports.seasonsRouter.post('/', (0, auth_1.authorize)(...SEASON_MANAGERS), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = createSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const { userId, role } = requireActor(req);
    await (0, seasons_service_1.assertCanManageSeasons)(userId, role, data.siteId, orgId);
    const season = await (0, seasons_service_1.createSeason)({
        organizationId: orgId,
        siteId: data.siteId,
        name: data.name,
        startDate: data.startDate,
        plannedEndDate: data.plannedEndDate,
        status: data.status,
    });
    res.status(201).json({ success: true, data: season });
}));
exports.seasonsRouter.post('/start', (0, auth_1.authorize)(...SEASON_MANAGERS), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = startSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const { userId, role } = requireActor(req);
    await (0, seasons_service_1.assertCanManageSeasons)(userId, role, data.siteId, orgId);
    const season = await (0, seasons_service_1.startOpenSeason)({
        organizationId: orgId,
        siteId: data.siteId,
        name: data.name,
        startDate: data.startDate,
        plannedEndDate: data.plannedEndDate,
    });
    res.status(201).json({ success: true, data: season });
}));
exports.seasonsRouter.post('/:id/close', (0, auth_1.authorize)(...SEASON_MANAGERS), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = zod_1.z.object({
        confirmation: zod_1.z.literal('END SEASON'),
        endDate: zod_1.z.string().min(1).optional(),
    }).parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const { userId, role } = requireActor(req);
    const current = await (0, seasons_service_1.getSeasonById)(req.params.id);
    if (!current) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    await (0, seasons_service_1.assertCanManageSeasons)(userId, role, current.site_id, orgId);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const result = await (0, seasons_service_1.closeSeason)({
            seasonId: req.params.id,
            endDate: data.endDate || (0, seasons_service_1.todayYmd)(),
            userId,
            organizationId: orgId,
        }, client);
        await client.query('COMMIT');
        await (0, auditLog_service_1.logAuditEvent)({
            userId,
            action: 'UPDATE',
            entity: 'season',
            entityId: result.closed.id,
            metadata: {
                name: result.closed.name,
                endDate: result.closed.end_date,
                ofpRowsUprooted: result.ofpRowsUprooted,
                prRowsUprooted: result.prRowsUprooted,
                cropHistoryClosed: result.cropHistoryClosed,
            },
        });
        res.json({ success: true, data: result });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.seasonsRouter.post('/:id/reopen-request', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = zod_1.z.object({
        reason: zod_1.z.string().min(1),
    }).parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const userId = req.user?.userId;
    if (!userId) {
        throw new errors_1.AppError('Authentication required', 'UNAUTHORIZED', 401);
    }
    const request = await withSeasonTx((client) => (0, seasons_service_1.requestSeasonReopen)({
        seasonId: req.params.id,
        reason: data.reason,
        userId,
        organizationId: orgId,
    }, client));
    await (0, auditLog_service_1.logAuditEvent)({
        userId,
        action: 'CREATE',
        entity: 'season',
        entityId: request.season_id,
        metadata: { reopenRequestId: request.id, reason: request.reason },
    });
    res.status(201).json({ success: true, data: mapReopenRequest(request) });
}));
const updateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    startDate: zod_1.z.string().min(1).optional(),
    plannedEndDate: zod_1.z.string().min(1).optional(),
});
exports.seasonsRouter.put('/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const season = await (0, seasons_service_1.updateSeason)(req.params.id, data);
    res.json({ success: true, data: season });
}));
exports.seasonsRouter.delete('/:id', (0, auth_1.authorize)(...SEASON_MANAGERS), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const { userId, role } = requireActor(req);
    const current = await (0, seasons_service_1.getSeasonById)(req.params.id);
    if (!current) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    await (0, seasons_service_1.assertCanManageSeasons)(userId, role, current.site_id, orgId);
    const result = await withSeasonTx((client) => (0, seasons_service_1.deleteSeason)({
        seasonId: req.params.id,
        organizationId: orgId,
    }, client));
    await (0, auditLog_service_1.logAuditEvent)({
        userId,
        action: 'DELETE',
        entity: 'season',
        entityId: result.season.id,
        metadata: {
            name: result.season.name,
            siteId: result.season.site_id,
            ...result.deleted,
        },
    });
    res.json({ success: true, data: result });
}));
