import { Router } from 'express';
import { z } from 'zod';
import { RecipeService } from '../../services/recipe.service';
import { validate } from '../middleware/validate';
import { AuthRequest, authorize } from '../middleware/auth';

export const recipesRouter = Router();
const service = new RecipeService();
/**
 * Recipe create/edit/delete: worker, agronomist and operations manager only.
 * Explicit role check (not checkPermission) so role-map wildcards for CEO / farm
 * manager or per-user permission grants cannot re-open recipe writes.
 */
export const RECIPE_EDITOR_ROLES = ['worker', 'agronomist', 'operation_manager'] as const;
export const canEditRecipes = authorize(...RECIPE_EDITOR_ROLES);
/** Only the operations manager signs off recipes before they can be used. */
export const requireRecipeApprover = authorize('operation_manager');

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const fertilizerSchema = z.object({
  name: z.string().min(1),
  dose: z.number().optional(),
  kgPerLiter: z.number().optional(),
  tankVolume: z.number().optional(),
  quantityPer1000L: z.number().optional(),
  elementPpm: z.record(z.string(), z.number()).optional(),
  element: z.string().optional(),
  concentration: z.number().optional(),
});
const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tankVolume: z.number().optional(),
  cycles: z.number().int().optional(),
  elementPpm: z.record(z.string(), z.number()).optional(),
  fertilizers: z.array(fertilizerSchema).optional(),
});
const updateSchema = createSchema.partial();

recipesRouter.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { page, limit } = req.query as { page?: number; limit?: number };
    const result = await service.list({ page, limit });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) {
    next(error);
  }
});

recipesRouter.get('/:id', validate({ params: idSchema }), async (req, res, next) => {
  try {
    const recipe = await service.getById(req.params.id);
    res.json({ success: true, data: recipe });
  } catch (error) {
    next(error);
  }
});

recipesRouter.post('/', canEditRecipes, validate({ body: createSchema }), async (req, res, next) => {
  try {
    const recipe = await service.create(req.body);
    res.status(201).json({ success: true, data: recipe });
  } catch (error) {
    next(error);
  }
});

recipesRouter.put(
  '/:id',
  canEditRecipes,
  validate({ params: idSchema, body: updateSchema }),
  async (req, res, next) => {
    try {
      const recipe = await service.update(req.params.id, req.body);
      res.json({ success: true, data: recipe });
    } catch (error) {
      next(error);
    }
  }
);

recipesRouter.post(
  '/:id/approve',
  requireRecipeApprover,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const recipe = await service.approve(req.params.id, req.user!.userId);
      res.json({ success: true, data: recipe });
    } catch (error) {
      next(error);
    }
  }
);

recipesRouter.delete('/:id', canEditRecipes, validate({ params: idSchema }), async (req, res, next) => {
  try {
    await service.remove(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
