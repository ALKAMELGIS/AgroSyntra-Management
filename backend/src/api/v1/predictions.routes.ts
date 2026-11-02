import { Router, Response } from 'express';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { predictYield } from '../../services/yieldPrediction.service';
import { recommendCrops } from '../../services/cropRecommendation.service';
import { requireOrgId } from '../middleware/tenant';
import { assertFieldInOrganization } from '../../utils/tenantValidation';

const predictionsRouter = Router();
predictionsRouter.use(auth);
predictionsRouter.use(authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist'));

/** GET /predictions/yield/:fieldId */
predictionsRouter.get('/yield/:fieldId', asyncHandler(async (req: AuthRequest, res: Response) => {
  await assertFieldInOrganization(req.params.fieldId, requireOrgId(req));
  const prediction = await predictYield(req.params.fieldId);
  res.json({ success: true, data: prediction });
}));

/** GET /recommendations/crop/:fieldId */
predictionsRouter.get('/crop/:fieldId', asyncHandler(async (req: AuthRequest, res: Response) => {
  await assertFieldInOrganization(req.params.fieldId, requireOrgId(req));
  const recommendations = await recommendCrops(req.params.fieldId);
  res.json({ success: true, data: recommendations });
}));

export { predictionsRouter };
