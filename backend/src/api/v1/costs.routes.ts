import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { listCosts, createCost, updateCost, deleteCost, getCostSummary } from '../../services/cost.service';

const createCostSchema = z.object({
  field_id: z.string().uuid(),
  category: z.string().min(1),
  amount: z.number().min(0),
  currency: z.string().optional(),
  description: z.string().optional(),
  date: z.string(),
});

const updateCostSchema = z.object({
  field_id: z.string().uuid().optional(),
  category: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
});

const costsRouter = Router();
costsRouter.use(auth);
/** Cost entry create/edit/delete: operations manager and worker only. */
export const requireCostWriter = authorize('operation_manager', 'worker');

/** GET /costs - list cost entries with filters + role scoping */
costsRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const role = req.user!.role;
  const userId = req.user!.userId;

  const result = await listCosts({
    organizationId: requireOrgId(req),
    field_id: req.query.field_id as string,
    category: req.query.category as string,
    start_date: req.query.start_date as string,
    end_date: req.query.end_date as string,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    created_by: ['worker', 'team_leader'].includes(role) ? userId : undefined,
  });
  res.json({ success: true, data: result.costs, meta: { total: result.total } });
}));

/** GET /costs/summary - aggregated cost summary */
costsRouter.get('/summary', asyncHandler(async (req: AuthRequest, res: Response) => {
  const summary = await getCostSummary({
    organizationId: requireOrgId(req),
    field_id: req.query.field_id as string,
    start_date: req.query.start_date as string,
    end_date: req.query.end_date as string,
  });
  res.json({ success: true, data: summary });
}));

/** POST /costs - create cost entry */
costsRouter.post('/', requireCostWriter, validate({ body: createCostSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const cost = await createCost({ ...req.body, created_by: req.user!.userId });
  res.status(201).json({ success: true, data: cost });
}));

/** PUT /costs/:id - update cost entry (OM / worker) */
costsRouter.put('/:id', requireCostWriter, validate({ body: updateCostSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const cost = await updateCost(req.params.id, req.body);
  res.json({ success: true, data: cost });
}));

/** DELETE /costs/:id - delete cost entry (OM / worker) */
costsRouter.delete('/:id', requireCostWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteCost(req.params.id);
  res.json({ success: true });
}));

export { costsRouter };
