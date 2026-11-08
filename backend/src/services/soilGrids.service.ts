import { fromUrl, GeoTIFF } from 'geotiff';
import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Global soil properties from OpenLandMap (OpenGeoHub, Hengl et al., 250 m,
 * six standard depths), read straight from the published Cloud-Optimized
 * GeoTIFFs with HTTP range requests: only the few bytes around a point are
 * downloaded, never the multi-GB files.
 *
 * Files are found through the Zenodo records of each layer (the concept record
 * always resolves to the latest version). OPENLANDMAP_COG_BASE can point to a
 * mirror that holds the same file names (e.g. an internal bucket).
 */

export const DEPTHS = [0, 10, 30, 60, 100, 200] as const;
export type Depth = typeof DEPTHS[number];

const TEXTURE: Record<number, string> = {
  1: 'Clay', 2: 'Silty clay', 3: 'Sandy clay', 4: 'Clay loam', 5: 'Silty clay loam', 6: 'Sandy clay loam',
  7: 'Loam', 8: 'Silt loam', 9: 'Sandy loam', 10: 'Silt', 11: 'Loamy sand', 12: 'Sand',
};

export interface SoilDataset {
  key: string;
  label: string;
  unit: string;
  /** Zenodo record (concept or version) holding the files. */
  zenodo: string;
  /** File name stem; the depth part is added: <stem>_m_250m_b<d>..<d>cm_... */
  stem: string;
  convert: (raw: number) => number | string;
  nodata: number[];
  description: string;
}

export const DATASETS: SoilDataset[] = [
  { key: 'ph', label: 'Soil pH (H2O)', unit: 'pH', zenodo: '1475459', stem: 'sol_ph.h2o_usda.4c1a2a', convert: (v) => Math.round(v) / 10, nodata: [255], description: 'pH in water (1:1); stored × 10.' },
  { key: 'organic_carbon', label: 'Organic carbon', unit: 'g/kg', zenodo: '1475457', stem: 'sol_organic.carbon_usda.6a1c', convert: (v) => v * 5, nodata: [255], description: 'Soil organic carbon content; stored in 5 g/kg steps.' },
  { key: 'clay', label: 'Clay', unit: '%', zenodo: '1476854', stem: 'sol_clay.wfraction_usda.3a1a1a', convert: (v) => v, nodata: [255], description: 'Clay content, % by weight.' },
  { key: 'sand', label: 'Sand', unit: '%', zenodo: '1476851', stem: 'sol_sand.wfraction_usda.3a1a1a', convert: (v) => v, nodata: [255], description: 'Sand content, % by weight.' },
  { key: 'bulk_density', label: 'Bulk density', unit: 'kg/m³', zenodo: '2525665', stem: 'sol_bulkdens.fineearth_usda.4a1h', convert: (v) => v * 10, nodata: [255], description: 'Fine-earth bulk density; stored in 10 kg/m³ steps.' },
  { key: 'water_33kpa', label: 'Water at field capacity (33 kPa)', unit: '% vol', zenodo: '2629589', stem: 'sol_watercontent.33kpa_usda.4b1c', convert: (v) => v, nodata: [255], description: 'Volumetric water content at 33 kPa (field capacity).' },
  { key: 'texture', label: 'Texture class (USDA)', unit: '', zenodo: '1475451', stem: 'sol_texture.class_usda.tt', convert: (v) => TEXTURE[Math.round(v)] || '—', nodata: [0, 255], description: 'USDA soil texture class.' },
];

export const getDataset = (key: string) => DATASETS.find((d) => d.key === key);

export function datasetCatalog() {
  return DATASETS.map(({ key, label, unit, description }) => ({ key, label, unit, description, depths: DEPTHS }));
}

// ── where soil maps apply ──────────────────────────────────────────────────
// Global soil maps describe the natural ground. Protected structures (green-,
// net-, glass-, shade-houses, tunnels, Cravo) grow on substrate or managed soil,
// so the maps are offered only for open fields and pivots.

const PROTECTED = /green\s*house|net\s*house|glass\s*house|shade\s*house|poly\s*house|tunnel|cravo|substrate|hydropon/i;
const OPEN = /open|pivot|plot|orchard|palm|outdoor|rain\s*fed|field\s*crop/i;

export type SoilApplicability = { allowed: boolean; reason?: string };

