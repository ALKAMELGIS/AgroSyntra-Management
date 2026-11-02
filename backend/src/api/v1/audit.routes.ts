import { Router, Request, Response } from 'express';
import { queryAuditLogs, getEntityAuditHistory, getUserActivity, AuditEntity, AuditAction } from '../../services/auditLog.service';
import { auth, authorize } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';

const auditRouter = Router();

// Protect all audit routes - require authentication; only managers and above can view audit logs
auditRouter.use(auth);
auditRouter.use(authorize('ceo', 'farm_manager', 'operation_manager'));

/**
 * @swagger
 * /audit:
 *   get:
 *     summary: Query audit logs
 *     tags: [Audit]
 */
auditRouter.get('/', asyncHandler(async (req: Request, res: Response) => {
  const query = {
    userId: req.query.userId as string | undefined,
    entity: req.query.entity as AuditEntity | undefined,
    action: req.query.action as AuditAction | undefined,
    entityId: req.query.entityId as string | undefined,
    startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
    endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
  };

  const result = await queryAuditLogs(query);
  res.json({
    success: true,
    data: {
      logs: result.logs,
      pagination: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
    },
  });
}));

/**
 * @swagger
 * /audit/entity/{entity}/{entityId}:
 *   get:
 *     summary: Get audit history for a specific entity
 *     tags: [Audit]
 */
auditRouter.get('/entity/:entity/:entityId', asyncHandler(async (req: Request, res: Response) => {
  const { entity, entityId } = req.params;
  const logs = await getEntityAuditHistory(entity as AuditEntity, entityId);
  res.json({
    success: true,
    data: logs,
  });
}));

/**
 * @swagger
 * /audit/user/{userId}:
 *   get:
 *     summary: Get recent activity for a user
 *     tags: [Audit]
 */
auditRouter.get('/user/:userId', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const logs = await getUserActivity(userId, limit);
  res.json({
    success: true,
    data: logs,
  });
}));

export default auditRouter;
