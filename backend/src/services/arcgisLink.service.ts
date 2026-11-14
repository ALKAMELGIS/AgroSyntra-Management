import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';
import { fetchLayerJson, parseFeatureServiceUrl, queryJson } from './arcgis.service';
import { formsForFields, featuresForField } from './formRegistry.service';

/**
 * ArcGIS ↔ forms link (phase 2).
 *
 * The user supplies the layer link (nothing is hard-coded). The layer is only
 * read: its description and attributes are fetched with f=json queries; no
 * edit, add or delete request is ever sent, and no layer is created.
 *
 * Link chain:  ArcGIS feature ─(GlobalID, or ZONE_ID + Farm_Code)─▶ AgroCloud field
 *              ─(field_id)─▶ form records ─(FORM_ID)─▶ form.
 */

export type KeyRole = 'globalId' | 'zoneId' | 'site' | 'siteCode' | 'farmCode' | 'farmName' | 'structureType';
export type KeyMapping = Partial<Record<KeyRole, string>>;

export const KEY_ROLES: Array<{ role: KeyRole; label: string; required: boolean; candidates: string[] }> = [
  { role: 'globalId', label: 'Global ID (stable feature id)', required: true, candidates: ['GlobalID', 'GLOBALID', 'globalid'] },
  { role: 'zoneId', label: 'Zone', required: true, candidates: ['ZONE_ID', 'Zone_ID', 'ZoneID', 'ZONE', 'Zone'] },
  { role: 'farmCode', label: 'Farm code', required: true, candidates: ['Farm_Code', 'FARM_CODE', 'FarmCode', 'farm_code'] },
  { role: 'farmName', label: 'Farm / structure name', required: false, candidates: ['Farm_Name', 'FARM_NAME', 'FarmName', 'Name'] },
  { role: 'site', label: 'Site', required: false, candidates: ['SITE', 'Site', 'site'] },
  { role: 'siteCode', label: 'Site code', required: false, candidates: ['Site_Code', 'SITE_CODE', 'SiteCode'] },
  { role: 'structureType', label: 'Structure type', required: false, candidates: ['Structure_Type', 'STRUCTURE_TYPE', 'StructureType'] },
];

interface LayerField { name: string; alias: string; type: string; length?: number; domain?: Array<{ code: any; name: string }> | null }

/** Picks the layer field for each key role (case-insensitive), using GlobalID / display / type-id fields as hints. */
export function detectKeyFields(layer: any, override?: KeyMapping): KeyMapping {
  const names: string[] = (layer.fields || []).map((f: any) => f.name);
  const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const out: KeyMapping = {};
  KEY_ROLES.forEach(({ role, candidates }) => {
    const hinted = role === 'globalId' ? layer.globalIdField
      : role === 'structureType' ? layer.typeIdField
        : role === 'farmName' ? layer.displayField : null;
    const found = candidates.map((c) => byLower.get(c.toLowerCase())).find(Boolean)
      || (hinted && byLower.get(String(hinted).toLowerCase()));
    if (found) out[role] = found;
  });
  if (override) {
    Object.entries(override).forEach(([role, name]) => {
      if (name && byLower.has(String(name).toLowerCase())) out[role as KeyRole] = byLower.get(String(name).toLowerCase());
      else if (name === '') delete out[role as KeyRole];
    });
  }
  return out;
}

function codedValues(layer: any, fieldName?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fieldName) return map;
  const f = (layer.fields || []).find((x: any) => x.name === fieldName);
  (f?.domain?.codedValues || []).forEach((cv: any) => map.set(String(cv.code), cv.name));
  if (layer.typeIdField === fieldName) {
    (layer.types || []).forEach((t: any) => map.set(String(t.id), t.name));
  }
  return map;
}

const norm = (v: any) => String(v ?? '').trim().toUpperCase();

