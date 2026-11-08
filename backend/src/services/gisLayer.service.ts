import { dbPool } from '../db/client';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../utils/errors';
import { stampOrgIfNull } from '../utils/gisOrgStamp';
import {
  fetchLayerMetadata,
  fetchServiceInfo,
  queryFeatures,
  testConnection as arcgisTestConnection,
} from './arcgis.service';

export interface GisLayer {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  layerIndex: number | null;
  filePath: string | null;
  originalFilename: string | null;
  style: Record<string, any>;
  attributeMapping: Record<string, string>;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  syncStatus: string;
  syncError: string | null;
  isVisible: boolean;
  layerOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  organizationId: string | null;
  featureCount?: number;
}

export interface GisFeature {
  id: string;
  layerId: string;
  externalId: string | null;
  geometry: any;
  properties: Record<string, any>;
  linkedFieldId: string | null;
  linkedFarmAreaId: string | null;
}

function mapLayer(row: any): GisLayer {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    layerIndex: row.layer_index,
    filePath: row.file_path,
    originalFilename: row.original_filename,
    style: row.style || {},
    attributeMapping: row.attribute_mapping || {},
    syncIntervalMinutes: row.sync_interval_minutes,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    isVisible: row.is_visible,
    layerOrder: row.layer_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    organizationId: row.organization_id ?? null,
    featureCount: row.feature_count !== undefined ? Number(row.feature_count) : undefined,
  };
}

function mapFeature(row: any): GisFeature {
  return {
    id: row.id,
    layerId: row.layer_id,
    externalId: row.external_id,
    geometry: row.geojson ? JSON.parse(row.geojson) : null,
    properties: row.properties || {},
    linkedFieldId: row.linked_field_id,
    linkedFarmAreaId: row.linked_farm_area_id,
  };
}

// ── Layer CRUD ──

export async function listLayers(organizationId: string): Promise<GisLayer[]> {
  try {
    const result = await dbPool.query(
      `SELECT gl.*, (SELECT COUNT(*) FROM gis_features gf WHERE gf.layer_id = gl.id) AS feature_count
       FROM gis_layers gl
       WHERE gl.organization_id = $1
       ORDER BY gl.layer_order ASC, gl.created_at DESC`,
      [organizationId],
    );
    return result.rows.map(mapLayer);
  } catch (err: any) {
    if (err?.code === '42P01') {
      logger.warn('gis_features table does not exist — using geojson_data feature count');
      try {
        const fallback = await dbPool.query(
          `SELECT gl.*,
             COALESCE(jsonb_array_length(gl.geojson_data->'features'), 0) AS feature_count
           FROM gis_layers gl ORDER BY gl.layer_order ASC, gl.created_at DESC`,
        );
        return fallback.rows.map(mapLayer);
      } catch {
        return [];
      }
    }
    throw err;
  }
}

