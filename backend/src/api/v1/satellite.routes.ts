import { Router } from 'express';
import { z } from 'zod';
import { SatelliteService } from '../../services/satellite.service';
import { validate } from '../middleware/validate';
import { AppError } from '../../utils/errors';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { auth, AuthRequest } from '../middleware/auth';
import * as settings from '../../services/systemSettings.service';
import { signTileKey, verifyTileKey, wmsTileParams, isWkt } from '../../services/satelliteTiles';
import { getIndex, indexCatalog, statsScript, b64 } from '../../services/satelliteIndices';

export const satelliteRouter = Router();

// ── Map tiles through the server ───────────────────────────────────────────
// Map libraries load tiles as plain <img> requests (no Authorization header),
// so the browser first gets a short-lived signed key (signed in) and passes it
// as ?k=. The configuration ID is added here and never reaches the browser.

satelliteRouter.get('/wms', async (req, res, next) => {
  try {
    const key = verifyTileKey(String(req.query.k || ''));
    if (!key) { res.status(401).end(); return; }
    const cfg = await settings.resolveSentinel();
    if (!cfg) { res.status(503).end(); return; }
    const params = wmsTileParams(req.query as Record<string, any>, cfg.baseLayer);
    if (!params) { res.status(400).end(); return; }
    const upstream = await fetch(`${cfg.wmsBase}?${params.toString()}`, { signal: AbortSignal.timeout(20000) });
    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !type.startsWith('image/')) {
      logger.warn({ status: upstream.status, type }, 'Satellite tile request failed');
      res.status(502).end();
      return;
    }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    next(error);
  }
});

// Everything below needs a signed-in user.
satelliteRouter.use(auth);

satelliteRouter.get('/status', async (_req, res, next) => {
  try {
    const cfg = await settings.getSentinelConfig();
    res.json({ success: true, data: { configured: cfg.configured, service: cfg.service, label: cfg.label } });
  } catch (error) {
    next(error);
  }
});

/** Indices and band combinations offered on the map (name, group, formula, legend). */
satelliteRouter.get('/indices', (_req, res) => {
  res.json({ success: true, data: indexCatalog() });
});

const BBOX = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Sentinel-2 scenes over an area: date, cloud cover (search with filters, then pick a scene). */
satelliteRouter.get('/scenes', async (req, res, next) => {
  try {
    const cfg = await settings.resolveSentinel();
    if (!cfg) throw new AppError('Satellite imagery is not set up yet', 'SERVICE_UNAVAILABLE', 503);
    const bbox = String(req.query.bbox || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const maxcc = Math.min(Math.max(Number(req.query.maxcc ?? 100), 0), 100);
    if (!BBOX.test(bbox) || !DAY.test(from) || !DAY.test(to)) throw new AppError('bbox (minLon,minLat,maxLon,maxLat), from and to are required', 'VALIDATION_ERROR', 400);
    const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
    const q = new URLSearchParams({
      SERVICE: 'WFS', REQUEST: 'GetFeature', VERSION: '2.0.0', TYPENAMES: 'DSS2', OUTPUTFORMAT: 'application/json',
      SRSNAME: 'EPSG:4326', BBOX: `${minLat},${minLon},${maxLat},${maxLon}`, TIME: `${from}/${to}`, MAXCC: String(maxcc), MAXFEATURES: '100',
    });
    const r = await fetch(`${cfg.ogcBase}/wfs/${cfg.instanceId}?${q.toString()}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new AppError(`Satellite catalogue answered ${r.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
    const json: any = await r.json();
    const byDate = new Map<string, { date: string; cloud: number; tiles: number; time: string | null }>();
    (json.features || []).forEach((f: any) => {
      const p = f.properties || {};
      const date = String(p.date || '').slice(0, 10);
      if (!DAY.test(date)) return;
      const cloud = Number(p.cloudCoverPercentage ?? p.cloudCover ?? 0);
      const hit = byDate.get(date);
      if (!hit) byDate.set(date, { date, cloud: Math.round(cloud * 10) / 10, tiles: 1, time: p.time || null });
      else { hit.tiles += 1; hit.cloud = Math.round(Math.max(hit.cloud, cloud) * 10) / 10; }
    });
    res.json({ success: true, data: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)) });
  } catch (error) {
    next(error);
  }
});

/** Index statistics over an AOI for every scene in the period (time series). */
satelliteRouter.post('/stats', async (req, res, next) => {
  try {
    const cfg = await settings.resolveSentinel();
    if (!cfg) throw new AppError('Satellite imagery is not set up yet', 'SERVICE_UNAVAILABLE', 503);
    if (cfg.service === 'copernicus') throw new AppError('Time series needs the Sentinel Hub statistics service, which Copernicus Data Space configurations do not offer.', 'NOT_SUPPORTED', 501);
    const { index, geometry, from, to, maxcc } = req.body || {};
    const def = getIndex(String(index || ''));
    if (!def || def.rgb) throw new AppError('Choose an index (NDVI, NDWI, NDMI, SAVI, MSI, BSI …)', 'VALIDATION_ERROR', 400);
    if (!isWkt(String(geometry || '')) || !DAY.test(String(from)) || !DAY.test(String(to))) throw new AppError('geometry (WKT, EPSG:3857), from and to are required', 'VALIDATION_ERROR', 400);
    const q = new URLSearchParams({
      LAYER: cfg.baseLayer, CRS: 'EPSG:3857', TIME: `${from}/${to}`, GEOMETRY: String(geometry).trim(),
      RESOLUTION: '20m', MAXCC: String(Math.min(Math.max(Number(maxcc ?? 30), 0), 100)), EVALSCRIPT: b64(statsScript(def)),
    });
    const r = await fetch(`${cfg.ogcBase}/fis/${cfg.instanceId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString(), signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new AppError(`Satellite statistics answered ${r.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
    const json: any = await r.json();
    const series = (json.C0 || json[Object.keys(json)[0]] || []) as any[];
    const data = series
      .map((d) => ({ date: String(d.date).slice(0, 10), mean: d.basicStats?.mean, min: d.basicStats?.min, max: d.basicStats?.max }))
      .filter((d) => Number.isFinite(d.mean))
      .map((d) => ({ ...d, mean: Math.round(d.mean * 1000) / 1000, min: Math.round(d.min * 1000) / 1000, max: Math.round(d.max * 1000) / 1000 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

satelliteRouter.get('/tile-key', async (req: AuthRequest, res, next) => {
  try {
    if (!(await settings.resolveSentinel())) throw new AppError('Satellite imagery is not set up yet (Settings → API Keys → Satellite imagery).', 'SERVICE_UNAVAILABLE', 503);
    res.json({ success: true, data: signTileKey(req.user?.organizationId || req.user?.userId || 'user') });
  } catch (error) {
    next(error);
  }
});

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

const fieldParamsSchema = z.object({ fieldId: z.string().uuid() });
const ndviQuerySchema = z.object({
  timeRange: z.string().min(1),
});
const processSchema = z.object({
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  timeRange: z.string().min(1),
});

satelliteRouter.get('/layers', async (_req, res, next) => {
  try {
    const cfg = await settings.resolveSentinel();
    if (!cfg) throw new AppError('Satellite imagery is not set up yet', 'SERVICE_UNAVAILABLE', 503);
    const r = await fetch(`${cfg.wmsBase}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new AppError(`Satellite service answered ${r.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
    const data = settings.parseWmsLayers(await r.text());
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
