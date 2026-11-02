import { Router } from 'express';
import { z } from 'zod';
import { CropService } from '../../services/crop.service';
import { validate } from '../middleware/validate';
import { auth, authorize } from '../middleware/auth';

export const cropsRouter = Router();
const service = new CropService();

// Anyone signed in reads the crop list; only the people who plant (workers,
// agronomists) and operation managers add, rename or remove crops and varieties.
cropsRouter.use(auth);
// Worker and agronomist add and rename crops/varieties from Crop History; only the
// operation manager deletes them (Farm Areas & Crops), matching what the pages offer.
const cropWriters = authorize('operation_manager', 'agronomist', 'worker');
const cropDeleters = authorize('operation_manager');

const idSchema = z.object({ id: z.string().uuid() });
const cropIdSchema = z.object({ cropId: z.string().uuid() });
const varietyIdSchema = z.object({ cropId: z.string().uuid(), id: z.string().uuid() });
const createVarietySchema = z.object({ name: z.string().min(1), breederId: z.string().uuid().optional() });
const updateVarietySchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const createSchema = z.object({
  name: z.string().min(1),
  dripperCount: z.number().int().nonnegative().optional(),
  dripTestCount: z.number().int().nonnegative().optional(),
  plantCount: z.number().int().nonnegative().optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  dripperCount: z.number().int().nonnegative().optional(),
  dripTestCount: z.number().int().nonnegative().optional(),
  plantCount: z.number().int().nonnegative().optional(),
});

cropsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const { page, limit } = req.query as { page?: number; limit?: number };
      const result = await service.list({ page, limit });
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

cropsRouter.get('/:id', validate({ params: idSchema }), async (req, res, next) => {
  try {
    const crop = await service.getById(req.params.id);
    res.json({ success: true, data: crop });
  } catch (error) {
    next(error);
  }
});

cropsRouter.post('/', cropWriters, validate({ body: createSchema }), async (req, res, next) => {
  try {
    const crop = await service.create(req.body);
    res.status(201).json({ success: true, data: crop });
  } catch (error) {
    next(error);
  }
});

cropsRouter.put(
  '/:id',
  cropWriters,
  validate({ params: idSchema, body: updateSchema }),
  async (req, res, next) => {
    try {
      const crop = await service.update(req.params.id, req.body);
      res.json({ success: true, data: crop });
    } catch (error) {
      next(error);
    }
  }
);

cropsRouter.delete('/:id', cropDeleters, validate({ params: idSchema }), async (req, res, next) => {
  try {
    await service.remove(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

// ── Variety endpoints ─────────────────────────────────────────

cropsRouter.get(
  '/:cropId/varieties',
  validate({ params: cropIdSchema }),
  async (req, res, next) => {
    try {
      const varieties = await service.listVarieties(req.params.cropId);
      res.json({ success: true, data: varieties });
    } catch (error) {
      next(error);
    }
  }
);

cropsRouter.post(
  '/:cropId/varieties',
  cropWriters,
  validate({ params: cropIdSchema, body: createVarietySchema }),
  async (req, res, next) => {
    try {
      const variety = await service.createVariety(req.params.cropId, req.body.name, req.body.breederId);
      res.status(201).json({ success: true, data: variety });
    } catch (error) {
      next(error);
    }
  }
);

cropsRouter.put(
  '/:cropId/varieties/:id',
  cropWriters,
  validate({ params: varietyIdSchema, body: updateVarietySchema }),
  async (req, res, next) => {
    try {
      const variety = await service.updateVariety(req.params.id, req.body);
      res.json({ success: true, data: variety });
    } catch (error) {
      next(error);
    }
  }
);

cropsRouter.delete(
  '/:cropId/varieties/:id',
  cropDeleters,
  validate({ params: varietyIdSchema }),
  async (req, res, next) => {
    try {
      await service.removeVariety(req.params.id);
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);