/** Pure analysis of the key attributes, so it can be unit-tested without ArcGIS. */
export function analyzeKeys(rows: Array<Record<string, any>>, mapping: KeyMapping, layer: any) {
  const siteLabels = codedValues(layer, mapping.site);
  const typeLabels = codedValues(layer, mapping.structureType);
  const keyCount = new Map<string, number>();
  const zones = new Map<string, number>();
  const sites = new Map<string, number>();
  const types = new Map<string, number>();
  let missingZone = 0; let missingFarmCode = 0; let missingGlobalId = 0;
  rows.forEach((r) => {
    const zone = norm(mapping.zoneId ? r[mapping.zoneId] : '');
    const code = norm(mapping.farmCode ? r[mapping.farmCode] : '');
    if (!zone) missingZone += 1;
    if (!code) missingFarmCode += 1;
    if (mapping.globalId && !r[mapping.globalId]) missingGlobalId += 1;
    if (zone) zones.set(zone, (zones.get(zone) || 0) + 1);
    if (zone && code) keyCount.set(`${zone}|${code}`, (keyCount.get(`${zone}|${code}`) || 0) + 1);
    if (mapping.site) {
      const raw = r[mapping.site];
      const label = raw === null || raw === undefined || raw === '' ? '(empty)' : siteLabels.get(String(raw)) || String(raw);
      const key = raw === null || raw === undefined || raw === '' ? label : `${raw} · ${label}`;
      sites.set(key, (sites.get(key) || 0) + 1);
    }
    if (mapping.structureType) {
      const raw = r[mapping.structureType];
      const label = typeLabels.get(String(raw)) || (raw === null || raw === undefined ? '(empty)' : String(raw));
      types.set(label, (types.get(label) || 0) + 1);
    }
  });
  const duplicates = [...keyCount.entries()].filter(([, n]) => n > 1)
    .map(([k, n]) => { const [zone, farmCode] = k.split('|'); return { zone, farmCode, count: n }; });
  const toList = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  const notApplicableSite = [...siteLabels.entries()].find(([, name]) => /not\s*applicable|n\/a/i.test(name));
  return {
    featuresRead: rows.length,
    missingZone, missingFarmCode, missingGlobalId,
    uniqueKeys: keyCount.size,
    duplicates: duplicates.slice(0, 200),
    duplicateCount: duplicates.length,
    zones: toList(zones),
    sites: toList(sites),
    structureTypes: toList(types),
    notApplicableSiteCode: notApplicableSite ? notApplicableSite[0] : null,
  };
}

async function readKeyAttributes(baseUrl: string, layerIndex: number, mapping: KeyMapping, layer: any, token?: string | null) {
  const outFields = [...new Set(Object.values(mapping).filter(Boolean) as string[])];
  if (!outFields.length) return [];
  const page = Math.min(Number(layer.maxRecordCount) || 1000, 2000);
  const rows: any[] = [];
  const oid = layer.objectIdField || 'OBJECTID';
  for (let offset = 0; offset < 50000; offset += page) {
    // eslint-disable-next-line no-await-in-loop
    const data = await queryJson(baseUrl, layerIndex, {
      where: '1=1', outFields: [oid, ...outFields].join(','), returnGeometry: 'false',
      orderByFields: oid, resultOffset: String(offset), resultRecordCount: String(page),
    }, token);
    const feats = data.features || [];
    rows.push(...feats.map((f: any) => f.attributes || {}));
    if (feats.length < page && !data.exceededTransferLimit) break;
  }
  return rows;
}

