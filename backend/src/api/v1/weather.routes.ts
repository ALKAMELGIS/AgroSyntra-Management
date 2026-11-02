import { Router } from 'express';
import { z } from 'zod';
import { WeatherService } from '../../services/weather.service';
import { validate } from '../middleware/validate';

export const weatherRouter = Router();
const service = new WeatherService();

const latLonSchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  source: z.enum(['openweather']).optional(),
  refresh: z.coerce.boolean().optional(),
});
const stationIdSchema = z.object({
  stationId: z.string().min(1),
});
const fieldParamsSchema = z.object({ fieldId: z.string().uuid() });
const fieldQuerySchema = z.object({
  type: z.enum(['current', 'forecast']).optional(),
  source: z.enum(['openweather']).optional(),
});
const ndviQuerySchema = z.object({
  polyid: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
});
const imageSearchQuerySchema = z.object({
  polyid: z.string().min(1),
  date: z.string().min(1),
});
const soilQuerySchema = z.object({
  polyid: z.string().min(1),
});

weatherRouter.get('/status', async (_req, res, next) => {
  try {
    const configured = await service.isOpenWeatherConfigured();
    res.json({ success: true, data: { configured } });
  } catch (error) {
    next(error);
  }
});

weatherRouter.get(
  '/current',
  validate({ query: latLonSchema }),
  async (req, res, next) => {
    try {
      const { lat, lon, source, refresh } = req.query as unknown as {
        lat: number;
        lon: number;
        source?: 'openweather';
        refresh?: boolean;
      };
      const data = await service.getCurrent(lat, lon, source ?? 'openweather', !!refresh);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get(
  '/forecast',
  validate({ query: latLonSchema }),
  async (req, res, next) => {
    try {
      const { lat, lon, source } = req.query as unknown as {
        lat: number;
        lon: number;
        source?: 'openweather';
      };
      const data = await service.getForecast(lat, lon, source ?? 'openweather');
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get(
  '/field/:fieldId',
  validate({ params: fieldParamsSchema, query: fieldQuerySchema }),
  async (req, res, next) => {
    try {
      const { type, source } = req.query as {
        type?: 'current' | 'forecast';
        source?: 'openweather';
      };
      const data = await service.getForField(
        req.params.fieldId,
        type ?? 'current',
        source ?? 'openweather'
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get(
  '/station/:stationId/current',
  validate({ params: stationIdSchema }),
  async (req, res, next) => {
    try {
      const data = await service.getStationCurrent(req.params.stationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get(
  '/station/:stationId/forecast',
  validate({ params: stationIdSchema }),
  async (req, res, next) => {
    try {
      const data = await service.getStationForecast(req.params.stationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get('/agro/polygons', async (_req, res, next) => {
  try {
    const data = await service.listAgroPolygons();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

weatherRouter.post('/agro/polygons', async (req, res, next) => {
  try {
    const data = await service.createAgroPolygon(req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

weatherRouter.get(
  '/agro/ndvi/history',
  validate({ query: ndviQuerySchema }),
  async (req, res, next) => {
    try {
      const { polyid, start, end } = req.query as { polyid: string; start: string; end: string };
      const data = await service.getAgroNdviHistory(polyid, start, end);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get(
  '/agro/image/search',
  validate({ query: imageSearchQuerySchema }),
  async (req, res, next) => {
    try {
      const { polyid, date } = req.query as { polyid: string; date: string };
      const data = await service.searchAgroImages(polyid, date);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

weatherRouter.get(
  '/agro/soil',
  validate({ query: soilQuerySchema }),
  async (req, res, next) => {
    try {
      const { polyid } = req.query as { polyid: string };
      const data = await service.getAgroSoil(polyid);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);
