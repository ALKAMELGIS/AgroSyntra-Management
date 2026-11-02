/**
 * Range overlap for occupancy. "6 TO 10" / "6 To 10" / "6-10" are one range.
 * A bare 6 is the integer 6, not valve V6.
 */

export const ALL_OCCUPANCY = 'ALL';

const RANGE_PATTERN = /^(\d+)\s*(?:to|-)\s*(\d+)$/i;
const BARE_NUMBER = /^\d+$/;

export function canonicalRangeToken(raw) {
  const m = String(raw).match(RANGE_PATTERN);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

export function numericOccupancyRange(token) {
  const range = canonicalRangeToken(token);
  if (range) {
    const [lo, hi] = range.split('-').map(Number);
    return { lo, hi };
  }
  if (BARE_NUMBER.test(String(token))) {
    const n = Number(token);
    return { lo: n, hi: n };
  }
  return null;
}

export function occupancyTokensOverlap(a, b) {
  if (!a || !b) return false;
  if (a === ALL_OCCUPANCY || b === ALL_OCCUPANCY) return true;
  if (a === b) return true;
  const ra = numericOccupancyRange(a);
  const rb = numericOccupancyRange(b);
  if (ra && rb) return ra.lo <= rb.hi && rb.lo <= ra.hi;
  return false;
}

/** Empty token list means the whole field. */
export function segmentSetsOverlap(a, b) {
  const left = !a?.length ? [ALL_OCCUPANCY] : a;
  const right = !b?.length ? [ALL_OCCUPANCY] : b;
  return left.some((token) => right.some((other) => occupancyTokensOverlap(token, other)));
}
