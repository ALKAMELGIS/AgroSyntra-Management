import { Router, Response } from 'express';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';

const activityRouter = Router();
activityRouter.use(auth);

/** GET /activity - recent activity for the feed (managers+ see all, workers see own) */
activityRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
  const role = req.user!.role;
  const userId = req.user!.userId;

  const isManager = ['ceo', 'farm_manager', 'operation_manager'].includes(role);

  const result = await dbPool.query(
    `SELECT
       al.id,
       al.action,
       al.entity AS entity_type,
       al.entity_id,
       al.created_at,
       u.name as user_name,
       u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.action IN ('CREATE', 'UPDATE', 'DELETE')
       AND al.entity IN ('harvest', 'fertigation_entry', 'ecph_entry', 'task', 'field', 'alert_event')
       ${isManager ? '' : 'AND al.user_id = $2'}
     ORDER BY al.created_at DESC
     LIMIT $1`,
    isManager ? [limit] : [limit, userId]
  );

  res.json({ success: true, data: result.rows });
}));

export { activityRouter };
