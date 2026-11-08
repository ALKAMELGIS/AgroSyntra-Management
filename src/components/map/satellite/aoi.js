import L from 'leaflet';

/** Outer ring of the first polygon of a GeoJSON Feature / geometry, as [lng, lat] pairs. */
export function outerRing(geo) {
  const g = geo?.type === 'Feature' ? geo.geometry : geo?.type === 'FeatureCollection' ? geo.features?.[0]?.geometry : geo;
  if (!g) return null;
  if (g.type === 'Polygon') return g.coordinates[0];
  if (g.type === 'MultiPolygon') return g.coordinates[0][0];
  return null;
}

export function ringToFeature(ring, name = 'AOI') {
  const closed = ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ? [...ring, ring[0]] : ring;
  return { type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [closed] } };
}

/** WKT in Web Mercator (EPSG:3857), at most ~150 vertices, used to clip tiles and for statistics. */
export function aoiToWkt(feature, maxPoints = 150) {
  const ring = outerRing(feature);
  if (!ring || ring.length < 4) return null;
  const step = Math.max(1, Math.ceil(ring.length / maxPoints));
  const pts = ring.filter((_, i) => i % step === 0);
  if (pts[pts.length - 1] !== ring[ring.length - 1]) pts.push(ring[ring.length - 1]);
  const projected = pts.map(([lng, lat]) => L.CRS.EPSG3857.project(L.latLng(lat, lng)));
  if (projected.length < 4) return null;
  const first = projected[0];
  const last = projected[projected.length - 1];
  if (first.x !== last.x || first.y !== last.y) projected.push(first);
  return `POLYGON((${projected.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(', ')}))`;
}

/** [minLon, minLat, maxLon, maxLat] */
export function aoiBbox(feature) {
  const ring = outerRing(feature);
  if (!ring) return null;
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/** Geodesic area in hectares (spherical excess approximation, fine for fields). */
export function aoiAreaHa(feature) {
  const ring = outerRing(feature);
  if (!ring || ring.length < 4) return 0;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    area += ((lon2 - lon1) * Math.PI / 180) * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs(area * R * R / 2) / 10000;
}

/** AOI from an uploaded GeoJSON or KML file. */
export async function readAoiFile(file) {
  const text = await file.text();
  if (/\.kml$/i.test(file.name) || /<kml[\s>]/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const node = doc.getElementsByTagName('coordinates')[0];
    if (!node) throw new Error('No polygon found in the KML file.');
    const ring = node.textContent.trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map(([lng, lat]) => [lng, lat]);
    if (ring.length < 3) throw new Error('No polygon found in the KML file.');
    return ringToFeature(ring, file.name.replace(/\.[^.]+$/, ''));
  }
  const json = JSON.parse(text);
  const ring = outerRing(json);
  if (!ring) throw new Error('The file has no polygon (GeoJSON Polygon or MultiPolygon).');
  return ringToFeature(ring, file.name.replace(/\.[^.]+$/, ''));
}

/** "24.21, 55.73" → [lat, lng] */
export function parseLatLng(text) {
  const m = String(text || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
