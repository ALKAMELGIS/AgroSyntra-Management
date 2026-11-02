import { Router } from 'express';
import { z } from 'zod';
import { auth, AuthRequest, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listThresholds, upsertThreshold, deleteThreshold, getValidParameters,
} from '../../services/agronomicReference.service';

export const agronomicRouter = Router();

agronomicRouter.use(auth);

/** Threshold create/update/delete: CEO and operations manager. */
export const requireThresholdEditor = authorize('ceo', 'operation_manager');

const thresholdQuerySchema = z.object({
  crop_id: z.string().uuid().optional(),
});

agronomicRouter.get(
  '/thresholds',
  validate({ query: thresholdQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const cropId = req.query.crop_id as string | undefined;
      const data = await listThresholds(cropId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

agronomicRouter.get('/parameters', (_req, res) => {
  res.json({ success: true, data: getValidParameters() });
});

const upsertSchema = z.object({
  cropId: z.string().uuid(),
  parameter: z.string().min(1),
  warningMin: z.number().nullable().optional().default(null),
  warningMax: z.number().nullable().optional().default(null),
  criticalMin: z.number().nullable().optional().default(null),
  criticalMax: z.number().nullable().optional().default(null),
  enabled: z.boolean().default(true),
});

agronomicRouter.post(
  '/thresholds',
  requireThresholdEditor,
  validate({ body: upsertSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { cropId, parameter, warningMin, warningMax, criticalMin, criticalMax, enabled } = req.body;
      const data = await upsertThreshold(cropId, parameter, warningMin ?? null, warningMax ?? null, criticalMin ?? null, criticalMax ?? null, enabled);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },
);

const deleteParamsSchema = z.object({ id: z.string().uuid() });

agronomicRouter.delete(
  '/thresholds/:id',
  requireThresholdEditor,
  validate({ params: deleteParamsSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      await deleteThreshold(req.params.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);
