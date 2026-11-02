import https from 'https';
import http from 'http';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

/**
 * Aggressively strip ALL non-printable-ASCII characters from a URL.
 * URLs are fundamentally ASCII — anything outside printable ASCII range
 * (0x20-0x7E) is either an invisible copy-paste artefact or should be
 * percent-encoded. Then validate/normalize via the WHATWG URL parser.
 */
function sanitizeUrl(raw: string): string {
  const ascii = raw.replace(/[^\x20-\x7E]/g, '').trim();
  try {
    return new URL(ascii).href;
  } catch {
    return ascii;
  }
}

/**
 * Parse a Feature Service URL that may include a layer index at the end.
 * e.g. ".../FeatureServer/21" → { baseUrl: ".../FeatureServer", layerIndex: 21 }
 */
export function parseFeatureServiceUrl(raw: string): { baseUrl: string; layerIndex: number | null } {
  const url = sanitizeUrl(raw);
  const match = url.match(/^(.*\/(?:Feature|Map)Server)\/(\d+)\/?$/i);
  if (match) {
    return { baseUrl: match[1], layerIndex: parseInt(match[2], 10) };
  }
  return { baseUrl: url, layerIndex: null };
}

async function safeFetch(rawUrl: string): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  const url = sanitizeUrl(rawUrl);
  logger.info({ url, urlLength: url.length }, 'safeFetch URL (sanitized)');

  try {
    const res = await fetch(url);
    return res;
  } catch (fetchErr: any) {
    logger.warn({ url, error: fetchErr?.message }, 'Native fetch failed, falling back to https module');

    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname + parsed.search,
      method: 'GET' as const,
      headers: { 'User-Agent': 'AlMahaFarm/1.0' },
    };
    logger.info({ hostname: options.hostname, path: options.path }, 'https fallback options');

    return new Promise((resolve, reject) => {
      mod.get(options, (res) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            text: async () => body,
          });
        });
      }).on('error', (err) => {
        reject(new AppError(`Network error reaching ArcGIS: ${err.message}`, 'EXTERNAL_SERVICE_ERROR', 502));
      });
    });
  }
}

export interface ArcGISLayerMetadata {
  name: string;
  description: string;
  geometryType: string;
  fields: ArcGISFieldDef[];
  extent: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  objectIdField: string;
  maxRecordCount: number;
  capabilities: string;
}

export interface ArcGISFieldDef {
  name: string;
  alias: string;
  type: string;
  length?: number;
}

export interface ArcGISFeatureResult {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: number | string;
    geometry: any;
    properties: Record<string, any>;
  }>;
}

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const cleanBase = base.replace(/\/+$/, '');
  const fullPath = path ? `${cleanBase}/${path}` : cleanBase;
  const sep = fullPath.includes('?') ? '&' : '?';
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return qs ? `${fullPath}${sep}${qs}` : fullPath;
}

export async function fetchLayerMetadata(
  serviceUrl: string,
  layerIndex: number,
  token?: string | null,
): Promise<ArcGISLayerMetadata> {
  const params: Record<string, string> = { f: 'json' };
  if (token) params.token = token;

  const url = buildUrl(sanitizeUrl(serviceUrl), `${layerIndex}`, params);
  logger.info({ url }, 'Fetching ArcGIS layer metadata');

  const res = await safeFetch(url);

  if (!res.ok) {
    throw new AppError(`ArcGIS metadata request failed: HTTP ${res.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
  }

  const data = JSON.parse(await res.text()) as any;

  if (data.error) {
    throw new AppError(`ArcGIS error: ${data.error.message || JSON.stringify(data.error)}`, 'EXTERNAL_SERVICE_ERROR', 502);
  }

  return {
    name: data.name ?? '',
    description: data.description ?? '',
    geometryType: data.geometryType ?? 'esriGeometryPolygon',
    fields: (data.fields ?? []).map((f: any) => ({
      name: f.name,
      alias: f.alias || f.name,
      type: f.type,
      length: f.length,
    })),
    extent: data.extent
      ? { xmin: data.extent.xmin, ymin: data.extent.ymin, xmax: data.extent.xmax, ymax: data.extent.ymax }
      : null,
    objectIdField: data.objectIdFieldName ?? 'OBJECTID',
    maxRecordCount: data.maxRecordCount ?? 1000,
    capabilities: data.capabilities ?? '',
  };
}

export async function fetchServiceInfo(
  serviceUrl: string,
  token?: string | null,
): Promise<{ layers: Array<{ id: number; name: string; geometryType: string }> }> {
  const params: Record<string, string> = { f: 'json' };
  if (token) params.token = token;

  const url = buildUrl(sanitizeUrl(serviceUrl), '', params);
  logger.info({ url }, 'Fetching ArcGIS service info');

  const res = await safeFetch(url);

  if (!res.ok) {
    throw new AppError(`ArcGIS service returned HTTP ${res.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
  }

  let data: any;
  try {
    const txt = await res.text();
    data = JSON.parse(txt);
  } catch {
    throw new AppError('ArcGIS returned non-JSON response', 'EXTERNAL_SERVICE_ERROR', 502);
  }

  if (data.error) {
    throw new AppError(`ArcGIS error: ${data.error.message || JSON.stringify(data.error)}`, 'EXTERNAL_SERVICE_ERROR', 502);
  }

  return {
    layers: (data.layers ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      geometryType: l.geometryType ?? '',
    })),
  };
}

export async function queryFeatures(
  serviceUrl: string,
  layerIndex: number,
  token?: string | null,
  where?: string,
): Promise<ArcGISFeatureResult> {
  const allFeatures: ArcGISFeatureResult['features'] = [];
  let resultOffset = 0;
  const pageSize = 1000;

  while (true) {
    const params: Record<string, string> = {
      f: 'geojson',
      where: where || '1=1',
      outFields: '*',
      outSR: '4326',
      returnDomainValues: 'true',
      resultOffset: String(resultOffset),
      resultRecordCount: String(pageSize),
    };
    if (token) params.token = token;

    const url = buildUrl(sanitizeUrl(serviceUrl), `${layerIndex}/query`, params);
    logger.info({ url, offset: resultOffset }, 'Querying ArcGIS features');

    const res = await safeFetch(url);

    if (!res.ok) {
      throw new AppError(`ArcGIS query failed: HTTP ${res.status}`, 'EXTERNAL_SERVICE_ERROR', 502);
    }

    const data = JSON.parse(await res.text()) as any;

    if (data.error) {
      throw new AppError(`ArcGIS query error: ${data.error.message || JSON.stringify(data.error)}`, 'EXTERNAL_SERVICE_ERROR', 502);
    }

    const features = data.features ?? [];
    allFeatures.push(...features);

    if (features.length < pageSize) break;
    resultOffset += pageSize;

    if (resultOffset > 100_000) {
      logger.warn('ArcGIS query exceeded 100k features, stopping pagination');
      break;
    }
  }

  return { type: 'FeatureCollection', features: allFeatures };
}

export async function testConnection(
  serviceUrl: string,
  token?: string | null,
): Promise<{ success: boolean; message: string; layerCount?: number }> {
  try {
    const info = await fetchServiceInfo(serviceUrl, token);
    return {
      success: true,
      message: `Connected successfully. Found ${info.layers.length} layer(s).`,
      layerCount: info.layers.length,
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection failed' };
  }
}