/** Compares the layer keys with what AgroCloud already has for the organisation. */
async function compareWithAgroCloud(orgId: string, rows: any[], mapping: KeyMapping) {
  const zonesDb = await dbPool.query(
    `SELECT UPPER(code) AS code FROM countries WHERE deleted_at IS NULL AND (organization_id = $1 OR organization_id IS NULL) AND code IS NOT NULL`,
    [orgId],
  );
  const fieldsDb = await dbPool.query(
    `SELECT gis_external_id, UPPER(gis_zone_id) AS z, UPPER(gis_farm_code) AS c
       FROM fields WHERE deleted_at IS NULL AND organization_id = $1`,
    [orgId],
  );
  const dbZones = new Set(zonesDb.rows.map((r: any) => r.code));
  const byGlobal = new Set(fieldsDb.rows.map((r: any) => String(r.gis_external_id || '').toUpperCase()).filter(Boolean));
  const byKey = new Set(fieldsDb.rows.filter((r: any) => r.z && r.c).map((r: any) => `${r.z}|${r.c}`));
  let matchedByGlobalId = 0; let matchedByKey = 0; let unmatched = 0;
  const layerZones = new Set<string>();
  rows.forEach((r) => {
    const g = String(mapping.globalId ? r[mapping.globalId] ?? '' : '').toUpperCase();
    const z = norm(mapping.zoneId ? r[mapping.zoneId] : '');
    const c = norm(mapping.farmCode ? r[mapping.farmCode] : '');
    if (z) layerZones.add(z);
    if (g && byGlobal.has(g)) matchedByGlobalId += 1;
    else if (z && c && byKey.has(`${z}|${c}`)) matchedByKey += 1;
    else unmatched += 1;
  });
  return {
    agroCloudFields: fieldsDb.rows.length,
    matchedByGlobalId, matchedByKey, unmatched,
    zonesOnlyInLayer: [...layerZones].filter((z) => !dbZones.has(z)).sort(),
    zonesOnlyInAgroCloud: [...dbZones].filter((z) => !layerZones.has(z)).sort(),
  };
}

export interface InspectInput {
  url: string;
  token?: string | null;
  mapping?: KeyMapping;
  layerId?: string;
}

