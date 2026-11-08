/**
 * A field boundary as Leaflet wants it: [[lat, lng], ...] (outer ring only).
 * Accepts what the system stores or returns:
 *  - [[lat, lng], ...] (saved from the map),
 *  - a GeoJSON Polygon / MultiPolygon object or its JSON string ([lng, lat] order),
 *  - a GeoJSON Feature wrapping one of those.
 * Returns null when there is no usable ring (fewer than 3 points).
 */
export function toLatLngRing(polygon) {
  let g = polygon;
  if (!g) return null;
  if (typeof g === 'string') {
    try { g = JSON.parse(g); } catch { return null; }
  }
  if (g && g.type === 'Feature') g = g.geometry;
  let ring = null;
  if (Array.isArray(g)) {
    ring = g.length && Array.isArray(g[0]) && typeof g[0][0] === 'number' ? g : null;
  } else if (g && g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    ring = (g.coordinates[0] || []).map(([lng, lat]) => [lat, lng]);
  } else if (g && g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    ring = ((g.coordinates[0] || [])[0] || []).map(([lng, lat]) => [lat, lng]);
  }
  if (!ring) return null;
  const clean = ring.filter((pt) => Array.isArray(pt) && Number.isFinite(+pt[0]) && Number.isFinite(+pt[1])).map(([a, b]) => [+a, +b]);
  // Drop the closing point Leaflet does not need.
  if (clean.length > 1) {
    const [f, l] = [clean[0], clean[clean.length - 1]];
    if (f[0] === l[0] && f[1] === l[1]) clean.pop();
  }
  return clean.length >= 3 ? clean : null;
}
