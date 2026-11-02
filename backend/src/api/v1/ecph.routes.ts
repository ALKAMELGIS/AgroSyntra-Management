import { Router } from 'express';
import { z } from 'zod';
import { EcphService } from '../../services/ecph.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { dbPool } from '../../db/client';
import { AppError } from '../../utils/errors';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { emitDataChange } from '../../websocket';
import { checkForAnomalies } from '../../services/anomalyDetection.service';
import { evaluateAlerts } from '../../services/alertEngine.service';

export const ecphRouter = Router();
const service = new EcphService();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  template_id: z.string().uuid().optional(),
});
const valveReadingSchema = z.object({
  valveNumber: z.number().int().positive(),
  dripVolume: z.number().optional(),
  ecIn: z.number().optional(),
  ec: z.number().optional(),
  phIn: z.number().optional(),
  ph: z.number().optional(),
  drain: z.number().optional(),
  percentDrain: z.number().optional(),
  totalWaterBasedOnDrip: z.number().optional(),
  qtyOfWater: z.number().optional(),
  cycle: z.number().int().optional(),
  totalWaterQty: z.number().optional(),
});
const createSchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string().min(1),
  time: z.string().optional(),
  qtyOfWater: z.number().optional(),
  cycle: z.number().int().optional(),
  totalWaterQty: z.number().optional(),
  fieldTotalWaterBasedOnDrip: z.number().optional(),
  dripperCount: z.number().int().optional(),
  dripTestCount: z.number().int().positive().optional(),
  weatherCondition: z.string().optional(),
  irrigationStatus: z.string().optional(),
  templateId: z.string().uuid().optional(),
  valveReadings: z.array(valveReadingSchema).optional(),
});
const updateSchema = createSchema.partial().omit({ fieldId: true });

ecphRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, field_id, site_id, start_date, end_date, template_id } = req.query as {
        page?: number;
        limit?: number;
        field_id?: string;
        site_id?: string;
        start_date?: string;
        end_date?: string;
        template_id?: string;
      };
      const result = await service.list({
        page,
        limit,
        fieldId: field_id,
        siteId: site_id,
        startDate: start_date,
        endDate: end_date,
        templateId: template_id,
        organizationId: requireOrgId(req),
      });
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

ecphRouter.get('/:id', validate({ params: idSchema }), async (req, res, next) => {
  try {
    const entry = await service.getById(req.params.id);
    res.json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

ecphRouter.post('/bulk', async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    const entries: any[] = req.body?.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new AppError('entries array is required', 'VALIDATION_ERROR', 400);
    }

    const results: { inserted: number; skipped: number; errors: string[] } = { inserted: 0, skipped: 0, errors: [] };

    for (let i = 0; i < entries.length; i++) {
      try {
        const parsed = createSchema.parse(entries[i]);
        const existing = await dbPool.query(
          `SELECT id FROM ecph_entries
           WHERE field_id = $1 AND date = $2
             AND time IS NOT DISTINCT FROM $3::time
           LIMIT 1`,
          [parsed.fieldId, parsed.date, parsed.time || null],
        );
        if (existing.rowCount && existing.rowCount > 0) {
          results.skipped++;
          continue;
        }
        await service.create(parsed);
        results.inserted++;
      } catch (err: any) {
        results.errors.push(`Entry ${i + 1}: ${err.message || 'Unknown error'}`);
      }
    }

    emitDataChange('ecph', 'create', { bulk: true, count: results.inserted });
    res.status(201).json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

ecphRouter.post('/', validate({ body: createSchema }), async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    const user = req.user!;
    if (user.role !== 'ceo') {
      const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.body.fieldId, requireOrgId(req));
      if (!canAccess) throw new AppError('You do not have access to this field', 'FORBIDDEN', 403);
    }
    const entry = await service.create(req.body);
    emitDataChange('ecph', 'create', entry);

    // Run anomaly detection + rule-based alerts on the new reading
    if (entry.valveReadings?.length) {
      const avgEc = entry.valveReadings.reduce((s: number, r: any) => s + (r.ec || 0), 0) / entry.valveReadings.length;
      const avgPh = entry.valveReadings.reduce((s: number, r: any) => s + (r.ph || 0), 0) / entry.valveReadings.length;
      const avgDrain = entry.valveReadings.reduce((s: number, r: any) => s + (r.percent_drain || 0), 0) / entry.valveReadings.length;
      checkForAnomalies(req.body.fieldId, entry.id, { ec: avgEc, ph: avgPh, percent_drain: avgDrain }).catch(() => {});
      evaluateAlerts('ecph_reading', entry.id, req.body.fieldId, { ec: avgEc, ph: avgPh, percent_drain: avgDrain }).catch(() => {});
    }

    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

ecphRouter.put(
  '/:id',
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateDataEntry(req.user!);
      const entry = await service.update(req.params.id, req.body);
      emitDataChange('ecph', 'update', entry);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

ecphRouter.delete('/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    assertCanOperateDataEntry(req.user!);
    await service.remove(req.params.id);
    emitDataChange('ecph', 'delete', { id: req.params.id });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
