import { Router, Response } from 'express';
import { auth } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { getIrrigationAdvice } from '../../services/irrigationAdvisor.service';

const irrigationRouter = Router();
irrigationRouter.use(auth);

/** GET /irrigation-advice/:fieldId -- get irrigation advice for a field */
irrigationRouter.get('/:fieldId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const advice = await getIrrigationAdvice(req.params.fieldId);
  res.json({ success: true, data: advice });
}));

export { irrigationRouter };
