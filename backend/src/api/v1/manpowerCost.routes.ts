import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { assertCanEditManpowerRates, MANPOWER_COST_VIEW_ROLES } from '../../utils/roleAccess';
import * as manpowerCostService from '../../services/manpowerCost.service';

export const manpowerCostRouter = Router();
manpowerCostRouter.use(auth);
manpowerCostRouter.use(authorize(...MANPOWER_COST_VIEW_ROLES));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const rateAmount = z.number().min(0).max(100000);

const idSchema = z.object({ id: z.string().uuid() });

const ratesQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
});

const periodQuerySchema = z.object({
  start_date: isoDate,
  end_date: isoDate,
  site_id: z.string().uuid().optional(),
});

const groupRateSchema = z.object({
  siteId: z.string().uuid(),
  category: z.enum(['Casual', 'Permanent']),
  ratePerHour: rateAmount,
  effectiveFrom: isoDate,
  note: z.string().max(500).nullable().optional(),
});

const workerRateSchema = z.object({
  workerId: z.string().uuid(),
  ratePerHour: rateAmount.nullable(),
  effectiveFrom: isoDate,
  note: z.string().max(500).nullable().optional(),
});

function periodFilters(req: AuthRequest) {
  const { start_date, end_date, site_id } = req.query as z.infer<typeof periodQuerySchema>;
  if (start_date > end_date) {
    throw new AppError('start_date must be on or before end_date', 'VALIDATION_ERROR', 400);
  }
  return { startDate: start_date, endDate: end_date, siteId: site_id };
}

// ─── RATES ───────────────────────────────────────────────────────────────────

manpowerCostRouter.get('/rates', validate({ query: ratesQuerySchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await manpowerCostService.listRates(requireOrgId(req), {
    siteId: req.query.site_id as string | undefined,
  });
  res.json({ success: true, data });
}));

manpowerCostRouter.post('/rates/group', validate({ body: groupRateSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanEditManpowerRates(req.user!);
  const data = req.body as z.infer<typeof groupRateSchema>;
  const rate = await manpowerCostService.setGroupRate(requireOrgId(req), req.user!.userId, data);
  res.status(201).json({ success: true, data: rate });
}));

manpowerCostRouter.post('/rates/worker', validate({ body: workerRateSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanEditManpowerRates(req.user!);
  const data = req.body as z.infer<typeof workerRateSchema>;
  const rate = await manpowerCostService.setWorkerRate(requireOrgId(req), req.user!.userId, data);
  res.status(201).json({ success: true, data: rate });
}));

manpowerCostRouter.delete('/rates/:id', validate({ params: idSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  assertCanEditManpowerRates(req.user!);
  await manpowerCostService.deleteRate(requireOrgId(req), req.user!.userId, req.params.id);
  res.json({ success: true, data: { deleted: true } });
}));

// ─── COST ────────────────────────────────────────────────────────────────────

manpowerCostRouter.get('/detail', validate({ query: periodQuerySchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await manpowerCostService.getCostDetail(requireOrgId(req), periodFilters(req));
  res.json({ success: true, data });
}));

manpowerCostRouter.get('/summary', validate({ query: periodQuerySchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await manpowerCostService.getCostSummary(requireOrgId(req), periodFilters(req));
  res.json({ success: true, data });
}));
