import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { requireOrgId } from '../middleware/tenant';
import { AppError } from '../../utils/errors';
import { logAuditEvent } from '../../services/auditLog.service';
import {
  assertCanManageSeasons,
  closeSeason,
  countPendingSeasonReopenRequests,
  createSeason,
  deleteSeason,
  getOpenSeason,
  getSeasonById,
  listSeasonReopenRequests,
  listSeasons,
  requestSeasonReopen,
  reviewSeasonReopen,
  startOpenSeason,
  todayYmd,
  toYmd,
  updateSeason,
  type SeasonReopenRequestRow,
  type SeasonsDb,
} from '../../services/seasons.service';
import { UserRole } from '../../models/user.model';
import { AssignmentRepository } from '../../repositories/assignment.repository';

export const seasonsRouter = Router();
const assignmentRepo = new AssignmentRepository();
seasonsRouter.use(auth);

const uuidQuery = z.string().uuid();
const SEASON_MANAGERS: UserRole[] = ['farm_manager', 'operation_manager'];

function requireActor(req: AuthRequest): { userId: string; role: UserRole } {
  const userId = req.user?.userId;
  const role = req.user?.role;
  if (!userId || !role) {
    throw new AppError('Authentication required', 'UNAUTHORIZED', 401);
  }
  return { userId, role };
}

/** Season reads follow site access: the caller must be able to reach the site. */
async function assertCanViewSite(req: AuthRequest, siteId: string): Promise<void> {
  const orgId = requireOrgId(req);
  const { userId, role } = requireActor(req);
  const canView = await assignmentRepo.canUserAccessSite(userId, role, siteId, orgId);
  if (!canView) {
    throw new AppError('You do not have access to this site', 'FORBIDDEN', 403);
  }
}

seasonsRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = uuidQuery.safeParse(req.query.site_id);
    if (!parsed.success) {
      throw new AppError('site_id is required', 'VALIDATION_ERROR', 400);
    }
    await assertCanViewSite(req, parsed.data);
    const rows = await listSeasons(parsed.data);
    res.json({ success: true, data: rows });
  }),
);

seasonsRouter.get(
  '/open',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = uuidQuery.safeParse(req.query.site_id);
    if (!parsed.success) {
      throw new AppError('site_id is required', 'VALIDATION_ERROR', 400);
    }
    await assertCanViewSite(req, parsed.data);
    const open = await getOpenSeason(parsed.data);
    res.json({ success: true, data: open });
  }),
);

function mapReopenRequest(row: SeasonReopenRequestRow) {
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

async function withSeasonTx<T>(fn: (client: SeasonsDb) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const reopenStatusQuery = z.enum(['pending', 'approved', 'rejected']).optional().or(z.literal(''));

seasonsRouter.get(
  '/reopen-requests',
  authorize('auditor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const parsed = reopenStatusQuery.safeParse(req.query.status);
    if (!parsed.success) {
      throw new AppError('Invalid status', 'VALIDATION_ERROR', 400);
    }
    const rows = await listSeasonReopenRequests({
      organizationId: orgId,
      status: parsed.data || undefined,
    });
    res.json({ success: true, data: rows.map(mapReopenRequest) });
  }),
);

seasonsRouter.get(
  '/reopen-requests/pending-count',
  authorize('auditor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const count = await countPendingSeasonReopenRequests(orgId);
    res.json({ success: true, data: { count } });
  }),
);

seasonsRouter.post(
  '/reopen-requests/:requestId/approve',
  authorize('auditor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 'UNAUTHORIZED', 401);
    }
    const data = z.object({
      reviewerComment: z.string().optional(),
    }).parse(req.body ?? {});
    const result = await withSeasonTx((client) => reviewSeasonReopen({
      requestId: req.params.requestId,
      decision: 'approved',
      userId,
      organizationId: orgId,
      comment: data.reviewerComment,
    }, client));
    await logAuditEvent({
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
  }),
);

seasonsRouter.post(
  '/reopen-requests/:requestId/reject',
  authorize('auditor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 'UNAUTHORIZED', 401);
    }
    const data = z.object({
      reviewerComment: z.string().optional(),
    }).parse(req.body ?? {});
    const result = await withSeasonTx((client) => reviewSeasonReopen({
      requestId: req.params.requestId,
      decision: 'rejected',
      userId,
      organizationId: orgId,
      comment: data.reviewerComment,
    }, client));
    await logAuditEvent({
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
  }),
);

seasonsRouter.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const season = uuidQuery.safeParse(req.params.id).success
      ? await getSeasonById(req.params.id)
      : null;
    if (!season || (season.organization_id && season.organization_id !== orgId)) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    const { userId, role } = requireActor(req);
    const canView = await assignmentRepo.canUserAccessSite(userId, role, season.site_id, orgId);
    if (!canView) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    res.json({ success: true, data: season });
  }),
);

const createSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1),
  startDate: z.string().min(1),
  plannedEndDate: z.string().min(1),
  status: z.enum(['open', 'closed']).optional(),
});

const startSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  plannedEndDate: z.string().min(1).optional(),
});

