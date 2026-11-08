import crypto from 'crypto';
import { config } from '../config';
import { getIndex, vizScript, b64 } from './satelliteIndices';

/** Signed tile keys: "<subject>.<expiry>.<signature>", valid for 12 hours. */
const TTL_SECONDS = 12 * 3600;

function sign(payload: string): string {
  return crypto.createHmac('sha256', `satellite-tiles:${config.auth.jwtSecret}`).update(payload).digest('base64url');
}

export function signTileKey(subject: string, now = Date.now()): { key: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  const sub = Buffer.from(String(subject)).toString('base64url');
  const payload = `${sub}.${exp}`;
  return { key: `${payload}.${sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyTileKey(key: string, now = Date.now()): { subject: string } | null {
  const parts = String(key || '').split('.');
  if (parts.length !== 3) return null;
  const [sub, exp, sig] = parts;
  const expected = sign(`${sub}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return null;
  return { subject: Buffer.from(sub, 'base64url').toString() };
}

/**
 * Only plain WMS GetMap parameters pass through (names are matched without
 * case, values are checked), so the proxy cannot be used for anything else.
 */
/** AOI as WKT POLYGON / MULTIPOLYGON with numbers only (used to clip the image). */
export function isWkt(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 30000) return false;
  const m = t.match(/^(MULTIPOLYGON|POLYGON)\s*(\(.*\))$/i);
  if (!m) return false;
  const body = m[2];
  if (!/^[0-9.,()\s-]+$/.test(body)) return false;
  let depth = 0;
  let maxDepth = 0;
  for (const ch of body) {
    if (ch === '(') maxDepth = Math.max(maxDepth, ++depth);
    if (ch === ')' && --depth < 0) return false;
  }
  if (depth !== 0 || maxDepth !== (m[1].toUpperCase() === 'POLYGON' ? 2 : 3)) return false;
  // Every ring: at least 4 "x y" points.
  const rings = body.match(/\(([^()]+)\)/g) || [];
  return rings.length > 0 && rings.every((ring) => {
    const pts = ring.slice(1, -1).split(',').map((p) => p.trim());
    return pts.length >= 4 && pts.every((p) => /^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/.test(p));
  });
}

export function wmsTileParams(query: Record<string, any>, baseLayer = ''): URLSearchParams | null {
  const q: Record<string, string> = {};
  Object.entries(query).forEach(([k, v]) => { q[k.toUpperCase()] = String(Array.isArray(v) ? v[0] : v ?? ''); });
  // INDEX picks one of our indices (script added here); LAYERS is then the
  // configuration's own layer, used only as the data source.
  const index = q.INDEX ? getIndex(q.INDEX) : null;
  if (q.INDEX && !index) return null;
  const layer = index ? (baseLayer || q.LAYERS || '') : (q.LAYERS || '');
  const bbox = q.BBOX || '';
  const width = Number(q.WIDTH || 256);
  const height = Number(q.HEIGHT || 256);
  const crs = q.CRS || q.SRS || 'EPSG:3857';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(layer)) return null;
  if (!/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(bbox)) return null;
  if (!(width >= 16 && width <= 1024 && height >= 16 && height <= 1024)) return null;
  if (!/^EPSG:(3857|4326)$/.test(crs)) return null;
  const out = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: q.VERSION === '1.1.1' ? '1.1.1' : '1.3.0',
    LAYERS: layer, STYLES: '', FORMAT: q.FORMAT === 'image/jpeg' ? 'image/jpeg' : 'image/png', TRANSPARENT: 'true',
    WIDTH: String(Math.round(width)), HEIGHT: String(Math.round(height)), BBOX: bbox,
  });
  out.set(out.get('VERSION') === '1.1.1' ? 'SRS' : 'CRS', crs);
  if (q.TIME) {
    if (!/^\d{4}-\d{2}-\d{2}(\/\d{4}-\d{2}-\d{2})?$/.test(q.TIME)) return null;
    out.set('TIME', q.TIME);
  }
  if (index) {
    out.set('EVALSCRIPT', b64(vizScript(index)));
    out.set('SHOWLOGO', 'false');
  }
  if (q.GEOMETRY) {
    if (!isWkt(q.GEOMETRY)) return null;
    out.set('GEOMETRY', q.GEOMETRY.trim());
  }
  if (q.PRIORITY && /^(mostRecent|leastRecent|leastCC)$/.test(q.PRIORITY)) out.set('PRIORITY', q.PRIORITY);
  if (q.MAXCC) {
    const cc = Number(q.MAXCC);
    if (!(cc >= 0 && cc <= 100)) return null;
    out.set('MAXCC', String(Math.round(cc)));
  }
  return out;
}