export async function getLayer(id: string): Promise<GisLayer> {
  try {
    const result = await dbPool.query(
      `SELECT gl.*, (SELECT COUNT(*) FROM gis_features gf WHERE gf.layer_id = gl.id) AS feature_count
       FROM gis_layers gl WHERE gl.id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundError('GIS layer not found');
    return mapLayer(result.rows[0]);
  } catch (err: any) {
    if (err?.code === '42P01') {
      const fallback = await dbPool.query(
        `SELECT gl.*, 0 AS feature_count FROM gis_layers gl WHERE gl.id = $1`, [id],
      );
      if (fallback.rowCount === 0) throw new NotFoundError('GIS layer not found');
      return mapLayer(fallback.rows[0]);
    }
    throw err;
  }
}

export async function createLayer(data: {
  name: string;
  sourceType: string;
  sourceUrl?: string;
  layerIndex?: number;
  filePath?: string;
  originalFilename?: string;
  style?: Record<string, any>;
  attributeMapping?: Record<string, string>;
  syncIntervalMinutes?: number;
  authToken?: string;
  createdBy?: string;
  organizationId: string;
}): Promise<GisLayer> {
  const result = await dbPool.query(
    `INSERT INTO gis_layers (
      name, source_type, source_url, layer_index, file_path, original_filename,
      style, attribute_mapping, sync_interval_minutes, auth_token, created_by, organization_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *, 0 AS feature_count`,
    [
      data.name,
      data.sourceType,
      data.sourceUrl ?? null,
      data.layerIndex ?? null,
      data.filePath ?? null,
      data.originalFilename ?? null,
      JSON.stringify(data.style ?? { color: '#3388ff', weight: 2, opacity: 0.8, fillOpacity: 0.3 }),
      JSON.stringify(data.attributeMapping ?? {}),
      data.syncIntervalMinutes ?? 60,
      data.authToken ?? null,
      data.createdBy ?? null,
      data.organizationId,
    ],
  );
  return mapLayer(result.rows[0]);
}

export async function updateLayer(
  id: string,
  data: Partial<{
    name: string;
    style: Record<string, any>;
    attributeMapping: Record<string, string>;
    syncIntervalMinutes: number;
    isVisible: boolean;
    layerOrder: number;
    authToken: string | null;
    geojsonData: any;
  }>,
): Promise<GisLayer> {
  const sets: string[] = [];
  const vals: any[] = [];
  let p = 0;

  if (data.name !== undefined) { p++; sets.push(`name = $${p}`); vals.push(data.name); }
  if (data.style !== undefined) { p++; sets.push(`style = $${p}`); vals.push(JSON.stringify(data.style)); }
  if (data.attributeMapping !== undefined) { p++; sets.push(`attribute_mapping = $${p}`); vals.push(JSON.stringify(data.attributeMapping)); }
  if (data.syncIntervalMinutes !== undefined) { p++; sets.push(`sync_interval_minutes = $${p}`); vals.push(data.syncIntervalMinutes); }
  if (data.isVisible !== undefined) { p++; sets.push(`is_visible = $${p}`); vals.push(data.isVisible); }
  if (data.layerOrder !== undefined) { p++; sets.push(`layer_order = $${p}`); vals.push(data.layerOrder); }
  if (data.authToken !== undefined) { p++; sets.push(`auth_token = $${p}`); vals.push(data.authToken); }
  if (data.geojsonData !== undefined) {
    p++; sets.push(`geojson_data = $${p}`); vals.push(JSON.stringify(data.geojsonData));
    sets.push(`sync_status = 'synced'`);
    sets.push(`last_synced_at = NOW()`);
    sets.push(`sync_error = NULL`);
  }

  if (sets.length === 0) throw new AppError('Nothing to update', 'VALIDATION_ERROR', 400);

  p++;
  vals.push(id);
  const result = await dbPool.query(
    `UPDATE gis_layers SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${p}
     RETURNING *, 0 AS feature_count`,
    vals,
  );
  if (result.rowCount === 0) throw new NotFoundError('GIS layer not found');
  return mapLayer(result.rows[0]);
}

export async function deleteLayer(id: string): Promise<void> {
  const result = await dbPool.query('DELETE FROM gis_layers WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new NotFoundError('GIS layer not found');
}

// ── Features ──

export async function getLayerFeatures(
  layerId: string,
  bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): Promise<{ type: 'FeatureCollection'; features: any[] }> {
  try {
    let query = `SELECT gf.id, gf.external_id, ST_AsGeoJSON(gf.geometry) AS geojson,
       gf.properties, gf.linked_field_id, gf.linked_farm_area_id
       FROM gis_features gf WHERE gf.layer_id = $1`;
    const params: any[] = [layerId];

    if (bbox) {
      query += ` AND ST_Intersects(gf.geometry, ST_MakeEnvelope($2, $3, $4, $5, 4326))`;
      params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
    }

    const result = await dbPool.query(query, params);

    return {
      type: 'FeatureCollection',
      features: result.rows.map((r) => ({
        type: 'Feature',
        id: r.id,
        geometry: JSON.parse(r.geojson),
        properties: {
          ...r.properties,
          _id: r.id,
          _externalId: r.external_id,
          _linkedFieldId: r.linked_field_id,
          _linkedFarmAreaId: r.linked_farm_area_id,
        },
      })),
    };
  } catch (err: any) {
    if (err?.code === '42P01' || err?.code === '42883') {
      logger.warn('gis_features table or PostGIS function missing — falling back to geojson_data');
      try {
        const fallback = await dbPool.query(
          'SELECT geojson_data FROM gis_layers WHERE id = $1', [layerId],
        );
        const gj = fallback.rows[0]?.geojson_data;
        if (gj && gj.features?.length > 0) return gj;
      } catch { /* ignore */ }
      return { type: 'FeatureCollection', features: [] };
    }
    throw err;
  }
}

export async function linkFeature(
  featureId: string,
  fieldId?: string | null,
  farmAreaId?: string | null,
): Promise<void> {
  await dbPool.query(
    `UPDATE gis_features SET linked_field_id = $2, linked_farm_area_id = $3, updated_at = NOW()
     WHERE id = $1`,
    [featureId, fieldId ?? null, farmAreaId ?? null],
  );
  if (fieldId) {
    await syncFieldGeometryFromGisFeature(fieldId, featureId);
  }
}

// ── ArcGIS Sync ──

export async function syncArcGISLayer(layerId: string): Promise<{ added: number; updated: number; removed: number }> {
  const layer = await getLayer(layerId);
  if (layer.sourceType !== 'arcgis_feature_service') {
    throw new AppError('Layer is not an ArcGIS feature service', 'VALIDATION_ERROR', 400);
  }
  if (!layer.sourceUrl) {
    throw new AppError('Layer has no source URL', 'VALIDATION_ERROR', 400);
  }

  await dbPool.query(
    `UPDATE gis_layers SET sync_status = 'syncing', sync_error = NULL, updated_at = NOW() WHERE id = $1`,
    [layerId],
  );

  try {
    const featureResult = await queryFeatures(
      layer.sourceUrl,
      layer.layerIndex ?? 0,
      (layer as any).authToken ?? null,
    );

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const existingResult = await client.query(
        'SELECT id, external_id FROM gis_features WHERE layer_id = $1',
        [layerId],
      );
      const existingMap = new Map(existingResult.rows.map((r: any) => [r.external_id, r.id]));

      let added = 0;
      let updated = 0;
      const incomingIds = new Set<string>();

      for (const feature of featureResult.features) {
        const extId = String(feature.id ?? feature.properties?.OBJECTID ?? feature.properties?.FID ?? '');
        incomingIds.add(extId);
        const geojsonStr = JSON.stringify(feature.geometry);
        const propsStr = JSON.stringify(feature.properties ?? {});

        if (existingMap.has(extId)) {
          await client.query(
            `UPDATE gis_features SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
             properties = $2, updated_at = NOW() WHERE id = $3`,
            [geojsonStr, propsStr, existingMap.get(extId)],
          );
          updated++;
        } else {
          await client.query(
            `INSERT INTO gis_features (layer_id, external_id, geometry, properties)
             VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4)`,
            [layerId, extId, geojsonStr, propsStr],
          );
          added++;
        }
      }

      let removed = 0;
      for (const [extId, dbId] of existingMap.entries()) {
        if (!incomingIds.has(extId!)) {
          await client.query('DELETE FROM gis_features WHERE id = $1', [dbId]);
          removed++;
        }
      }

      await client.query(
        `UPDATE gis_layers SET sync_status = 'synced', last_synced_at = NOW(), sync_error = NULL, updated_at = NOW() WHERE id = $1`,
        [layerId],
      );

      await client.query('COMMIT');
      logger.info({ layerId, added, updated, removed }, 'ArcGIS layer sync complete');
      return { added, updated, removed };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    await dbPool.query(
      `UPDATE gis_layers SET sync_status = 'error', sync_error = $2, updated_at = NOW() WHERE id = $1`,
      [layerId, err.message],
    );
    throw err;
  }
}

export async function getLayerMetadata(layerId: string) {
  const layer = await getLayer(layerId);
  if (layer.sourceType !== 'arcgis_feature_service' || !layer.sourceUrl) {
    throw new AppError('Not an ArcGIS layer or no URL', 'VALIDATION_ERROR', 400);
  }
  return fetchLayerMetadata(layer.sourceUrl, layer.layerIndex ?? 0, (layer as any).authToken);
}

export async function getServiceLayers(serviceUrl: string, token?: string | null) {
  return fetchServiceInfo(serviceUrl, token);
}

export async function testServiceConnection(serviceUrl: string, token?: string | null) {
  return arcgisTestConnection(serviceUrl, token);
}

export async function syncAllDueGISLayers(): Promise<number> {
  const result = await dbPool.query(
    `SELECT id FROM gis_layers
     WHERE source_type = 'arcgis_feature_service'
       AND sync_status != 'syncing'
       AND (last_synced_at IS NULL
            OR last_synced_at + (sync_interval_minutes || ' minutes')::interval < NOW())`,
  );

  let count = 0;
  for (const row of result.rows) {
    try {
      await syncArcGISLayer(row.id);
      count++;
    } catch (err: any) {
      logger.error({ layerId: row.id, error: err.message }, 'Scheduled GIS sync failed');
    }
  }
  return count;
}

// ── Auto-link features to fields (with auto-create) ──

// ArcGIS coded value domains for Structure_Type
const STRUCTURE_TYPE_CODES: Record<string, string> = {
  '1000': 'Greenhouse',
  '1001': 'Nethouse',
  '1002': 'Glasshouse',
  '1003': 'Retractable Roof Houses',
  '1004': 'Cravo',
  '1005': 'Dates Farm',
  '1006': 'PIVOT',
  '1007': 'Farm Plots',
};

// Higher = more specific. "Farm Plots" is the most generic catch-all.
const STRUCTURE_PRIORITY: Record<string, number> = {
  'Nethouse': 10,
  'Greenhouse': 10,
  'Glasshouse': 10,
  'Retractable Roof Houses': 10,
  'Cravo': 10,
  'Dates Farm': 10,
  'PIVOT': 8,
  'Farm Plots': 1,
  'General': 0,
};

// Stable ArcGIS identifier, in order of preference: GlobalID > OBJECTID > FID.
// GlobalID survives republishes; OBJECTID is stable within a service lifetime.
function extractExternalId(props: Record<string, any>): string | null {
  const candidates = [
    props.GlobalID, props.globalid, props.GLOBALID, props.GLOBALID_1,
    props.OBJECTID, props.objectid, props.OBJECTID_1, props.ObjectID,
    props.FID, props.fid,
  ];
  for (const candidate of candidates) {
    if (candidate === 0) return '0';
    if (candidate) return String(candidate).trim();
  }
  return null;
}

/**
 * Key fields of a layer may be named differently from Agro_Structures. The
 * layer's attribute_mapping (set on the ArcGIS connection page) names them;
 * values are copied onto the canonical names the linking code reads.
 */
const CANONICAL_KEYS: Record<string, string> = {
  globalId: 'GlobalID', zoneId: 'ZONE_ID', site: 'SITE', siteCode: 'Site_Code',
  farmCode: 'Farm_Code', farmName: 'Farm_Name', structureType: 'Structure_Type',
};
export function applyKeyMapping(props: Record<string, any>, mapping?: Record<string, string> | null): Record<string, any> {
  if (!mapping) return props;
  const out = { ...props };
  Object.entries(CANONICAL_KEYS).forEach(([role, canonical]) => {
    const source = mapping[role];
    if (source && source !== canonical && props[source] !== undefined && props[source] !== null) {
      out[canonical] = props[source];
    }
  });
  return out;
}

function extractFeatureProps(props: Record<string, any>) {
  const rawSite = (
    props.SITE || props.site || props.Site || props.site_name ||
    props.SITE_NAME || props.SiteName || ''
  ).toString().trim();

  const rawStructure = (
    props.Structure_Type || props.structure_type || props.STRUCTURE_TYPE ||
    props.StructureType || ''
  ).toString().trim();

  return {
    farmName: (
      props.Farm_Name || props.farm_name || props.FARM_NAME ||
      props.field_name || props.FIELD_NAME || props.FieldName || ''
    ).toString().trim(),
    farmCode: (
      props.Farm_Code || props.farm_code || props.FARM_CODE || ''
    ).toString().trim(),
    zoneId: (
      props.ZONE_ID || props.zone_id || props.ZoneID || props.Zone ||
      props.zone || props.ZONE || ''
    ).toString().trim(),
    siteCode: (
      props.Site_Code || props.site_code || props.SITE_CODE || props.SiteCode || ''
    ).toString().trim(),
    siteName: rawSite && /^\d+$/.test(rawSite) ? `Site ${rawSite}` : rawSite,
    structureType: STRUCTURE_TYPE_CODES[rawStructure] || rawStructure || (
      props.Type || props.type || ''
    ).toString().trim(),
    cropType: (
      props.Crop_Type || props.crop_type || props.CROP_TYPE ||
      props.CropType || props.crop || props.Crop || ''
    ).toString().trim(),
    variety: (
      props.Variety || props.variety || props.VARIETY ||
      props.VarietyName || props.variety_name || ''
    ).toString().trim(),
    category: (
      props.Category || props.category || props.CATEGORY || ''
    ).toString().trim(),
  };
}

function extractTrailingNumber(s: string): number | null {
  const m = s.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

function matchFeatureToField(
  props: Record<string, any>,
  fields: any[],
  excludeFieldIds?: Set<string>,
): { match: any | null; score: number; label: string } {
  const { farmName, farmCode, zoneId, siteName } = extractFeatureProps(props);
  const nFarmName = normalizeStr(farmName);
  const nZoneId = normalizeStr(zoneId);
  const nSiteName = normalizeStr(siteName);
  const label = farmName || farmCode || zoneId || 'unknown';

  if (!nFarmName && !nZoneId && !normalizeStr(farmCode)) {
    return { match: null, score: 0, label };
  }

  const featureNumber = nFarmName ? extractTrailingNumber(farmName) : null;

  let bestMatch: any = null;
  let bestScore = 0;

  for (const field of fields) {
    if (excludeFieldIds && excludeFieldIds.has(field.id)) continue;

    let score = 0;

    if (nFarmName && normalizeStr(field.name) === nFarmName) {
      score += 3;
    } else if (nFarmName && normalizeStr(field.name).includes(nFarmName)) {
      score += 1;
    } else if (nFarmName && nFarmName.includes(normalizeStr(field.name))) {
      score += 1;
    } else if (featureNumber !== null) {
      const fieldNumber = extractTrailingNumber(field.name);
      if (fieldNumber !== null && featureNumber === fieldNumber) {
        score += 2;
      }
    }

    if (nZoneId) {
      if (normalizeStr(field.country_code) === nZoneId) score += 2;
      else if (normalizeStr(field.country_name) === nZoneId) score += 2;
      else if (normalizeStr(field.farm_area_name).includes(nZoneId)) score += 1;
    }

    if (nSiteName) {
      if (normalizeStr(field.site_name) === nSiteName) score += 2;
      else if (normalizeStr(field.site_name).includes(nSiteName)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = field;
    }
  }

  return { match: bestMatch, score: bestScore, label };
}

export type HierarchyCache = {
  countries: Map<string, string>;
  sites: Map<string, string>;
  farmAreas: Map<string, string>;
  fieldTypes: Map<string, string>;
  fields: Map<string, { fieldId: string; farmAreaId: string }>;
};

// Ensure the Zone > Site > Farm Area hierarchy exists, returns IDs
export async function ensureHierarchy(
  props: Record<string, any>,
  cache: HierarchyCache,
  organizationId: string,
): Promise<{ farmAreaId: string; fieldTypeId: string | null } | null> {
  const { zoneId, siteName, structureType } = extractFeatureProps(props);
  if (!zoneId) return null;

  // 1. Find or create country/zone
  const countryKey = normalizeStr(zoneId);
  let countryId = cache.countries.get(countryKey);
  if (!countryId) {
    const existing = await dbPool.query(
      `SELECT id, deleted_at FROM countries WHERE LOWER(code) = $1 LIMIT 1`,
      [countryKey],
    );
    if (existing.rows.length > 0) {
      const existingCountryId: string = existing.rows[0].id;
      countryId = existingCountryId;
      if (existing.rows[0].deleted_at) {
        await dbPool.query(`UPDATE countries SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [existingCountryId]);
        logger.info({ zoneId, countryId: existingCountryId }, 'Reactivated soft-deleted zone from GIS');
      }
      await stampOrgIfNull('countries', existingCountryId, organizationId);
    } else {
      const inserted = await dbPool.query(
        `INSERT INTO countries (name, code, organization_id) VALUES ($1, $2, $3) RETURNING id`,
        [zoneId.toUpperCase(), zoneId.toUpperCase(), organizationId],
      );
      countryId = inserted.rows[0].id;
      logger.info({ zoneId, countryId }, 'Auto-created zone/country from GIS');
    }
    cache.countries.set(countryKey, countryId!);
  }

  // 2. Find or create site
  const siteLabel = siteName || 'Default Site';
  const siteKey = `${countryKey}::${normalizeStr(siteLabel)}`;
  let siteId = cache.sites.get(siteKey);
  if (!siteId) {
    const existing = await dbPool.query(
      `SELECT id, deleted_at FROM sites WHERE country_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [countryId!, siteLabel],
    );
    if (existing.rows.length > 0) {
      const existingSiteId: string = existing.rows[0].id;
      siteId = existingSiteId;
      if (existing.rows[0].deleted_at) {
        await dbPool.query(`UPDATE sites SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [existingSiteId]);
        logger.info({ siteLabel, siteId: existingSiteId }, 'Reactivated soft-deleted site from GIS');
      }
      await stampOrgIfNull('sites', existingSiteId, organizationId);
    } else {
      const inserted = await dbPool.query(
        `INSERT INTO sites (country_id, name, organization_id) VALUES ($1, $2, $3) RETURNING id`,
        [countryId!, siteLabel, organizationId],
      );
      siteId = inserted.rows[0].id;
      logger.info({ siteLabel, siteId, countryId }, 'Auto-created site from GIS');
    }
    cache.sites.set(siteKey, siteId!);
  }

  // 3. Find or create farm area
  const areaLabel = structureType || 'General';
  const areaKey = `${siteKey}::${normalizeStr(areaLabel)}`;
  let farmAreaId = cache.farmAreas.get(areaKey);
  if (!farmAreaId) {
    const existing = await dbPool.query(
      `SELECT id, deleted_at FROM farm_areas WHERE site_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [siteId!, areaLabel],
    );
    if (existing.rows.length > 0) {
      farmAreaId = existing.rows[0].id;
      if (existing.rows[0].deleted_at) {
        await dbPool.query(`UPDATE farm_areas SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [farmAreaId]);
        logger.info({ areaLabel, farmAreaId }, 'Reactivated soft-deleted farm area from GIS');
      }
    } else {
      const inserted = await dbPool.query(
        `INSERT INTO farm_areas (site_id, name) VALUES ($1, $2) RETURNING id`,
        [siteId!, areaLabel],
      );
      farmAreaId = inserted.rows[0].id;
      logger.info({ areaLabel, farmAreaId, siteId }, 'Auto-created farm area from GIS');
    }
    cache.farmAreas.set(areaKey, farmAreaId!);
  }

  // 4. Find or create field type
  let fieldTypeId: string | null = null;
  if (structureType) {
    const ftKey = normalizeStr(structureType);
    const cached = cache.fieldTypes.get(ftKey);
    if (cached) {
      fieldTypeId = cached;
    } else {
      const existing = await dbPool.query(
        `SELECT id FROM field_types WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [structureType],
      );
      if (existing.rows.length > 0) {
        fieldTypeId = existing.rows[0].id;
      } else {
        const inserted = await dbPool.query(
          `INSERT INTO field_types (name) VALUES ($1) RETURNING id`,
          [structureType],
        );
        fieldTypeId = inserted.rows[0].id;
        logger.info({ structureType, fieldTypeId }, 'Auto-created field type from GIS');
      }
      cache.fieldTypes.set(ftKey, fieldTypeId!);
    }
  }

  return { farmAreaId: farmAreaId!, fieldTypeId };
}

// Apply crop and variety from GIS feature data to an existing field
async function applyCropAndVariety(
  fieldId: string,
  props: Record<string, any>,
  cropCache: Map<string, string | null>,
  varietyCache: Map<string, string | null>,
): Promise<void> {
  const { cropType, variety } = extractFeatureProps(props);
  if (!cropType) return;

  // Look up crop by name (fuzzy: try exact, then LIKE %name%)
  const cropKey = cropType.toLowerCase();
  let cropId = cropCache.get(cropKey);
  if (cropId === undefined) {
    const exact = await dbPool.query(
      `SELECT id FROM crops WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [cropType],
    );
    if (exact.rows.length > 0) {
      cropId = exact.rows[0].id;
    } else {
      const fuzzy = await dbPool.query(
        `SELECT id FROM crops WHERE LOWER(name) LIKE '%' || LOWER($1) || '%'
         OR LOWER($1) LIKE '%' || LOWER(name) || '%' LIMIT 1`,
        [cropType],
      );
      cropId = fuzzy.rows.length > 0 ? fuzzy.rows[0].id : null;
    }
    cropCache.set(cropKey, cropId ?? null);
  }
  if (!cropId) return;

  // Look up variety by name — try multiple strategies:
  // 1. Exact match on GIS variety field
  // 2. Check if Crop_Type starts with a known variety (e.g., "Plum Tomato" → variety "Plum")
  let varietyId: string | null = null;
  const varKey = `${cropId}::${(variety || cropType).toLowerCase()}`;
  const cached = varietyCache.get(varKey);
  if (cached !== undefined) {
    varietyId = cached;
  } else {
    if (variety) {
      const result = await dbPool.query(
        `SELECT id FROM crop_varieties WHERE crop_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [cropId, variety],
      );
      if (result.rows.length > 0) varietyId = result.rows[0].id;
    }
    if (!varietyId && cropType) {
      // e.g. Crop_Type "Plum Tomato" → check if "Plum" is a variety of crop "Tomato"
      const allVarieties = await dbPool.query(
        `SELECT id, name FROM crop_varieties WHERE crop_id = $1`,
        [cropId],
      );
      const cropTypeLower = cropType.toLowerCase();
      for (const v of allVarieties.rows) {
        if (cropTypeLower.includes(v.name.toLowerCase())) {
          varietyId = v.id;
          break;
        }
      }
    }
    varietyCache.set(varKey, varietyId);
  }

  const current = await dbPool.query(
    `SELECT current_crop_id, variety_id FROM fields WHERE id = $1`,
    [fieldId],
  );
  const existingCrop = current.rows[0]?.current_crop_id;
  const existingVariety = current.rows[0]?.variety_id;

  if (existingCrop && existingVariety) return; // both already set

  // If the field already has a crop but no variety, use its existing crop_id for variety lookup
  const effectiveCropId = existingCrop || cropId;

  // Re-lookup variety against the effective crop if it differs from what we found
  let finalVarietyId = varietyId;
  if (!finalVarietyId && existingCrop && existingCrop !== cropId) {
    const allVarieties = await dbPool.query(
      `SELECT id, name FROM crop_varieties WHERE crop_id = $1`,
      [existingCrop],
    );
    const ct = cropType.toLowerCase();
    const vr = variety.toLowerCase();
    for (const v of allVarieties.rows) {
      const vn = v.name.toLowerCase();
      if ((vr && vn === vr) || ct.includes(vn)) {
        finalVarietyId = v.id;
        break;
      }
    }
  }

  await dbPool.query(
    `UPDATE fields SET current_crop_id = COALESCE(current_crop_id, $1), variety_id = COALESCE(variety_id, $2), updated_at = NOW() WHERE id = $3`,
    [cropId, finalVarietyId, fieldId],
  );

  // Add to crop history if not already there
  const historyExists = await dbPool.query(
    `SELECT 1 FROM crop_history WHERE field_id = $1 AND crop_id = $2 AND end_date IS NULL LIMIT 1`,
    [fieldId, cropId],
  );
  if (historyExists.rows.length === 0) {
    await dbPool.query(
      `INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
       VALUES ($1, $2, $3, NOW()::date, NULL, NULL)
       ON CONFLICT (field_id, crop_id, start_date) DO UPDATE SET
         variety_id = COALESCE(crop_history.variety_id, EXCLUDED.variety_id),
         end_date = NULL
       RETURNING id`,
      [fieldId, cropId, finalVarietyId || null],
    );
  }
}

function ringCentroid(ring: Array<[number, number]>): { latitude: number; longitude: number } | null {
  if (!ring.length) return null;
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of ring) {
    sumLat += lat;
    sumLng += lng;
  }
  return {
    latitude: Number((sumLat / ring.length).toFixed(7)),
    longitude: Number((sumLng / ring.length).toFixed(7)),
  };
}

function centroidFromGeometry(geometry: any): { latitude: number; longitude: number } | null {
  if (!geometry?.type) return null;
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    return { latitude: Number(Number(lat).toFixed(7)), longitude: Number(Number(lng).toFixed(7)) };
  }
  if (geometry.type === 'Polygon') {
    return ringCentroid(geometry.coordinates?.[0] || []);
  }
  if (geometry.type === 'MultiPolygon') {
    return ringCentroid(geometry.coordinates?.[0]?.[0] || []);
  }
  return null;
}

async function syncFieldGeometryFromGeoJson(fieldId: string, geometry: any): Promise<void> {
  const center = centroidFromGeometry(geometry);
  if (!center) return;

  const geojsonStr = JSON.stringify(geometry);
  try {
    await dbPool.query(
      `UPDATE fields
       SET latitude = $1, longitude = $2,
           polygon = ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
           updated_at = NOW()
       WHERE id = $4`,
      [center.latitude, center.longitude, geojsonStr, fieldId],
    );
    return;
  } catch {
    // PostGIS unavailable or polygon column is jsonb — store coords only
  }

  try {
    await dbPool.query(
      `UPDATE fields
       SET latitude = $1, longitude = $2, polygon = $3::jsonb, updated_at = NOW()
       WHERE id = $4`,
      [center.latitude, center.longitude, geojsonStr, fieldId],
    );
  } catch (err: any) {
    await dbPool.query(
      `UPDATE fields SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3`,
      [center.latitude, center.longitude, fieldId],
    );
    logger.warn({ err: err.message, fieldId }, 'Stored GIS centroid without polygon on field');
  }
}

async function syncFieldGeometryFromGisFeature(fieldId: string, featureId: string): Promise<void> {
  try {
    const result = await dbPool.query(
      `UPDATE fields f
       SET latitude = ROUND(ST_Y(ST_Centroid(gf.geometry))::numeric, 7),
           longitude = ROUND(ST_X(ST_Centroid(gf.geometry))::numeric, 7),
           polygon = gf.geometry,
           updated_at = NOW()
       FROM gis_features gf
       WHERE gf.id = $1 AND f.id = $2 AND gf.geometry IS NOT NULL
       RETURNING f.id`,
      [featureId, fieldId],
    );
    if (result.rowCount && result.rowCount > 0) return;
  } catch (err: any) {
    logger.warn({ err: err.message, fieldId, featureId }, 'PostGIS field geometry sync failed, trying GeoJSON fallback');
  }

  try {
    const geomResult = await dbPool.query(
      `SELECT ST_AsGeoJSON(geometry) AS geojson FROM gis_features WHERE id = $1`,
      [featureId],
    );
    const raw = geomResult.rows[0]?.geojson;
    if (raw) {
      await syncFieldGeometryFromGeoJson(fieldId, JSON.parse(raw));
    }
  } catch (err: any) {
    logger.warn({ err: err.message, fieldId, featureId }, 'Failed to sync field geometry from GIS feature');
  }
}

// Find or create the Zone > Site > Farm Area > Field hierarchy
export async function findOrCreateField(
  props: Record<string, any>,
  cache: HierarchyCache,
  organizationId: string,
): Promise<{ fieldId: string; farmAreaId: string } | null> {
  const { farmName } = extractFeatureProps(props);

  const hierarchy = await ensureHierarchy(props, cache, organizationId);
  if (!hierarchy) return null;
  const { farmAreaId, fieldTypeId } = hierarchy;

  if (!farmName) return null;

  const countryKey = normalizeStr(extractFeatureProps(props).zoneId);
  const siteLabel = extractFeatureProps(props).siteName || 'Default Site';
  const siteKey = `${countryKey}::${normalizeStr(siteLabel)}`;
  const areaLabel = extractFeatureProps(props).structureType || 'General';
  const areaKey = `${siteKey}::${normalizeStr(areaLabel)}`;
  const fieldKey = `${areaKey}::${normalizeStr(farmName)}`;

  const cachedField = cache.fields.get(fieldKey);
  if (cachedField) return cachedField;

  const externalId = extractExternalId(props);

  // Prefer matching by stable external_id if the feature carries one.
  let fieldId: string | null = null;
  if (externalId) {
    const byId = await dbPool.query(
      `SELECT id, deleted_at FROM fields WHERE gis_external_id = $1 LIMIT 1`,
      [externalId],
    );
    if (byId.rows.length > 0) {
      const existingFieldId: string = byId.rows[0].id;
      fieldId = existingFieldId;
      if (byId.rows[0].deleted_at) {
        await dbPool.query(
          `UPDATE fields SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`,
          [existingFieldId],
        );
        logger.info({ farmName, fieldId: existingFieldId, externalId }, 'Reactivated soft-deleted field from GIS (by external_id)');
      }
      await stampOrgIfNull('fields', existingFieldId, organizationId);
    }
  }

  if (!fieldId) {
    const existingField = await dbPool.query(
      `SELECT id, deleted_at FROM fields WHERE farm_area_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [farmAreaId, farmName],
    );
    if (existingField.rows.length > 0) {
      const existingFieldId: string = existingField.rows[0].id;
      fieldId = existingFieldId;
      if (existingField.rows[0].deleted_at) {
        await dbPool.query(`UPDATE fields SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, [existingFieldId]);
        logger.info({ farmName, fieldId: existingFieldId }, 'Reactivated soft-deleted field from GIS');
      }
      await stampOrgIfNull('fields', existingFieldId, organizationId);
    } else {
      const inserted = await dbPool.query(
        `INSERT INTO fields (farm_area_id, field_type_id, name, gis_external_id, organization_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [farmAreaId, fieldTypeId, farmName, externalId, organizationId],
      );
      fieldId = inserted.rows[0].id;
      logger.info({ farmName, fieldId, farmAreaId, externalId }, 'Auto-created field from GIS');
    }
  }

  // Both branches above guarantee fieldId is assigned; assert for TS.
  const result = { fieldId: fieldId as string, farmAreaId };
  cache.fields.set(fieldKey, result);
  return result;
}

export async function autoLinkFeatures(
  layerId: string,
  fallbackOrganizationId?: string,
): Promise<{
  linked: number; created: number; relocated: number; renamed: number; skipped: number;
  zonesCreated: number; unmatched: string[];
  diagnostics: {
    existingFieldsCount: number;
    structureBreakdown: Record<string, { total: number; withFarmName: number; withZoneId: number; sampleNames: string[] }>;
    relocatedSamples: Array<{ name: string; from: string; to: string }>;
    renamedSamples: Array<{ fieldId: string; oldName: string; newName: string }>;
    fieldLocations?: any[];
    duplicateFarmAreas?: any[];
    cropVarietySamples?: any[];
  };
}> {
  const layer = await getLayer(layerId);
  const organizationId = layer.organizationId || fallbackOrganizationId || null;
  if (!organizationId) {
    throw new AppError('GIS layer is missing organization_id', 'VALIDATION_ERROR', 400);
  }

  // Load existing fields for matching. Include gis_external_id so we can
  // match by stable ArcGIS ObjectID first (rename-safe).
  const fieldsResult = await dbPool.query(
    `SELECT f.id, f.name, f.gis_external_id, f.gis_zone_id, f.gis_farm_code,
            fa.name AS farm_area_name, fa.id AS farm_area_id,
            s.name AS site_name, s.id AS site_id, c.name AS country_name, c.code AS country_code
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN sites s ON s.id = fa.site_id
     JOIN countries c ON c.id = s.country_id
     WHERE f.deleted_at IS NULL`,
  );
  const fields = fieldsResult.rows;

  // Build a fast lookup by external_id so we can resolve features in O(1)
  // per row instead of scanning all fields every time.
  const fieldsByExternalId = new Map<string, any>();
  for (const f of fields) {
    if (f.gis_external_id) fieldsByExternalId.set(f.gis_external_id, f);
  }
  // Business key ZONE_ID + Farm_Code (stored on the field since migration 175).
  const gisKey = (zone: string, code: string) => `${normalizeStr(zone)}|${normalizeStr(code)}`;
  const fieldsByGisKey = new Map<string, any>();
  for (const f of fields) {
    if (f.gis_zone_id && f.gis_farm_code) fieldsByGisKey.set(gisKey(f.gis_zone_id, f.gis_farm_code), f);
  }
  const keyMapping = (layer as any).attributeMapping || null;

  const zonesBefore = await dbPool.query(`SELECT COUNT(*)::int AS cnt FROM countries WHERE deleted_at IS NULL`);
  const zonesCountBefore = zonesBefore.rows[0]?.cnt ?? 0;

  const cache = {
    countries: new Map<string, string>(),
    sites: new Map<string, string>(),
    farmAreas: new Map<string, string>(),
    fieldTypes: new Map<string, string>(),
    fields: new Map<string, { fieldId: string; farmAreaId: string }>(),
  };

  let linked = 0;
  let created = 0;
  let renamed = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  // Diagnostic tracking
  const structureBreakdown: Record<string, { total: number; withFarmName: number; withZoneId: number; sampleNames: string[] }> = {};
  const relocatedSamples: Array<{ name: string; from: string; to: string }> = [];
  const renamedSamples: Array<{ fieldId: string; oldName: string; newName: string }> = [];

  // Crop/variety caches for GIS import
  const cropCache = new Map<string, string | null>();
  const varietyCache = new Map<string, string | null>();

  // Diagnostic: sample crop/variety raw values from GIS
  const cropVarietySamples: Array<{ farmName: string; allPropertyKeys: string[]; rawCropType: any; rawVariety: any; extracted: { cropType: string; variety: string } }> = [];

  // Try gis_features table first (PostGIS mode)
  let useGisFeatures = false;
  try {
    const testResult = await dbPool.query(
      `SELECT COUNT(*) AS cnt FROM gis_features WHERE layer_id = $1 LIMIT 1`,
      [layerId],
    );
    useGisFeatures = Number(testResult.rows[0]?.cnt) > 0;
  } catch {
    useGisFeatures = false;
  }

  let relocated = 0;

  // Track the effective structure type for relocated fields (fieldId → priority)
  const fieldBestPriority = new Map<string, number>();

  // Prevent multiple features from matching the same field in one run
  const matchedFieldIds = new Set<string>();

  const processFeature = async (
    props: Record<string, any>,
  ): Promise<{ fieldId: string | null; farmAreaId: string | null; wasCreated: boolean }> => {
    // Track structure type diagnostics
    const extracted = extractFeatureProps(props);
    const stKey = extracted.structureType || '(empty)';
    if (!structureBreakdown[stKey]) {
      structureBreakdown[stKey] = { total: 0, withFarmName: 0, withZoneId: 0, sampleNames: [] };
    }
    structureBreakdown[stKey].total++;
    if (extracted.farmName) structureBreakdown[stKey].withFarmName++;
    if (extracted.zoneId) structureBreakdown[stKey].withZoneId++;
    if (extracted.farmName && structureBreakdown[stKey].sampleNames.length < 5) {
      structureBreakdown[stKey].sampleNames.push(extracted.farmName);
    }

    // Collect crop/variety raw samples for diagnostics (include all property keys)
    if (cropVarietySamples.length < 5 && extracted.farmName) {
      cropVarietySamples.push({
        farmName: extracted.farmName,
        allPropertyKeys: Object.keys(props),
        rawCropType: props.Crop_Type ?? props.crop_type ?? props.CROP_TYPE ?? '(missing)',
        rawVariety: props.Variety ?? props.variety ?? props.VARIETY ?? '(missing)',
        extracted: { cropType: extracted.cropType, variety: extracted.variety },
      });
    }

    // 1. Stable-id match. If the feature carries an ArcGIS ObjectID/GlobalID
    //    and we've previously linked a field with that id, use that link
    //    even if the Farm_Name has since changed in GIS.
    const externalId = extractExternalId(props);
    if (externalId) {
      const byId = fieldsByExternalId.get(externalId);
      if (byId) {
        // Detect a rename so it shows up in the sync report.
        if (extracted.farmName &&
            byId.name !== extracted.farmName) {
          try {
            await dbPool.query(
              `UPDATE fields SET name = $1, updated_at = NOW() WHERE id = $2`,
              [extracted.farmName, byId.id],
            );
            logger.info(
              { fieldId: byId.id, oldName: byId.name, newName: extracted.farmName, externalId },
              'Renamed field from GIS (matched by external_id)',
            );
            byId.name = extracted.farmName;
          } catch (err: any) {
            logger.warn({ err: err.message }, 'Failed to apply GIS-driven rename');
          }
        }
        // Relocate to correct farm area if structure type differs
        if (extracted.zoneId) {
          try {
            const hierarchy = await ensureHierarchy(props, cache, organizationId);
            if (hierarchy && hierarchy.farmAreaId !== byId.farm_area_id) {
              const newPriority = STRUCTURE_PRIORITY[extracted.structureType] ?? 5;
              const currentPriority = fieldBestPriority.get(byId.id) ??
                (STRUCTURE_PRIORITY[byId.farm_area_name] ?? 5);
              if (newPriority >= currentPriority) {
                await dbPool.query(
                  `UPDATE fields SET farm_area_id = $1, field_type_id = COALESCE($2, field_type_id), updated_at = NOW() WHERE id = $3`,
                  [hierarchy.farmAreaId, hierarchy.fieldTypeId, byId.id],
                );
                fieldBestPriority.set(byId.id, newPriority);
                if (relocatedSamples.length < 20) {
                  relocatedSamples.push({
                    name: byId.name,
                    from: byId.farm_area_name,
                    to: extracted.structureType || '(unknown)',
                  });
                }
                relocated++;
                byId.farm_area_id = hierarchy.farmAreaId;
                byId.farm_area_name = extracted.structureType || byId.farm_area_name;
              }
            }
          } catch (err: any) {
            logger.warn({ error: err.message, fieldId: byId.id },
              'ensureHierarchy failed for external_id matched field');
          }
        }

        matchedFieldIds.add(byId.id);
        return { fieldId: byId.id, farmAreaId: byId.farm_area_id, wasCreated: false };
      }
    }

    // 2. Business-key match: same ZONE_ID + Farm_Code as a field linked before.
    if (extracted.zoneId && extracted.farmCode) {
      const byKey = fieldsByGisKey.get(gisKey(extracted.zoneId, extracted.farmCode));
      if (byKey && !matchedFieldIds.has(byKey.id)) {
        matchedFieldIds.add(byKey.id);
        return { fieldId: byKey.id, farmAreaId: byKey.farm_area_id, wasCreated: false };
      }
    }

    const { match, score } = matchFeatureToField(props, fields, matchedFieldIds);

    if (match && score >= 3) {
      // Only attempt relocation if the feature's Farm_Name exactly matches the field name.
      // Generic features (no Farm_Name) can link but must not relocate fields.
      const nameMatches = extracted.farmName &&
        normalizeStr(extracted.farmName) === normalizeStr(match.name);

      if (nameMatches && extracted.zoneId) {
        try {
          const hierarchy = await ensureHierarchy(props, cache, organizationId);
          if (hierarchy && hierarchy.farmAreaId !== match.farm_area_id) {
            const newPriority = STRUCTURE_PRIORITY[extracted.structureType] ?? 5;
            const currentPriority = fieldBestPriority.get(match.id) ??
              (STRUCTURE_PRIORITY[match.farm_area_name] ?? 5);

            // Only relocate to a higher-priority (more specific) structure type
            if (newPriority >= currentPriority) {
              await dbPool.query(
                `UPDATE fields SET farm_area_id = $1, field_type_id = COALESCE($2, field_type_id), updated_at = NOW() WHERE id = $3`,
                [hierarchy.farmAreaId, hierarchy.fieldTypeId, match.id],
              );
              fieldBestPriority.set(match.id, newPriority);
              if (relocatedSamples.length < 20) {
                relocatedSamples.push({
                  name: match.name,
                  from: match.farm_area_name,
                  to: extracted.structureType || '(unknown)',
                });
              }
              logger.info(
                { fieldName: match.name, fieldId: match.id, oldFarmAreaId: match.farm_area_id, newFarmAreaId: hierarchy.farmAreaId },
                'Relocated field to correct GIS hierarchy',
              );
              relocated++;
              matchedFieldIds.add(match.id);
              return { fieldId: match.id, farmAreaId: hierarchy.farmAreaId, wasCreated: false };
            }
          }
        } catch (err: any) {
          logger.warn({ error: err.message, fieldId: match.id }, 'ensureHierarchy failed for matched field');
        }
      }
      matchedFieldIds.add(match.id);
      return { fieldId: match.id, farmAreaId: match.farm_area_id, wasCreated: false };
    }

    try {
      const autoCreated = await findOrCreateField(props, cache, organizationId);
      if (autoCreated) {
        matchedFieldIds.add(autoCreated.fieldId);
        return { fieldId: autoCreated.fieldId, farmAreaId: autoCreated.farmAreaId, wasCreated: true };
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'findOrCreateField failed');
    }

    return { fieldId: null, farmAreaId: null, wasCreated: false };
  };

  // Stamp the stable ArcGIS identifier onto a linked field so future syncs
  // can match by id instead of name. We tolerate conflicts silently: if the
  // same id is somehow claimed by two fields, we just log and move on — the
  // unique index prevents data corruption.
  const stampExternalId = async (fieldId: string, props: Record<string, any>) => {
    const externalId = extractExternalId(props);
    if (!externalId) return;
    try {
      await dbPool.query(
        `UPDATE fields
           SET gis_external_id = $1, updated_at = NOW()
         WHERE id = $2 AND (gis_external_id IS NULL OR gis_external_id = $1)`,
        [externalId, fieldId],
      );
      const { zoneId, farmCode, siteCode } = extractFeatureProps(props);
      if (zoneId || farmCode || siteCode) {
        try {
          await dbPool.query(
            `UPDATE fields
                SET gis_zone_id   = COALESCE(NULLIF($1, ''), gis_zone_id),
                    gis_farm_code = COALESCE(NULLIF($2, ''), gis_farm_code),
                    gis_site_code = COALESCE(NULLIF($3, ''), gis_site_code),
                    gis_synced_at = NOW()
              WHERE id = $4`,
            [zoneId, farmCode, siteCode, fieldId],
          );
          if (siteCode) {
            await dbPool.query(
              `UPDATE sites SET gis_site_code = $1
                WHERE id = (SELECT fa.site_id FROM fields f JOIN farm_areas fa ON fa.id = f.farm_area_id WHERE f.id = $2)
                  AND gis_site_code IS NULL`,
              [siteCode, fieldId],
            );
          }
          if (zoneId && farmCode) {
            const cachedField = fields.find((f: any) => f.id === fieldId);
            if (cachedField) fieldsByGisKey.set(gisKey(zoneId, farmCode), cachedField);
          }
        } catch (err: any) {
          logger.warn(
            { err: err.message, fieldId, zoneId, farmCode },
            err?.code === '23505'
              ? 'Another field already has this ZONE_ID + Farm_Code — see bi.gis_link_issues'
              : 'Failed to stamp GIS keys',
          );
        }
      }
      // Keep the in-memory cache fresh so subsequent features in the same
      // run can benefit from the id.
      const cached = fields.find((f: any) => f.id === fieldId);
      if (cached && !cached.gis_external_id) {
        cached.gis_external_id = externalId;
        fieldsByExternalId.set(externalId, cached);
      }
    } catch (err: any) {
      if (err?.code === '23505') {
        logger.warn(
          { externalId, fieldId },
          'Duplicate gis_external_id — another field already owns this ArcGIS id',
        );
      } else {
        logger.warn({ err: err.message, externalId, fieldId }, 'Failed to stamp gis_external_id');
      }
    }
  };

  if (useGisFeatures) {
    const featuresResult = await dbPool.query(
      `SELECT id, properties, linked_field_id FROM gis_features WHERE layer_id = $1`,
      [layerId],
    );

    // Build a lookup of previously linked field IDs so we can detect renames
    // even when gis_external_id or name-based matching fails.
    const linkedFieldIds = new Set<string>();
    for (const f of featuresResult.rows) {
      if (f.linked_field_id) linkedFieldIds.add(f.linked_field_id);
    }
    let previouslyLinkedFields = new Map<string, { id: string; name: string }>();
    if (linkedFieldIds.size > 0) {
      const linkedResult = await dbPool.query(
        `SELECT id, name FROM fields WHERE id = ANY($1) AND deleted_at IS NULL`,
        [Array.from(linkedFieldIds)],
      );
      for (const row of linkedResult.rows) {
        previouslyLinkedFields.set(row.id, row);
      }
    }

    for (const feature of featuresResult.rows) {
      const props = applyKeyMapping(feature.properties || {}, keyMapping);
      const extracted = extractFeatureProps(props);

      // If this feature was previously linked to a field and the GIS name
      // has changed, rename the field (only updates name, preserves all data).
      if (feature.linked_field_id && previouslyLinkedFields.has(feature.linked_field_id)) {
        const linkedField = previouslyLinkedFields.get(feature.linked_field_id)!;
        if (extracted.farmName &&
            linkedField.name !== extracted.farmName) {
          try {
            await dbPool.query(
              `UPDATE fields SET name = $1, updated_at = NOW() WHERE id = $2`,
              [extracted.farmName, linkedField.id],
            );
            logger.info(
              { fieldId: linkedField.id, oldName: linkedField.name, newName: extracted.farmName },
              'Renamed field from GIS (matched by previous linked_field_id)',
            );
            if (renamedSamples.length < 30) {
              renamedSamples.push({ fieldId: linkedField.id, oldName: linkedField.name, newName: extracted.farmName });
            }
            renamed++;
            linkedField.name = extracted.farmName;
            // Also update the in-memory fields list so processFeature sees the new name
            const inMemField = fields.find((f: any) => f.id === linkedField.id);
            if (inMemField) inMemField.name = extracted.farmName;
          } catch (err: any) {
            logger.warn({ err: err.message, fieldId: linkedField.id }, 'Failed to apply GIS-driven rename via linked_field_id');
          }
        }
      }

      const { fieldId, farmAreaId, wasCreated } = await processFeature(props);

      if (fieldId && !wasCreated && extracted.farmName) {
        const existingField = fields.find((f: any) => f.id === fieldId);
        if (existingField && existingField.name !== extracted.farmName) {
          try {
            await dbPool.query(
              `UPDATE fields SET name = $1, updated_at = NOW() WHERE id = $2`,
              [extracted.farmName, fieldId],
            );
            logger.info(
              { fieldId, oldName: existingField.name, newName: extracted.farmName },
              'Renamed field to match GIS Farm_Name',
            );
            if (renamedSamples.length < 30) {
              renamedSamples.push({ fieldId, oldName: existingField.name, newName: extracted.farmName });
            }
            renamed++;
            existingField.name = extracted.farmName;
          } catch (err: any) {
            logger.warn({ err: err.message, fieldId }, 'Failed to rename field from GIS Farm_Name');
          }
        }
      }

      if (fieldId) {
        await stampExternalId(fieldId, props);
        await stampOrgIfNull('fields', fieldId, organizationId);
      }
      if (wasCreated) created++;

      if (fieldId) {
        await dbPool.query(
          `UPDATE gis_features SET linked_field_id = $2, linked_farm_area_id = $3, updated_at = NOW()
           WHERE id = $1`,
          [feature.id, fieldId, farmAreaId],
        );
        await syncFieldGeometryFromGisFeature(fieldId, feature.id);
        linked++;
      } else {
        const { farmName } = extractFeatureProps(props);
        unmatched.push(farmName || `feature-${feature.id.slice(0, 8)}`);
        skipped++;
      }
    }
  } else {
    const layerResult = await dbPool.query(
      `SELECT geojson_data FROM gis_layers WHERE id = $1`,
      [layerId],
    );
    const geojson = layerResult.rows[0]?.geojson_data;
    if (!geojson?.features?.length) {
      return { linked: 0, created: 0, relocated: 0, renamed: 0, skipped: 0, zonesCreated: 0, unmatched: ['No features found in layer'],
        diagnostics: { existingFieldsCount: fields.length, structureBreakdown, relocatedSamples, renamedSamples, cropVarietySamples } };
    }

    for (const feature of geojson.features) {
      const props = applyKeyMapping(feature.properties || {}, keyMapping);
      const { fieldId, farmAreaId, wasCreated } = await processFeature(props);

      if (fieldId && !wasCreated) {
        const extracted = extractFeatureProps(props);
        if (extracted.farmName) {
          const existingField = fields.find((f: any) => f.id === fieldId);
          if (existingField && existingField.name !== extracted.farmName) {
            try {
              await dbPool.query(
                `UPDATE fields SET name = $1, updated_at = NOW() WHERE id = $2`,
                [extracted.farmName, fieldId],
              );
              logger.info(
                { fieldId, oldName: existingField.name, newName: extracted.farmName },
                'Renamed field to match GIS Farm_Name',
              );
              if (renamedSamples.length < 30) {
                renamedSamples.push({ fieldId, oldName: existingField.name, newName: extracted.farmName });
              }
              renamed++;
              existingField.name = extracted.farmName;
            } catch (err: any) {
              logger.warn({ err: err.message, fieldId }, 'Failed to rename field from GIS Farm_Name');
            }
          }
        }
      }

      if (fieldId) {
        await stampExternalId(fieldId, props);
        await stampOrgIfNull('fields', fieldId, organizationId);
      }
      if (wasCreated) created++;

      if (fieldId) {
        feature.properties = {
          ...props,
          _linkedFieldId: fieldId,
          _linkedFarmAreaId: farmAreaId,
        };
        if (feature.geometry) {
          await syncFieldGeometryFromGeoJson(fieldId, feature.geometry);
        }
        linked++;
      } else {
        const { farmName } = extractFeatureProps(props);
        unmatched.push(farmName || 'unknown');
        skipped++;
      }
    }

    await dbPool.query(
      `UPDATE gis_layers SET geojson_data = $2, updated_at = NOW() WHERE id = $1`,
      [layerId, JSON.stringify(geojson)],
    );
  }

  const zonesAfter = await dbPool.query(`SELECT COUNT(*)::int AS cnt FROM countries WHERE deleted_at IS NULL`);
  const zonesCountAfter = zonesAfter.rows[0]?.cnt ?? 0;
  const zonesCreated = zonesCountAfter - zonesCountBefore;

  // Merge duplicate sites: bare numeric "1" into "Site 1" under the same zone
  try {
    const dupes = await dbPool.query(
      `SELECT s1.id AS old_id, s1.name AS old_name, s2.id AS new_id, s2.name AS new_name, s1.country_id
       FROM sites s1
       JOIN sites s2 ON s2.country_id = s1.country_id
         AND s2.name = 'Site ' || s1.name
         AND s2.id != s1.id
         AND s2.deleted_at IS NULL
       WHERE s1.name ~ '^\\d+$'
         AND s1.deleted_at IS NULL`,
    );
    for (const dupe of dupes.rows) {
      // Move farm areas from old site to new site (skip if name already exists under target)
      const farmAreas = await dbPool.query(
        `SELECT id, name FROM farm_areas WHERE site_id = $1 AND deleted_at IS NULL`,
        [dupe.old_id],
      );
      for (const fa of farmAreas.rows) {
        const existing = await dbPool.query(
          `SELECT id FROM farm_areas WHERE site_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL LIMIT 1`,
          [dupe.new_id, fa.name],
        );
        if (existing.rows.length > 0) {
          // Target farm area exists -- move fields from duplicate to target
          await dbPool.query(
            `UPDATE fields SET farm_area_id = $1, updated_at = NOW() WHERE farm_area_id = $2 AND deleted_at IS NULL`,
            [existing.rows[0].id, fa.id],
          );
          await dbPool.query(`UPDATE farm_areas SET deleted_at = NOW() WHERE id = $1`, [fa.id]);
        } else {
          await dbPool.query(
            `UPDATE farm_areas SET site_id = $1, updated_at = NOW() WHERE id = $2`,
            [dupe.new_id, fa.id],
          );
        }
      }
      await dbPool.query(`UPDATE sites SET deleted_at = NOW() WHERE id = $1`, [dupe.old_id]);
      logger.info({ oldSite: dupe.old_name, newSite: dupe.new_name, countryId: dupe.country_id }, 'Merged duplicate site');
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Duplicate site merge failed (non-fatal)');
  }

  // Diagnostic: show where NH fields actually are in the DB
  let fieldLocations: any[] = [];
  try {
    const locResult = await dbPool.query(
      `SELECT f.name AS field_name, f.farm_area_id,
              fa.name AS farm_area, fa.deleted_at IS NOT NULL AS fa_deleted,
              s.name AS site_name, s.id AS site_id, s.deleted_at IS NOT NULL AS s_deleted,
              c.name AS zone_name, c.code AS zone_code, c.deleted_at IS NOT NULL AS c_deleted
       FROM fields f
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN sites s ON s.id = fa.site_id
       LEFT JOIN countries c ON c.id = s.country_id
       WHERE f.name LIKE 'NH-%' AND f.deleted_at IS NULL
       ORDER BY f.name
       LIMIT 15`,
    );
    fieldLocations = locResult.rows;
  } catch { /* ignore */ }

  // Count duplicates
  let duplicateFarmAreas: any[] = [];
  try {
    const dupResult = await dbPool.query(
      `SELECT fa.name, fa.id, s.name AS site_name, fa.deleted_at IS NOT NULL AS is_deleted,
              (SELECT COUNT(*) FROM fields f2 WHERE f2.farm_area_id = fa.id AND f2.deleted_at IS NULL) AS field_count
       FROM farm_areas fa
       JOIN sites s ON s.id = fa.site_id
       JOIN countries c ON c.id = s.country_id
       WHERE LOWER(fa.name) = 'nethouse'
       ORDER BY fa.id`,
    );
    duplicateFarmAreas = dupResult.rows;
  } catch { /* ignore */ }

  logger.info({ layerId, linked, created, relocated, renamed, skipped, zonesCreated, unmatched: unmatched.length }, 'Auto-link completed');
  return {
    linked, created, relocated, renamed, skipped, zonesCreated, unmatched,
    diagnostics: { existingFieldsCount: fields.length, structureBreakdown, relocatedSamples, renamedSamples, fieldLocations, duplicateFarmAreas, cropVarietySamples },
  };
}

function normalizeStr(s: string): string {
  return String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

// ── File upload feature import ──

export async function importGeoJSONFeatures(
  layerId: string,
  geojson: { type: string; features: any[] },
): Promise<number> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    let count = 0;
    for (const feature of geojson.features) {
      if (!feature.geometry) continue;
      const geojsonStr = JSON.stringify(feature.geometry);
      const propsStr = JSON.stringify(feature.properties ?? {});

      await client.query(
        `INSERT INTO gis_features (layer_id, external_id, geometry, properties)
         VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4)`,
        [layerId, feature.id ? String(feature.id) : null, geojsonStr, propsStr],
      );
      count++;
    }

    await client.query(
      `UPDATE gis_layers SET sync_status = 'synced', last_synced_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [layerId],
    );

    await client.query('COMMIT');
    return count;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
