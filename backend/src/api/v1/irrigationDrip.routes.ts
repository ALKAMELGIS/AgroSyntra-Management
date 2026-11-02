import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireOrgId } from '../middleware/tenant';
import { assertSiteInOrganization } from '../../utils/tenantValidation';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import {
  listEntries,
  replaceDays,
  deleteEntry,
  deleteDay,
} from '../../services/irrigationDrip.service';

export const irrigationDripRouter = Router();
irrigationDripRouter.use(auth);

const listQuerySchema = z.object({
  site_id: z.string().uuid(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const locationSchema = z.object({
  locationLabel: z.string().min(1),
  fieldId: z.string().uuid().nullable().optional(),
  valveRange: z.string().nullable().optional(),
  waterQtyM3: z.number().nullable().optional(),
  frequency: z.number().nullable().optional(),
  dailyWater: z.number().nullable().optional(),
  fertilizerType: z.string().nullable().optional(),
  fertilizerQty: z.number().nullable().optional(),
});

const daySchema = z.object({
  date: z.string().min(1),
  weekNumber: z.number().int().nullable().optional(),
  method: z.string().nullable().optional(),
  flowRateM3: z.number().nullable().optional(),
  operatorName: z.string().nullable().optional(),
  authorizedBy: z.string().nullable().optional(),
  locations: z.array(locationSchema),
});

const bulkSchema = z.object({
  siteId: z.string().uuid(),
  days: z.array(daySchema).min(1),
});

const idSchema = z.object({ id: z.string().uuid() });

const deleteDayQuerySchema = z.object({
  site_id: z.string().uuid(),
  date: z.string().min(1),
  location_labels: z.string().optional(),
});

irrigationDripRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { site_id, start_date, end_date } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(site_id, orgId);
    const data = await listEntries(site_id, orgId, start_date, end_date);
    res.json({ success: true, data });
  }),
);

irrigationDripRouter.post(
  '/bulk',
  validate({ body: bulkSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const body = req.body as z.infer<typeof bulkSchema>;
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(body.siteId, orgId);
    const result = await replaceDays(body.siteId, orgId, body.days);
    res.json({ success: true, data: result });
  }),
);

irrigationDripRouter.delete(
  '/day',
  validate({ query: deleteDayQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const { site_id, date, location_labels } = req.query as unknown as z.infer<typeof deleteDayQuerySchema>;
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(site_id, orgId);
    const labels = location_labels
      ? location_labels.split(',').map((l) => l.trim()).filter(Boolean)
      : undefined;
    const count = await deleteDay(site_id, date, orgId, labels);
    res.json({ success: true, data: { count } });
  }),
);

irrigationDripRouter.delete(
  '/:id',
  validate({ params: idSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const orgId = requireOrgId(req);
    await deleteEntry(req.params.id, orgId);
    res.json({ success: true });
  }),
);
