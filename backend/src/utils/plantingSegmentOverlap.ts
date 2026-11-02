/**
 * Range overlap for occupancy. Stored text stays as typed; tokens like
 * "6 TO 10" / "6 To 10" / "6-10" collapse to 6-10 for comparison only.
 * A bare 6 is the integer 6, not valve V6.
 */

export const ALL_OCCUPANCY = 'ALL';

const RANGE_PATTERN = /^(\d+)\s*(?:to|-)\s*(\d+)$/i;
const BARE_NUMBER = /^\d+$/;

export function canonicalRangeToken(raw: string): string | null {
  const m = String(raw).match(RANGE_PATTERN);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

export function numericOccupancyRange(token: string): { lo: number; hi: number } | null {
  const range = canonicalRangeToken(token);
  if (range) {
    const [lo, hi] = range.split('-').map(Number);
    return { lo, hi };
  }
  if (BARE_NUMBER.test(token)) {
    const n = Number(token);
    return { lo: n, hi: n };
  }
  return null;
}

export function occupancyTokensOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === ALL_OCCUPANCY || b === ALL_OCCUPANCY) return true;
  if (a === b) return true;
  const ra = numericOccupancyRange(a);
  const rb = numericOccupancyRange(b);
  if (ra && rb) return ra.lo <= rb.hi && rb.lo <= ra.hi;
  return false;
}

/** Empty token list means the whole field. */
export function segmentSetsOverlap(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const left = a.length === 0 ? [ALL_OCCUPANCY] : a;
  const right = b.length === 0 ? [ALL_OCCUPANCY] : b;
  return left.some((token) => right.some((other) => occupancyTokensOverlap(token, other)));
}