/** Validates the link, reads the layer description and key attributes, and reports what will link. */
export async function inspectLayer(orgId: string, input: InspectInput) {
  const { baseUrl, layerIndex } = parseFeatureServiceUrl(input.url);
  if (layerIndex === null) {
    throw new AppError('Add the layer number at the end of the link, e.g. …/FeatureServer/21', 'VALIDATION_ERROR', 400);
  }
  let token = input.token || null;
  if (!token && input.layerId) {
    const saved = await dbPool.query(`SELECT auth_token FROM gis_layers WHERE id = $1 AND organization_id = $2`, [input.layerId, orgId]);
    token = saved.rows[0]?.auth_token || null;
  }
  const layer = await fetchLayerJson(baseUrl, layerIndex, token);
  if (layer.type && !/feature layer|table/i.test(layer.type)) {
    throw new AppError(`This link points to a "${layer.type}", not a feature layer`, 'VALIDATION_ERROR', 400);
  }
  const mapping = detectKeyFields(layer, input.mapping);
  const countRes = await queryJson(baseUrl, layerIndex, { where: '1=1', returnCountOnly: 'true' }, token);
  const rows = await readKeyAttributes(baseUrl, layerIndex, mapping, layer, token);
  const keys = analyzeKeys(rows, mapping, layer);
  const agroCloud = await compareWithAgroCloud(orgId, rows, mapping);

  const capabilities = String(layer.capabilities || '');
  const editable = /create|update|delete|editing/i.test(capabilities);
  const checks: Array<{ id: string; status: 'ok' | 'warn' | 'error'; message: string }> = [];
  const push = (id: string, status: 'ok' | 'warn' | 'error', message: string) => checks.push({ id, status, message });

  push('reachable', 'ok', `Layer "${layer.name}" (ID ${layerIndex}) is reachable`);
  push('geometry', /polygon/i.test(layer.geometryType || '') ? 'ok' : 'warn', `Geometry: ${layer.geometryType || 'none'}`);
  KEY_ROLES.filter((k) => k.required).forEach((k) => {
    push(`key_${k.role}`, mapping[k.role] ? 'ok' : 'error', mapping[k.role] ? `${k.label}: ${mapping[k.role]}` : `${k.label}: no matching field — choose one`);
  });
  if (mapping.zoneId && mapping.farmCode) {
    push('unique_keys', keys.duplicateCount ? 'error' : 'ok', keys.duplicateCount
      ? `${keys.duplicateCount} ZONE_ID + Farm_Code pair(s) are used by more than one feature`
      : 'Every ZONE_ID + Farm_Code pair is unique');
    if (keys.missingZone || keys.missingFarmCode) {
      push('missing_keys', 'warn', `${keys.missingZone} feature(s) without ZONE_ID, ${keys.missingFarmCode} without Farm_Code — they cannot be linked by key`);
    }
  }
  if (mapping.globalId && keys.missingGlobalId) push('missing_global_id', 'warn', `${keys.missingGlobalId} feature(s) without GlobalID`);
  if (keys.notApplicableSiteCode !== null) {
    const n = keys.sites.find((s) => s.value.startsWith(`${keys.notApplicableSiteCode} ·`))?.count || 0;
    if (n) push('site_not_applicable', 'warn', `${n} feature(s) have SITE = ${keys.notApplicableSiteCode} ("Not Applicable"); today these become a site called "Site ${keys.notApplicableSiteCode}"`);
  }
  if (agroCloud.zonesOnlyInLayer.length) push('zones_new', 'warn', `Zones in the layer but not in AgroCloud: ${agroCloud.zonesOnlyInLayer.join(', ')}`);
  push('read_only', 'ok', editable
    ? 'The layer allows editing, but AgroCloud only reads it (no edits are ever sent)'
    : 'Read-only layer — AgroCloud only reads it');

  const report = {
    url: `${baseUrl}/${layerIndex}`,
    layer: {
      name: layer.name, type: layer.type, geometryType: layer.geometryType,
      objectIdField: layer.objectIdField, globalIdField: layer.globalIdField || null,
      displayField: layer.displayField || null, typeIdField: layer.typeIdField || null,
      spatialReference: layer.extent?.spatialReference?.latestWkid || layer.extent?.spatialReference?.wkid || null,
      maxRecordCount: layer.maxRecordCount, capabilities, editable,
      featureCount: countRes.count ?? null,
      relationships: (layer.relationships || []).map((r: any) => ({ id: r.id, name: r.name, relatedTableId: r.relatedTableId })),
      fields: (layer.fields || []).map((f: any): LayerField => ({
        name: f.name, alias: f.alias || f.name, type: String(f.type || '').replace('esriFieldType', ''), length: f.length,
        domain: f.domain?.codedValues ? f.domain.codedValues.map((cv: any) => ({ code: cv.code, name: cv.name })) : null,
      })),
      types: (layer.types || []).map((t: any) => ({ id: t.id, name: t.name })),
    },
    mapping,
    keyRoles: KEY_ROLES.map(({ role, label, required }) => ({ role, label, required })),
    keys,
    agroCloud,
    checks,
    ok: !checks.some((c) => c.status === 'error'),
    inspectedAt: new Date().toISOString(),
  };

  if (input.layerId) {
    await dbPool.query(
      `UPDATE gis_layers SET inspection = $3, inspected_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [input.layerId, orgId, JSON.stringify(report)],
    );
  }
  return report;
}

/** ArcGIS connections saved for the organisation (no tokens returned). */
export async function listConnections(orgId: string) {
  const { rows } = await dbPool.query(
    `SELECT l.id, l.name, l.source_url, l.layer_index, l.attribute_mapping, l.sync_status, l.sync_error,
            l.last_synced_at, l.sync_interval_minutes, l.inspected_at, (l.auth_token IS NOT NULL) AS has_token,
            l.inspection -> 'checks' AS checks, l.inspection -> 'layer' -> 'featureCount' AS feature_count,
            (SELECT COUNT(*)::int FROM gis_features g WHERE g.layer_id = l.id) AS synced_features,
            (SELECT COUNT(*)::int FROM gis_features g WHERE g.layer_id = l.id AND g.linked_field_id IS NOT NULL) AS linked_features
       FROM gis_layers l
      WHERE l.organization_id = $1 AND l.source_type = 'arcgis_feature_service'
      ORDER BY l.created_at`,
    [orgId],
  );
  return rows;
}

export interface FeatureLookup {
  layerId?: string;
  featureId?: string;
  globalId?: string;
  objectId?: string;
  zoneId?: string;
  farmCode?: string;
  recordsPerForm?: number;
}

/**
 * Everything AgroCloud holds for one ArcGIS feature: the feature's attributes,
 * the linked field and location, and every form's records on that field,
 * each tagged with its FORM_ID.
 */
export async function featureForms(orgId: string, q: FeatureLookup) {
  const where: string[] = ['l.organization_id = $1'];
  const vals: any[] = [orgId];
  const add = (sql: string, v: any) => { vals.push(v); where.push(sql.replace(/\?/g, `$${vals.length}`)); };
  if (q.layerId) add('g.layer_id = ?::uuid', q.layerId);
  if (q.featureId) add('g.id = ?::uuid', q.featureId);
  if (q.objectId) add('g.external_id = ?', String(q.objectId));
  if (q.globalId) add(`UPPER(TRIM(BOTH '{}' FROM g.properties ->> COALESCE(l.attribute_mapping ->> 'globalId', 'GlobalID'))) = UPPER(TRIM(BOTH '{}' FROM ?))`, q.globalId);
  if (q.zoneId) add(`UPPER(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'zoneId', 'ZONE_ID'))) = UPPER(TRIM(?))`, q.zoneId);
  if (q.farmCode) add(`UPPER(TRIM(g.properties ->> COALESCE(l.attribute_mapping ->> 'farmCode', 'Farm_Code'))) = UPPER(TRIM(?))`, q.farmCode);
  if (vals.length === 1) {
    throw new AppError('Give a feature: global_id, object_id, feature_id, or zone_id + farm_code', 'VALIDATION_ERROR', 400);
  }
  const { rows } = await dbPool.query(
    `SELECT g.id AS feature_id, g.layer_id, l.name AS layer_name, g.external_id AS object_id, g.properties,
            g.linked_field_id, l.attribute_mapping,
            ST_Y(ST_PointOnSurface(g.geometry)) AS lat, ST_X(ST_PointOnSurface(g.geometry)) AS lon
       FROM gis_features g JOIN gis_layers l ON l.id = g.layer_id
      WHERE ${where.join(' AND ')}
      LIMIT 5`,
    vals,
  );

  // Not synced yet (or not found in synced layers): fall back to the field keys alone.
  let fieldIds: string[] = rows.map((r: any) => r.linked_field_id).filter(Boolean);
  if (!fieldIds.length && q.zoneId && q.farmCode) {
    const f = await dbPool.query(
      `SELECT id FROM fields WHERE organization_id = $1 AND deleted_at IS NULL
          AND UPPER(gis_zone_id) = UPPER($2) AND UPPER(gis_farm_code) = UPPER($3)`,
      [orgId, q.zoneId.trim(), q.farmCode.trim()],
    );
    fieldIds = f.rows.map((r: any) => r.id);
  }
  if (!rows.length && !fieldIds.length) throw new AppError('No feature or field matches these keys', 'NOT_FOUND', 404);

  const locations = fieldIds.length
    ? (await dbPool.query(`SELECT * FROM bi.dim_location WHERE field_id = ANY($1::uuid[])`, [fieldIds])).rows
    : [];
  const forms = await formsForFields([...new Set(fieldIds)], orgId, { recordsPerForm: q.recordsPerForm ?? 20 });
  const otherFeatures = fieldIds.length === 1 ? await featuresForField(fieldIds[0], orgId) : [];

  return {
    features: rows.map((r: any) => {
      const m = r.attribute_mapping || {};
      return {
        feature_id: r.feature_id, layer_id: r.layer_id, layer_name: r.layer_name, object_id: r.object_id,
        global_id: r.properties?.[m.globalId || 'GlobalID'] ?? null,
        zone_id: r.properties?.[m.zoneId || 'ZONE_ID'] ?? null,
        farm_code: r.properties?.[m.farmCode || 'Farm_Code'] ?? null,
        farm_name: r.properties?.[m.farmName || 'Farm_Name'] ?? null,
        linked_field_id: r.linked_field_id, centroid: r.lat != null ? { lat: r.lat, lon: r.lon } : null,
        attributes: r.properties,
      };
    }),
    fields: locations,
    linkedFeatures: otherFeatures,
    forms,
  };
}

/**
 * One-to-many side of the relationship class: a ZONE_ID + SITE (or Site_Code)
 * pair names one AgroCloud site, which holds many fields and, through them, many
 * form records. Returns the site's fields and every form's records on them.
 */
export async function siteForms(orgId: string, q: { zoneId: string; siteCode: string; recordsPerForm?: number }) {
  const zone = String(q.zoneId || '').trim();
  const site = String(q.siteCode || '').trim();
  if (!zone || !site) throw new AppError('Give zone_id and site_code', 'VALIDATION_ERROR', 400);
  const { rows: fields } = await dbPool.query(
    `SELECT * FROM bi.dim_location
      WHERE organization_id = $1 AND NOT is_deleted
        AND (UPPER(gis_zone_id) = UPPER($2) OR UPPER(zone_code) = UPPER($2))
        AND (UPPER(gis_site_code) = UPPER($3) OR UPPER(site_gis_code) = UPPER($3))
      ORDER BY site_name, farm_area_name, field_name`,
    [orgId, zone, site],
  );
  const fieldIds = fields.map((f: any) => f.field_id);
  const forms = await formsForFields(fieldIds, orgId, { recordsPerForm: q.recordsPerForm ?? 5 });
  const s0: any = fields[0] || {};
  return {
    key: `${zone.toUpperCase()}|${site.toUpperCase()}`,
    site: fields.length ? { site_id: s0.site_id, site_name: s0.site_name, zone_code: s0.zone_code, zone_name: s0.zone_name } : null,
    field_count: fields.length,
    fields: fields.slice(0, 50),
    forms,
  };
}

/** Per feature of a layer: record counts by form (map pop-ups, Power BI). */
export async function layerFormSummary(orgId: string, layerId: string) {
  const own = await dbPool.query(`SELECT 1 FROM gis_layers WHERE id = $1 AND organization_id = $2`, [layerId, orgId]);
  if (!own.rows.length) throw new AppError('Layer not found', 'NOT_FOUND', 404);
  const { rows } = await dbPool.query(
    `SELECT s.feature_id, s.object_id, s.global_id, s.zone_id, s.farm_code, s.field_id,
            fr.form_id, fr.form_key, fr.form_path, fr.title_en, fr.title_ar,
            s.record_count::int, s.first_record_date, s.last_record_date, s.last_updated_at
       FROM bi.gis_feature_forms s
       LEFT JOIN form_registry fr ON fr.form_id = s.form_id
      WHERE s.layer_id = $1
      ORDER BY s.zone_id, s.farm_code, fr.form_path`,
    [layerId],
  );
  return rows;
}

/** Link problems for the organisation (duplicates, missing keys, unlinked features). */
export async function linkIssues(orgId: string) {
  const { rows } = await dbPool.query(
    `SELECT issue, layer_id, feature_id, field_id, zone_id, farm_code, occurrences::int
       FROM bi.gis_link_issues
      WHERE organization_id = $1 OR (organization_id IS NULL AND field_id IN (SELECT id FROM fields WHERE organization_id = $1))
      ORDER BY issue, zone_id, farm_code LIMIT 500`,
    [orgId],
  );
  return rows;
}
