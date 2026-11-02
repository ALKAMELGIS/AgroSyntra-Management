import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, auth } from '../middleware/auth';
import { traceByBatchNumber } from '../../services/batchTrace.service';
import { requireOrgId } from '../middleware/tenant';

export const batchTraceRouter = Router();
batchTraceRouter.use(auth);

const batchTraceQuerySchema = z.object({
  batch_number: z.string().trim().min(1, 'Batch number is required'),
});

batchTraceRouter.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const parsed = batchTraceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? 'Invalid query parameters',
      });
    }

    const data = await traceByBatchNumber(parsed.data.batch_number, requireOrgId(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
