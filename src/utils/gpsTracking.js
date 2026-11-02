export const STALE_AFTER_MS = 15 * 60 * 1000;
export const TRAIL_MAX_POINTS = 400;

export function dubaiTodayYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const lookup = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

export function isRecentPing(recordedAt, now = Date.now(), maxMs = STALE_AFTER_MS) {
  if (!recordedAt) return false;
  const t = new Date(recordedAt).getTime();
  return Number.isFinite(t) && now - t <= maxMs;
}

export function trailCoordsFromPositions(positions) {
  return (positions || [])
    .map((p) => [Number(p.latitude), Number(p.longitude)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0);
}

function skipNearDuplicates(coords, minDelta = 0.00005) {
  if (coords.length <= 1) return coords;
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i += 1) {
    const [lat, lng] = coords[i];
    const [prevLat, prevLng] = out[out.length - 1];
    if (Math.abs(lat - prevLat) >= minDelta || Math.abs(lng - prevLng) >= minDelta) {
      out.push(coords[i]);
    }
  }
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function downsampleTrail(coords, maxPoints = TRAIL_MAX_POINTS) {
  const cleaned = skipNearDuplicates(coords);
  if (cleaned.length <= maxPoints) return cleaned;
  const step = (cleaned.length - 1) / (maxPoints - 1);
  const out = [];
  for (let i = 0; i < maxPoints - 1; i += 1) {
    out.push(cleaned[Math.round(i * step)]);
  }
  out.push(cleaned[cleaned.length - 1]);
  return skipNearDuplicates(out);
}