export function soilApplies(fieldType: string | null | undefined): SoilApplicability {
  const t = String(fieldType || '').trim();
  if (PROTECTED.test(t)) return { allowed: false, reason: `Soil maps are for open fields and pivots; this is a ${t}.` };
  if (OPEN.test(t)) return { allowed: true };
  return { allowed: false, reason: t ? `Soil maps are for open fields and pivots (type: ${t}).` : 'Soil maps are for open fields and pivots; this field has no type.' };
}

/** The AgroCloud field (if any) under a point, with its type. */
export async function fieldAtPoint(orgId: string, lon: number, lat: number): Promise<{ id: string; name: string; type: string | null } | null> {
  const { rows } = await dbPool.query(
    `SELECT f.id, f.name, ft.name AS type FROM fields f LEFT JOIN field_types ft ON ft.id = f.field_type_id
      WHERE f.organization_id = $1 AND f.polygon IS NOT NULL
        AND ST_Contains(ST_Transform(f.polygon, 4326), ST_SetSRID(ST_MakePoint($2, $3), 4326))
      LIMIT 1`,
    [orgId, lon, lat],
  );
  return rows[0] || null;
}

// ── file lookup ────────────────────────────────────────────────────────────

const fileUrls = new Map<string, string>();
const tiffs = new Map<string, Promise<GeoTIFF>>();
const values = new Map<string, { v: number | string | null; at: number }>();
const VALUE_TTL = 7 * 24 * 3600 * 1000;

function depthPattern(d: SoilDataset, depth: number): RegExp {
  const stem = d.stem.replace(/\./g, '\\.');
  return new RegExp(`^${stem}_m_250m_b${depth}\\.\\.${depth}cm_.*\\.tif$`, 'i');
}

