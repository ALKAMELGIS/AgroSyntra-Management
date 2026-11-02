import { Router } from 'express';
import { z } from 'zod';
import { SatelliteService } from '../../services/satellite.service';
import { validate } from '../middleware/validate';
import { AppError } from '../../utils/errors';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export const satelliteRouter = Router();

// Lazy-init: don't crash the server if SentinelHub isn't configured
let _service: SatelliteService | null = null;
function getService(): SatelliteService {
  if (!_service) {
    try {
      _service = new SatelliteService();
    } catch {
      throw new AppError('Satellite imagery service is not configured on this server', 'SERVICE_UNAVAILABLE', 503);
    }
  }
  return _service;
}

const wmsQuerySchema = z.object({
  layer: z.string().min(1),
  bbox: z.string().min(1),
  time: z.string().min(1),
  width: z.coerce.number().int().optional(),
  height: z.coerce.number().int().optional(),
  maxCloudCoverage: z.coerce.number().int().optional(),
});
const fieldParamsSchema = z.object({ fieldId: z.string().uuid() });
const ndviQuerySchema = z.object({
  timeRange: z.string().min(1),
});
const processSchema = z.object({
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  timeRange: z.string().min(1),
});

satelliteRouter.get(
  '/wms-url',
  validate({ query: wmsQuerySchema }),
  async (req, res, next) => {
    try {
      const data = getService().getWmsUrl(req.query as any);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

satelliteRouter.get('/layers', async (_req, res, next) => {
  try {
    const data = await getService().getLayers();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

satelliteRouter.get(
  '/ndvi/:fieldId',
  validate({ params: fieldParamsSchema, query: ndviQuerySchema }),
  async (req, res, next) => {
    try {
      const { timeRange } = req.query as { timeRange: string };
      const result = await getService().getNdviForField(req.params.fieldId, timeRange);
      res.setHeader('Content-Type', result.contentType);
      res.send(Buffer.from(result.image));
    } catch (error) {
      next(error);
    }
  }
);

satelliteRouter.post('/token', async (_req, res, next) => {
  try {
    const { sentinelHubClientId, sentinelHubClientSecret } = config.external;
    if (!sentinelHubClientId || !sentinelHubClientSecret) {
      throw new AppError('SentinelHub OAuth credentials not configured on backend', 'SERVICE_UNAVAILABLE', 503);
    }
    const response = await fetch('https://services.sentinel-hub.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: sentinelHubClientId,
        client_secret: sentinelHubClientSecret,
      }),
    });
    if (!response.ok) {
      throw new AppError(`SentinelHub OAuth failed: ${response.statusText}`, 'EXTERNAL_SERVICE_ERROR', 502);
    }
    const data = await response.json();
    res.json({ success: true, data: { access_token: data.access_token, expires_in: data.expires_in } });
  } catch (error) {
    next(error);
  }
});

satelliteRouter.post(
  '/process',
  validate({ body: processSchema }),
  async (req, res, next) => {
    try {
      const { polygon, timeRange } = req.body as {
        polygon: number[][];
        timeRange: string;
      };
      const result = await getService().processNdvi(polygon, timeRange);
      res.setHeader('Content-Type', result.contentType);
      res.send(Buffer.from(result.image));
    } catch (error) {
      next(error);
    }
  }
);