seasonsRouter.post(
  '/',
  authorize(...SEASON_MANAGERS),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createSchema.parse(req.body);
    const orgId = requireOrgId(req);
    const { userId, role } = requireActor(req);
    await assertCanManageSeasons(userId, role, data.siteId, orgId);
    const season = await createSeason({
      organizationId: orgId,
      siteId: data.siteId,
      name: data.name,
      startDate: data.startDate,
      plannedEndDate: data.plannedEndDate,
      status: data.status,
    });
    res.status(201).json({ success: true, data: season });
  }),
);

seasonsRouter.post(
  '/start',
  authorize(...SEASON_MANAGERS),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = startSchema.parse(req.body);
    const orgId = requireOrgId(req);
    const { userId, role } = requireActor(req);
    await assertCanManageSeasons(userId, role, data.siteId, orgId);
    const season = await startOpenSeason({
      organizationId: orgId,
      siteId: data.siteId,
      name: data.name,
      startDate: data.startDate,
      plannedEndDate: data.plannedEndDate,
    });
    res.status(201).json({ success: true, data: season });
  }),
);

seasonsRouter.post(
  '/:id/close',
  authorize(...SEASON_MANAGERS),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = z.object({
      confirmation: z.literal('END SEASON'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.body);
    const orgId = requireOrgId(req);
    const { userId, role } = requireActor(req);
    const current = await getSeasonById(req.params.id);
    if (!current) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    await assertCanManageSeasons(userId, role, current.site_id, orgId);

    const farmToday = todayYmd();
    const endDate = data.endDate || farmToday;
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const result = await closeSeason(
        {
          seasonId: req.params.id,
          endDate,
          userId,
          organizationId: orgId,
          today: farmToday,
        },
        client,
      );
      await client.query('COMMIT');
      const closedEnd = toYmd(result.closed.end_date) || endDate;
      await logAuditEvent({
        userId,
        action: 'UPDATE',
        entity: 'season',
        entityId: result.closed.id,
        changes: {
          end_date: { old: null, new: closedEnd },
        },
        metadata: {
          name: result.closed.name,
          endDate: closedEnd,
          farmToday,
          endDateOverride: closedEnd !== farmToday,
          ofpRowsUprooted: result.ofpRowsUprooted,
          prRowsUprooted: result.prRowsUprooted,
          cropHistoryClosed: result.cropHistoryClosed,
        },
      });
      res.json({ success: true, data: result });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

seasonsRouter.post(
  '/:id/reopen-request',
  authorize(...SEASON_MANAGERS),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = z.object({
      reason: z.string().min(1),
    }).parse(req.body);
    const orgId = requireOrgId(req);
    const { userId, role } = requireActor(req);
    // Only a manager of the season's site may ask for a reopen.
    const current = await getSeasonById(req.params.id);
    if (!current || (current.organization_id && current.organization_id !== orgId)) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    await assertCanManageSeasons(userId, role, current.site_id, orgId);
    const request = await withSeasonTx((client) => requestSeasonReopen({
      seasonId: req.params.id,
      reason: data.reason,
      userId,
      organizationId: orgId,
    }, client));
    await logAuditEvent({
      userId,
      action: 'CREATE',
      entity: 'season',
      entityId: request.season_id,
      metadata: { reopenRequestId: request.id, reason: request.reason },
    });
    res.status(201).json({ success: true, data: mapReopenRequest(request) });
  }),
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

seasonsRouter.put(
  '/:id',
  authorize(...SEASON_MANAGERS),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateSchema.parse(req.body);
    const orgId = requireOrgId(req);
    const { userId, role } = requireActor(req);
    const current = await getSeasonById(req.params.id);
    if (!current) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    if (current.organization_id && current.organization_id !== orgId) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    await assertCanManageSeasons(userId, role, current.site_id, orgId);
    const farmToday = todayYmd();
    const season = await updateSeason(req.params.id, { ...data, today: farmToday });
    const changes: Record<string, { old: string | null; new: string | null }> = {};
    if (current.name !== season.name) {
      changes.name = { old: current.name, new: season.name };
    }
    const oldEnd = toYmd(current.end_date) || null;
    const newEnd = toYmd(season.end_date) || null;
    if (oldEnd !== newEnd) {
      changes.end_date = { old: oldEnd, new: newEnd };
    }
    const oldPlanned = toYmd(current.planned_end_date);
    const newPlanned = toYmd(season.planned_end_date);
    if (oldPlanned !== newPlanned) {
      changes.planned_end_date = { old: oldPlanned, new: newPlanned };
    }
    await logAuditEvent({
      userId,
      action: 'UPDATE',
      entity: 'season',
      entityId: season.id,
      changes,
      metadata: {
        name: season.name,
        endDate: newEnd,
        farmToday,
        endDateOverride: Boolean(data.endDate && newEnd && newEnd !== farmToday),
      },
    });
    res.json({ success: true, data: season });
  }),
);

seasonsRouter.delete(
  '/:id',
  authorize(...SEASON_MANAGERS),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const { userId, role } = requireActor(req);
    const current = await getSeasonById(req.params.id);
    if (!current) {
      throw new AppError('Season not found', 'NOT_FOUND', 404);
    }
    await assertCanManageSeasons(userId, role, current.site_id, orgId);
    const result = await withSeasonTx((client) => deleteSeason({
      seasonId: req.params.id,
      organizationId: orgId,
    }, client));
    await logAuditEvent({
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
  }),
);
