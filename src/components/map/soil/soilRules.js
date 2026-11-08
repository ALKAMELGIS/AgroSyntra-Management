/**
 * Soil maps are for open ground: open fields and pivots (farm plots too).
 * Protected structures (green-, net-, glass-, shade-houses, tunnels, Cravo)
 * are excluded. Same rule as the server (soilGrids.service.ts).
 */
const PROTECTED = /green\s*house|net\s*house|glass\s*house|shade\s*house|poly\s*house|tunnel|cravo|substrate|hydropon/i;
const OPEN = /open|pivot|plot|orchard|palm|outdoor|rain\s*fed|field\s*crop/i;

export function soilApplies(type) {
  const t = String(type || '').trim();
  if (PROTECTED.test(t)) return { allowed: false, type: t };
  if (OPEN.test(t)) return { allowed: true, type: t };
  return { allowed: false, type: t };
}

/** Field type from a GIS feature (ArcGIS Agro_Structures or AgroCloud fields). */
export function featureType(props = {}) {
  return props.Structure_Type || props.structure_type || props.Category || props.category || props.field_type || props.FieldType || props.type || props.Type || '';
}

export function featureName(props = {}) {
  return props.Farm_Name || props.Farm_Code || props.field_name || props.name || props.NAME || '';
}

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(coords, x, y) {
  if (!coords?.length || !inRing(coords[0], x, y)) return false;
  return !coords.slice(1).some((hole) => inRing(hole, x, y));
}

/** First polygon feature of the visible layers that contains the point. */
export function featureAt(features, lon, lat) {
  return features.find((f) => {
    const g = f?.geometry;
    if (!g) return false;
    if (g.type === 'Polygon') return inPolygon(g.coordinates, lon, lat);
    if (g.type === 'MultiPolygon') return g.coordinates.some((p) => inPolygon(p, lon, lat));
    return false;
  }) || null;
}
