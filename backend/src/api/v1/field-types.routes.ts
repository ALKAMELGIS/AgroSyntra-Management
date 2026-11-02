import { Router } from 'express';
import { z } from 'zod';
import { FieldTypeService } from '../../services/field-type.service';
import { validate } from '../middleware/validate';
import { auth, authorize } from '../middleware/auth';

export const fieldTypesRouter = Router();
const service = new FieldTypeService();

// Any logged-in user may read field types; operation managers and data entry
// workers maintain them. The farm manager (no data entry) and the CEO watch.
fieldTypesRouter.use(auth);
const authorizeFieldTypeEditors = authorize('operation_manager', 'worker');

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const createSchema = z.object({
  name: z.string().min(1),
  namingPattern: z.string().optional(),
  defaultValveCount: z.number().int().nonnegative().optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  namingPattern: z.string().optional(),
  defaultValveCount: z.number().int().nonnegative().optional(),
});

fieldTypesRouter.get(
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

fieldTypesRouter.get('/:id', validate({ params: idSchema }), async (req, res, next) => {
  try {
    const fieldType = await service.getById(req.params.id);
    res.json({ success: true, data: fieldType });
  } catch (error) {
    next(error);
  }
});

fieldTypesRouter.post('/', authorizeFieldTypeEditors, validate({ body: createSchema }), async (req, res, next) => {
  try {
    const fieldType = await service.create(req.body);
    res.status(201).json({ success: true, data: fieldType });
  } catch (error) {
    next(error);
  }
});

fieldTypesRouter.put(
  '/:id',
  authorizeFieldTypeEditors,
  validate({ params: idSchema, body: updateSchema }),
  async (req, res, next) => {
    try {
      const fieldType = await service.update(req.params.id, req.body);
      res.json({ success: true, data: fieldType });
    } catch (error) {
      next(error);
    }
  }
);

fieldTypesRouter.delete(
  '/:id',
  authorizeFieldTypeEditors,
  validate({ params: idSchema }),
  async (req, res, next) => {
    try {
      await service.remove(req.params.id);
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);
