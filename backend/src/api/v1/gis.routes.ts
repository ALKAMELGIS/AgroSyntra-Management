import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import * as gisService from '../../services/gisLayer.service';
import { parseFeatureServiceUrl, assertSafeArcgisUrl } from '../../services/arcgis.service';
import * as arcgisLink from '../../services/arcgisLink.service';
import { dbPool } from '../../db/client';
import { logAuditEvent } from '../../services/auditLog.service';

const gisRouter = Router();
gisRouter.use(auth);
/** GIS layer / feature writes (create, edit, delete, upload, sync, link, discover, test): CEO and operations manager. */
export const requireGisWriter = authorize('ceo', 'operation_manager');

const GIS_MAX_FILE = 50 * 1024 * 1024; // 50 MB
const gisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: GIS_MAX_FILE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      '.geojson', '.json', '.kml', '.kmz', '.zip', '.shp',
    ];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Accepted: ${allowed.join(', ')}`));
    }
  },
}).single('file');

// ── Schemas ──

const createLayerSchema = z.object({
  name: z.string().min(1).max(255),
  sourceType: z.enum(['arcgis_feature_service', 'file_upload']),
  sourceUrl: z.string().url().optional(),
  layerIndex: z.number().int().min(0).optional(),
  syncIntervalMinutes: z.number().int().min(1).optional(),
  authToken: z.string().optional(),
  style: z.record(z.string(), z.any()).optional(),
  attributeMapping: z.record(z.string(), z.string()).optional(),
});

const updateLayerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  style: z.record(z.string(), z.any()).optional(),
  attributeMapping: z.record(z.string(), z.string()).optional(),
  syncIntervalMinutes: z.number().int().min(1).optional(),
  isVisible: z.boolean().optional(),
  layerOrder: z.number().int().min(0).optional(),
  authToken: z.string().nullable().optional(),
  geojsonData: z.any().optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

const linkSchema = z.object({
  featureId: z.string().uuid(),
  fieldId: z.string().uuid().nullable().optional(),
  farmAreaId: z.string().uuid().nullable().optional(),
});

// ── Layer CRUD ──

gisRouter.get('/layers', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const layers = await gisService.listLayers(orgId);
  res.json({ success: true, data: layers });
}));

gisRouter.get('/layers/:id', validate({ params: idSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const layer = await gisService.getLayer(req.params.id);
  res.json({ success: true, data: layer });
}));

gisRouter.post(
  '/layers',
  requireGisWriter,
  validate({ body: createLayerSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = { ...req.body };
    if (body.sourceType === 'arcgis_feature_service' && body.sourceUrl) {
      const { baseUrl, layerIndex } = parseFeatureServiceUrl(body.sourceUrl);
      body.sourceUrl = baseUrl;
      if (layerIndex !== null && body.layerIndex === undefined) {
        body.layerIndex = layerIndex;
      }
    }
    const layer = await gisService.createLayer({
      ...body,
      createdBy: req.user!.userId,
      organizationId: requireOrgId(req),
    });

    res.status(201).json({ success: true, data: layer });
  }),
);

gisRouter.put(
  '/layers/:id',
  requireGisWriter,
  validate({ params: idSchema, body: updateLayerSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const layer = await gisService.updateLayer(req.params.id, req.body);
    res.json({ success: true, data: layer });
  }),
);

gisRouter.delete(
  '/layers/:id',
  requireGisWriter,
  validate({ params: idSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Capture basic layer info before deletion so the audit entry is useful
    // after the row is gone.
    let layerMeta: { name?: string; sourceType?: string } = {};
    try {
      const layer = await gisService.getLayer(req.params.id);
      if (layer) {
        layerMeta = { name: (layer as any).name, sourceType: (layer as any).sourceType };
      }
    } catch { /* non-fatal — we'll still audit the deletion */ }

    await gisService.deleteLayer(req.params.id);

    await logAuditEvent({
      userId: req.user!.userId,
      action: 'DELETE',
      entity: 'gis_layer',
      entityId: req.params.id,
      changes: layerMeta,
      metadata: { note: 'map polygons removed; linked fields + data preserved' },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { deleted: true } });
  }),
);

// ── Layer features ──

gisRouter.get('/layers/:id/features', validate({ params: idSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { minLng, minLat, maxLng, maxLat } = req.query as Record<string, string>;
  const bbox = minLng && minLat && maxLng && maxLat
    ? { minLng: +minLng, minLat: +minLat, maxLng: +maxLng, maxLat: +maxLat }
    : undefined;

  const fc = await gisService.getLayerFeatures(req.params.id, bbox);
  res.json({ success: true, data: fc });
}));

// ── ArcGIS-specific ──

gisRouter.get('/layers/:id/metadata', validate({ params: idSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const meta = await gisService.getLayerMetadata(req.params.id);
  res.json({ success: true, data: meta });
}));

gisRouter.post('/layers/:id/sync',
  requireGisWriter,
  validate({ params: idSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await gisService.syncArcGISLayer(req.params.id);
    res.json({ success: true, data: result });
  }),
);

gisRouter.post('/layers/:id/link',
  requireGisWriter,
  validate({ params: idSchema, body: linkSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { featureId, fieldId, farmAreaId } = req.body;
    await gisService.linkFeature(featureId, fieldId, farmAreaId);
    res.json({ success: true, data: { linked: true } });
  }),
);

gisRouter.post('/layers/:id/auto-link',
  requireGisWriter,
  validate({ params: idSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await gisService.autoLinkFeatures(req.params.id, requireOrgId(req));
    res.json({ success: true, data: result });
  }),
);

// ── ArcGIS ↔ forms link (FORM_ID) ──
// The layer link is always supplied by the user; nothing about the layer is hard-coded.

const keyMappingSchema = z.object({
  globalId: z.string().max(100).optional(),
  zoneId: z.string().max(100).optional(),
  site: z.string().max(100).optional(),
  siteCode: z.string().max(100).optional(),
  farmCode: z.string().max(100).optional(),
  farmName: z.string().max(100).optional(),
  structureType: z.string().max(100).optional(),
}).strict();

const inspectSchema = z.object({
  url: z.string().min(10).max(2000),
  token: z.string().max(4000).optional().nullable(),
  mapping: keyMappingSchema.optional(),
  layerId: z.string().uuid().optional(),
});

const connectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().min(10).max(2000),
  token: z.string().max(4000).optional().nullable(),
  mapping: keyMappingSchema,
  syncIntervalMinutes: z.number().int().min(5).max(10080).optional(),
});

const featureFormsQuery = z.object({
  layer_id: z.string().uuid().optional(),
  feature_id: z.string().uuid().optional(),
  global_id: z.string().max(64).optional(),
  object_id: z.string().max(32).optional(),
  zone_id: z.string().max(100).optional(),
  farm_code: z.string().max(255).optional(),
  records: z.coerce.number().int().min(0).max(200).optional(),
});

/** Who may read form records through the map (same roles as the forms API). */
const requireFormsReader = authorize('ceo', 'operation_manager', 'farm_manager', 'agronomist', 'pest_agronomist');

gisRouter.get('/arcgis/connections', requireGisWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await arcgisLink.listConnections(requireOrgId(req)) });
}));

gisRouter.post('/arcgis/inspect', requireGisWriter, validate({ body: inspectSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await arcgisLink.inspectLayer(requireOrgId(req), req.body);
  res.json({ success: true, data: report });
}));

/** Save (create or update) a connection: link, optional token and key fields. Same link = same connection. */
gisRouter.post('/arcgis/connections', requireGisWriter, validate({ body: connectionSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const { baseUrl, layerIndex } = parseFeatureServiceUrl(req.body.url);
  if (layerIndex === null) throw new AppError('Add the layer number at the end of the link, e.g. …/FeatureServer/21', 'VALIDATION_ERROR', 400);
  await assertSafeArcgisUrl(baseUrl);
  const mapping = Object.fromEntries(Object.entries(req.body.mapping).filter(([, v]) => v)) as Record<string, string>;
  const existing = await dbPool.query(
    `SELECT id FROM gis_layers WHERE organization_id = $1 AND source_type = 'arcgis_feature_service'
        AND RTRIM(source_url, '/') = RTRIM($2, '/') AND layer_index = $3 LIMIT 1`,
    [orgId, baseUrl, layerIndex],
  );
  let layer;
  if (existing.rows.length) {
    layer = await gisService.updateLayer(existing.rows[0].id, {
      ...(req.body.name ? { name: req.body.name } : {}),
      attributeMapping: mapping,
      ...(req.body.token !== undefined ? { authToken: req.body.token || null } : {}),
      ...(req.body.syncIntervalMinutes ? { syncIntervalMinutes: req.body.syncIntervalMinutes } : {}),
    });
  } else {
    layer = await gisService.createLayer({
      name: req.body.name || `ArcGIS layer ${layerIndex}`,
      sourceType: 'arcgis_feature_service',
      sourceUrl: baseUrl,
      layerIndex,
      attributeMapping: mapping,
      authToken: req.body.token || undefined,
      syncIntervalMinutes: req.body.syncIntervalMinutes,
      createdBy: req.user!.userId,
      organizationId: orgId,
    });
  }
  const { authToken: _hidden, ...safe } = layer as any;
  res.status(existing.rows.length ? 200 : 201).json({ success: true, data: { ...safe, created: !existing.rows.length } });
}));

gisRouter.get('/arcgis/link-issues', requireGisWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await arcgisLink.linkIssues(requireOrgId(req)) });
}));

/** All form data for one feature: by global_id, object_id, feature_id or zone_id + farm_code. */
gisRouter.get('/features/forms', requireFormsReader, validate({ query: featureFormsQuery }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = req.query as any;
  const data = await arcgisLink.featureForms(requireOrgId(req), {
    layerId: q.layer_id, featureId: q.feature_id, globalId: q.global_id, objectId: q.object_id,
    zoneId: q.zone_id, farmCode: q.farm_code, recordsPerForm: q.records,
  });
  res.json({ success: true, data });
}));

const siteFormsQuery = z.object({
  zone_id: z.string().min(1).max(100),
  site_code: z.string().min(1).max(255),
  records: z.coerce.number().int().min(0).max(200).optional(),
});

/** One site (ZONE_ID + SITE) → its many fields and form records. */
gisRouter.get('/sites/forms', requireFormsReader, validate({ query: siteFormsQuery }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = req.query as any;
  res.json({ success: true, data: await arcgisLink.siteForms(requireOrgId(req), { zoneId: q.zone_id, siteCode: q.site_code, recordsPerForm: q.records }) });
}));

gisRouter.get('/layers/:id/form-summary', requireFormsReader, validate({ params: idSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await arcgisLink.layerFormSummary(requireOrgId(req), req.params.id) });
}));

// ── Service discovery (no layer needed) ──

gisRouter.post('/discover', requireGisWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { url, token } = req.body;
  if (!url) throw new AppError('url is required', 'VALIDATION_ERROR', 400);
  const { baseUrl, layerIndex } = parseFeatureServiceUrl(url);
  const info = await gisService.getServiceLayers(baseUrl, token);
  res.json({ success: true, data: { ...info, detectedLayerIndex: layerIndex } });
}));

gisRouter.post('/test-connection', requireGisWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { url, token } = req.body;
  if (!url) throw new AppError('url is required', 'VALIDATION_ERROR', 400);
  const { baseUrl } = parseFeatureServiceUrl(url);
  const result = await gisService.testServiceConnection(baseUrl, token);
  res.json({ success: true, data: result });
}));

// ── File upload ──

gisRouter.post(
  '/upload',
  requireGisWriter,
  (req, res, next) => {
    gisUpload(req, res, (err) => {
      if (err) return next(new AppError(err.message, 'VALIDATION_ERROR', 400));
      next();
    });
  },
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new AppError('No file uploaded', 'VALIDATION_ERROR', 400);

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    let geojson: any;

    if (ext === '.geojson' || ext === '.json') {
      geojson = JSON.parse(file.buffer.toString('utf-8'));
    } else if (ext === '.kml') {
      const { kml: parseKml } = await import('@tmcw/togeojson');
      const { DOMParser } = await import('@xmldom/xmldom');
      const doc = new DOMParser().parseFromString(file.buffer.toString('utf-8'), 'text/xml');
      geojson = parseKml(doc);
    } else if (ext === '.kmz') {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file.buffer);
      const kmlFile = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.kml'));
      if (!kmlFile) throw new AppError('No KML file found inside KMZ', 'VALIDATION_ERROR', 400);
      const kmlContent = await zip.files[kmlFile].async('string');
      const { kml: parseKml } = await import('@tmcw/togeojson');
      const { DOMParser } = await import('@xmldom/xmldom');
      const doc = new DOMParser().parseFromString(kmlContent, 'text/xml');
      geojson = parseKml(doc);
    } else if (ext === '.zip') {
      const shp = await import('shpjs');
      const parseShp = (shp as any).default ?? shp;
      geojson = await parseShp(file.buffer);
    } else {
      throw new AppError(`Unsupported file type: ${ext}`, 'VALIDATION_ERROR', 400);
    }

    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
      if (geojson && geojson.type === 'Feature') {
        geojson = { type: 'FeatureCollection', features: [geojson] };
      } else {
        throw new AppError('Could not parse GeoJSON from uploaded file', 'VALIDATION_ERROR', 400);
      }
    }

    const layerName = req.body.name || file.originalname.replace(/\.[^.]+$/, '');

    const layer = await gisService.createLayer({
      name: layerName,
      sourceType: 'file_upload',
      originalFilename: file.originalname,
      createdBy: req.user!.userId,
      organizationId: requireOrgId(req),
      style: req.body.style ? JSON.parse(req.body.style) : undefined,
    });

    const count = await gisService.importGeoJSONFeatures(layer.id, geojson);

    const updated = await gisService.getLayer(layer.id);
    res.status(201).json({ success: true, data: { layer: updated, featuresImported: count } });
  }),
);

export { gisRouter };