/** Zenodo record → file URL for one depth (cached). */
export async function resolveFileUrl(d: SoilDataset, depth: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cacheKey = `${d.key}:${depth}`;
  const hit = fileUrls.get(cacheKey);
  if (hit) return hit;
  const mirror = process.env.OPENLANDMAP_COG_BASE;
  const pattern = depthPattern(d, depth);
  const res = await fetchImpl(`https://zenodo.org/api/records/${d.zenodo}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new AppError(`Soil data catalogue answered ${res.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
  const rec: any = await res.json();
  const files: any[] = Array.isArray(rec.files) ? rec.files : rec.files?.entries ? Object.values(rec.files.entries) : [];
  const file = files.find((f) => pattern.test(f.key || f.filename || ''));
  if (!file) throw new AppError(`No ${d.label} file for ${depth} cm`, 'NOT_FOUND', 404);
  const name = file.key || file.filename;
  const url = mirror
    ? `${mirror.replace(/\/$/, '')}/${name}`
    : file.links?.content || file.links?.self || `https://zenodo.org/records/${rec.id}/files/${encodeURIComponent(name)}`;
  fileUrls.set(cacheKey, url);
  return url;
}

function openTiff(url: string): Promise<GeoTIFF> {
  let p = tiffs.get(url);
  if (!p) {
    p = fromUrl(url, { allowFullFile: false } as any) as Promise<GeoTIFF>;
    p.catch(() => tiffs.delete(url));
    tiffs.set(url, p);
  }
  return p;
}

/** Raw pixel value at lon/lat from a (cloud-optimized) GeoTIFF in EPSG:4326, or null for nodata / outside. */
export async function readPixel(tiff: GeoTIFF, lon: number, lat: number, nodata: number[] = []): Promise<number | null> {
  const image = await tiff.getImage();
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  if (lon < minX || lon > maxX || lat < minY || lat > maxY) return null;
  const w = image.getWidth();
  const h = image.getHeight();
  const x = Math.min(w - 1, Math.floor(((lon - minX) / (maxX - minX)) * w));
  const y = Math.min(h - 1, Math.floor(((maxY - lat) / (maxY - minY)) * h));
  const data: any = await image.readRasters({ window: [x, y, x + 1, y + 1], samples: [0] });
  const v = Number(data[0][0]);
  const fileNodata = image.getGDALNoData();
  if (!Number.isFinite(v) || nodata.includes(v) || (fileNodata !== null && v === fileNodata)) return null;
  return v;
}

export async function pointValue(d: SoilDataset, depth: number, lon: number, lat: number): Promise<number | string | null> {
  const key = `${d.key}:${depth}:${lon.toFixed(4)}:${lat.toFixed(4)}`;
  const hit = values.get(key);
  if (hit && Date.now() - hit.at < VALUE_TTL) return hit.v;
  const url = await resolveFileUrl(d, depth);
  const raw = await readPixel(await openTiff(url), lon, lat, d.nodata);
  const v = raw === null ? null : d.convert(raw);
  values.set(key, { v, at: Date.now() });
  return v;
}

const checkLonLat = (lon: number, lat: number) => {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new AppError('lat / lon out of range', 'VALIDATION_ERROR', 400);
};

/** Soil profile at a point: every dataset × the requested depths. */
export async function pointProfile(lon: number, lat: number, keys?: string[], depths: number[] = [0, 30, 60]) {
  checkLonLat(lon, lat);
  const sets = (keys?.length ? DATASETS.filter((d) => keys.includes(d.key)) : DATASETS);
  const ds = depths.filter((x): x is Depth => (DEPTHS as readonly number[]).includes(x));
  const rows = await Promise.all(sets.map(async (d) => {
    const out: Record<string, any> = { key: d.key, property: d.label, unit: d.unit };
    await Promise.all(ds.map(async (depth) => {
      try { out[`${depth}cm`] = await pointValue(d, depth, lon, lat); } catch (e: any) {
        logger.warn({ dataset: d.key, depth, err: e.message }, 'OpenLandMap read failed');
        out[`${depth}cm`] = null;
        out.error = e.message;
      }
    }));
    return out;
  }));
  return { lon, lat, depths: ds, source: 'OpenLandMap (OpenGeoHub) · 250 m', rows };
}

// ── field profiles (stored, used by reports, the map and the assistant) ────

export async function fieldCentroid(orgId: string, fieldId: string): Promise<{ lon: number; lat: number; name: string; type: string | null } | null> {
  const { rows } = await dbPool.query(
    `SELECT f.name, ft.name AS type, ST_X(ST_PointOnSurface(ST_Transform(f.polygon, 4326))) AS lon, ST_Y(ST_PointOnSurface(ST_Transform(f.polygon, 4326))) AS lat
       FROM fields f LEFT JOIN field_types ft ON ft.id = f.field_type_id
      WHERE f.id = $1 AND f.organization_id = $2 AND f.polygon IS NOT NULL`,
    [fieldId, orgId],
  );
  return rows[0] ? { lon: Number(rows[0].lon), lat: Number(rows[0].lat), name: rows[0].name, type: rows[0].type ?? null } : null;
}

export async function refreshFieldProfile(orgId: string, fieldId: string) {
  const c = await fieldCentroid(orgId, fieldId);
  if (!c) throw new AppError('Field not found, or it has no polygon yet (link it on GIS Map).', 'NOT_FOUND', 404);
  const applies = soilApplies(c.type);
  if (!applies.allowed) throw new AppError(applies.reason!, 'NOT_APPLICABLE', 422);
  const profile = await pointProfile(c.lon, c.lat, undefined, [0, 10, 30, 60, 100]);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    for (const r of profile.rows) {
      for (const depth of profile.depths) {
        const v = r[`${depth}cm`];
        if (v === null || v === undefined) continue;
        await client.query(
          `INSERT INTO field_soil_properties (organization_id, field_id, dataset, depth_cm, value_num, value_text, unit, lon, lat, source, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'openlandmap',NOW())
           ON CONFLICT (field_id, dataset, depth_cm) DO UPDATE SET value_num = EXCLUDED.value_num, value_text = EXCLUDED.value_text,
             unit = EXCLUDED.unit, lon = EXCLUDED.lon, lat = EXCLUDED.lat, fetched_at = NOW()`,
          [orgId, fieldId, r.key, depth, typeof v === 'number' ? v : null, typeof v === 'string' ? v : null, r.unit, c.lon, c.lat],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { field: c.name, ...profile };
}

export async function storedFieldProfile(orgId: string, fieldId: string) {
  const { rows } = await dbPool.query(
    `SELECT dataset, depth_cm, value_num, value_text, unit, fetched_at FROM field_soil_properties
      WHERE organization_id = $1 AND field_id = $2 ORDER BY dataset, depth_cm`,
    [orgId, fieldId],
  );
  return rows;
}
