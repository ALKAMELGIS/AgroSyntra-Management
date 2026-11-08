import { Router } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { validate } from '../middleware/validate';
import * as soilService from '../../services/soilSensor.service';

const createSoilReadingSchema = z.object({
  field_id: z.string().uuid(),
  date: z.string(),
  moisture_pct: z.number().min(0).max(100).optional(),
  temperature_c: z.number().optional(),
  ec_dsm: z.number().optional(),
  ph: z.number().min(0).max(14).optional(),
  depth_cm: z.number().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

const soilSensorRouter = Router();
soilSensorRouter.use(auth);

// List readings with filters
soilSensorRouter.get('/', async (req, res, next) => {
  try {
    const result = await soilService.list({
      fieldId: req.query.fieldId as string,
      siteId: req.query.siteId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) { next(err); }
});

// Latest readings per field for a site (used by cards)
soilSensorRouter.get('/latest', async (req, res, next) => {
  try {
    const siteId = req.query.siteId as string;
    if (!siteId) return res.status(400).json({ success: false, error: { message: 'siteId is required' } });
    const date = req.query.date as string;
    const data = await soilService.getLatestBySite(siteId, date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Create manual entry
soilSensorRouter.post('/', validate({ body: createSoilReadingSchema }), async (req: AuthRequest, res, next) => {
  try {
    // Manual soil readings are data entry: worker and agronomist only.
    assertCanOperateDataEntry(req.user!);
    // The body is validated in snake_case; the service takes camelCase. Passing the
    // body straight through left fieldId and every reading undefined.
    const b = req.body as z.infer<typeof createSoilReadingSchema>;
    const item = await soilService.create({
      fieldId: b.field_id,
      date: b.date,
      moisturePct: b.moisture_pct ?? null,
      temperatureC: b.temperature_c ?? null,
      ecDsm: b.ec_dsm ?? null,
      ph: b.ph ?? null,
      depthCm: b.depth_cm ?? null,
      source: b.source,
      notes: b.notes,
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

export { soilSensorRouter };
