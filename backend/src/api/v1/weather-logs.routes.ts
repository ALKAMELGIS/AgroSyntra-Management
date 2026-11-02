import { Router } from 'express';
import { z } from 'zod';
import { WeatherLogService } from '../../services/weather-log.service';
import { auth, authorize } from '../middleware/auth';
import { requireOrgId, type TenantRequest } from '../middleware/tenant';
import { validate } from '../middleware/validate';

/**
 * Weather logs. Every route needs a logged-in user (reads too), and everything
 * is limited to the caller's organization. Only the data-entry worker and the
 * operation manager may add, change or delete a log; every other role watches.
 */
export const weatherLogsRouter = Router();
const service = new WeatherLogService();

export const WEATHER_LOG_WRITER_ROLES = ['worker', 'operation_manager'] as const;
const canWrite = authorize(...WEATHER_LOG_WRITER_ROLES);

weatherLogsRouter.use(auth);

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  site_id: z.string().uuid().optional(),
  field_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
const createSchema = z.object({
  date: z.string().min(1),
  countryId: z.string().uuid().optional(),
  siteId: z.string().uuid(),
  fieldId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  maxTemp: z.number().optional(),
  minTemp: z.number().optional(),
  avgTemp: z.number().optional(),
  feelsLike: z.number().optional(),
  avgRH: z.number().optional(),
  rainfall: z.number().optional(),
  pressure: z.number().optional(),
  windSpeed: z.number().optional(),
  windDirection: z.number().optional(),
  clouds: z.number().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});
const updateSchema = createSchema.partial().omit({ siteId: true });

weatherLogsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req, res, next) => {
    try {
      const organizationId = requireOrgId(req as TenantRequest);
      const { page, limit, site_id, field_id, start_date, end_date } = req.query as {
        page?: number;
        limit?: number;
        site_id?: string;
        field_id?: string;
        start_date?: string;
        end_date?: string;
      };
      const result = await service.list({
        organizationId,
        page,
        limit,
        siteId: site_id,
        fieldId: field_id,
        startDate: start_date,
        endDate: end_date,
      });
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

weatherLogsRouter.get('/:id', validate({ params: idSchema }), async (req, res, next) => {
  try {
    const organizationId = requireOrgId(req as TenantRequest);
    const entry = await service.getById(req.params.id, organizationId);
    res.json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

weatherLogsRouter.post('/', canWrite, validate({ body: createSchema }), async (req, res, next) => {
  try {
    const organizationId = requireOrgId(req as TenantRequest);
    const entry = await service.create(organizationId, req.body);
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    next(error);
  }
});

weatherLogsRouter.put(
  '/:id',
  canWrite,
  validate({ params: idSchema, body: updateSchema }),
  async (req, res, next) => {
    try {
      const organizationId = requireOrgId(req as TenantRequest);
      const entry = await service.update(req.params.id, organizationId, req.body);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

weatherLogsRouter.delete('/:id', canWrite, validate({ params: idSchema }), async (req, res, next) => {
  try {
    const organizationId = requireOrgId(req as TenantRequest);
    await service.remove(req.params.id, organizationId);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});
