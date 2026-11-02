/**
 * Canonical segment tokens for the planting write path.
 *
 * The client helper in src/utils/plantingSegment.js parses segments tolerantly
 * for display: it drops text it does not recognise, treats a bare number as a
 * valve, and can invent valve options for a field that has none. That is fine
 * for rendering a picker and wrong for uproot, which splits planting rows and
 * must never lose, duplicate, or reassign land.
 *
 * Rules here:
 *  - tokens survive a parse/serialise round trip
 *  - unrecognised text is preserved verbatim rather than dropped
 *  - a bare number stays a bare number, because it is ambiguous between bay
 *    and valve and guessing would move land between segments
 *  - nothing is ever invented
 */

import { canonicalRangeToken } from './plantingSegmentOverlap';

/** Sentinel meaning the whole field. */
export const ALL_SEGMENTS = 'ALL';

/** Planting rows separate segments with commas or ampersands. */
const SEPARATOR = /[,&]+/;

const ALL_PATTERN = /^(?:all|all segments|\*)$/i;
const BAY_PATTERN = /^(?:b|bay)[-\s]*(\d+)$/i;
const VALVE_PATTERN = /^(?:v|valve)[-\s]*(\d+)$/i;
const SPOT_PATTERN = /^(?:s|spot)[-\s]*(\d*)$/i;

export class AmbiguousSegmentSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousSegmentSplitError';
  }
}

/**
 * One segment fragment reduced to its canonical form. Unrecognised fragments
 * come back trimmed with collapsed whitespace and otherwise untouched.
 */
export function canonicalizeSegmentToken(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (ALL_PATTERN.test(trimmed)) return ALL_SEGMENTS;

  const bay = trimmed.match(BAY_PATTERN);
  if (bay) return `B${Number(bay[1])}`;

  const valve = trimmed.match(VALVE_PATTERN);
  if (valve) return `V${Number(valve[1])}`;

  const spot = trimmed.match(SPOT_PATTERN);
  if (spot) return spot[1] ? `S${Number(spot[1])}` : 'S';

  const range = canonicalRangeToken(trimmed);
  if (range) return range;

  return trimmed;
}

/**
 * Canonical tokens for a stored segment string, in first-appearance order and
 * deduplicated. A row that mentions ALL collapses to ALL alone, since the
 * whole field subsumes any segment listed alongside it.
 */
export function parseSegmentTokens(segment: string | null | undefined): string[] {
  const tokens: string[] = [];
  for (const part of String(segment ?? '').split(SEPARATOR)) {
    const token = canonicalizeSegmentToken(part);
    if (!token) continue;
    if (token === ALL_SEGMENTS) return [ALL_SEGMENTS];
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

/** Stored form of a token list. */
export function serializeSegmentTokens(tokens: readonly string[]): string {
  return tokens.join(', ');
}

export interface SegmentSplit {
  /** Tokens being uprooted, for the row that gets an uprooted_at stamp. */
  removed: string[];
  /** Tokens still growing, for the row that stays active. */
  remaining: string[];
}

/**
 * Partition a row's segments into the ones being uprooted and the ones left
 * growing.
 *
 * `universe` is the field's known segment list, needed only to expand a row
 * stored as ALL when the uproot is partial. Without it such a split is
 * ambiguous, and guessing would uproot a whole field, so it raises instead.
 */
export function splitSegmentTokens(
  segment: string | null | undefined,
  remove: readonly string[],
  opts: { universe?: readonly string[] } = {},
): SegmentSplit {
  const rowTokens = parseSegmentTokens(segment);

  const removeTokens: string[] = [];
  for (const entry of remove) {
    const token = canonicalizeSegmentToken(entry);
    if (token && !removeTokens.includes(token)) removeTokens.push(token);
  }

  if (removeTokens.includes(ALL_SEGMENTS)) {
    return { removed: rowTokens, remaining: [] };
  }
  if (removeTokens.length === 0) {
    return { removed: [], remaining: rowTokens };
  }

  let effective = rowTokens;
  if (rowTokens.includes(ALL_SEGMENTS)) {
    const universe = (opts.universe ?? [])
      .map((entry) => canonicalizeSegmentToken(entry))
      .filter((token) => token && token !== ALL_SEGMENTS);
    if (universe.length === 0) {
      throw new AmbiguousSegmentSplitError(
        'Cannot partially uproot a planting stored as ALL without the field segment list.',
      );
    }
    effective = [...new Set(universe)];
  }

  return {
    removed: effective.filter((token) => removeTokens.includes(token)),
    remaining: effective.filter((token) => !removeTokens.includes(token)),
  };
}
