/**
 * Attach a harvest to the planting cycle that occupied the field that day.
 *
 * Two sweetcorn cycles on the same ground must not share a yield bucket. The
 * link is field + segment + date, not crop name. Same-day uproot and replant
 * belongs to the outgoing cycle: prefer the row whose uprooted_at equals the
 * harvest date over the row whose occupancy starts that day. If more than one
 * row still matches after that, leave the harvest unlinked rather than guess.
 */

import {
  ALL_SEGMENTS,
  parseSegmentTokens,
} from './plantingSegmentTokens';

export type HarvestPlantingSource = 'open_field' | 'planting_record';

export interface HarvestPlantingCandidate {
  source: HarvestPlantingSource;
  id: string;
  segment: string | null;
  occupancyStart: string | Date | null;
  uprootedAt: string | Date | null;
}

export interface HarvestPlantingLink {
  openFieldPlantingId: string | null;
  plantingRecordId: string | null;
}

export const EMPTY_HARVEST_PLANTING_LINK: HarvestPlantingLink = {
  openFieldPlantingId: null,
  plantingRecordId: null,
};

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

/** DATE / timestamptz / YYYY-MM-DD → calendar day. */
export function toYmd(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whether this harvest's segment can belong to this planting row.
 *
 * An empty harvest segment does not filter: uniqueness of the remaining
 * candidates is what decides. ALL on either side matches everything.
 */
export function harvestSegmentsOverlap(
  harvestSegment: string | null | undefined,
  plantingSegment: string | null | undefined,
): boolean {
  const harvestTokens = parseSegmentTokens(harvestSegment);
  if (harvestTokens.length === 0) return true;

  const plantingTokens = parseSegmentTokens(plantingSegment);
  if (plantingTokens.length === 0) return true;
  if (harvestTokens.includes(ALL_SEGMENTS) || plantingTokens.includes(ALL_SEGMENTS)) {
    return true;
  }
  return harvestTokens.some((token) => plantingTokens.includes(token));
}

export function occupancyContainsDate(
  occupancyStart: string | Date | null | undefined,
  uprootedAt: string | Date | null | undefined,
  harvestDate: string | Date,
): boolean {
  const day = toYmd(harvestDate);
  const start = toYmd(occupancyStart);
  if (!day || !start || start > day) return false;
  const end = toYmd(uprootedAt);
  return !end || end >= day;
}

/**
 * Choose at most one candidate. Same-day uproot wins over same-day seeding.
 * More than one survivor is ambiguous → null.
 */
export function pickHarvestPlantingCandidate(
  candidates: readonly HarvestPlantingCandidate[],
  harvestDate: string | Date,
  harvestSegment?: string | null,
): HarvestPlantingCandidate | null {
  const inWindow = candidates.filter((row) =>
    occupancyContainsDate(row.occupancyStart, row.uprootedAt, harvestDate)
    && harvestSegmentsOverlap(harvestSegment, row.segment),
  );
  if (inWindow.length === 0) return null;

  const day = toYmd(harvestDate);
  const outgoing = inWindow.filter((row) => toYmd(row.uprootedAt) === day);
  const pool = outgoing.length > 0 ? outgoing : inWindow;
  if (pool.length !== 1) return null;
  return pool[0];
}

export function harvestPlantingLinkFromCandidate(
  candidate: HarvestPlantingCandidate | null,
): HarvestPlantingLink {
  if (!candidate) return { ...EMPTY_HARVEST_PLANTING_LINK };
  switch (candidate.source) {
    case 'open_field':
      return { openFieldPlantingId: candidate.id, plantingRecordId: null };
    case 'planting_record':
      return { openFieldPlantingId: null, plantingRecordId: candidate.id };
    default: {
      const _exhaustive: never = candidate.source;
      return _exhaustive;
    }
  }
}

function mapCandidateRow(
  row: Record<string, unknown>,
  source: HarvestPlantingSource,
): HarvestPlantingCandidate {
  return {
    source,
    id: String(row.id),
    segment: row.segment == null ? null : String(row.segment),
    occupancyStart: (row.occupancy_start as string | Date | null) ?? null,
    uprootedAt: (row.uprooted_at as string | Date | null) ?? null,
  };
}

/**
 * Resolve the planting row a harvest belongs to. Nulls when nothing matches
 * or more than one row still matches after the same-day rule.
 */
export async function resolveHarvestPlanting(
  input: { fieldId: string; harvestDate: string | Date; segmentId?: string | null },
  db: Queryable,
): Promise<HarvestPlantingLink> {
  const day = toYmd(input.harvestDate);
  if (!input.fieldId || !day) return { ...EMPTY_HARVEST_PLANTING_LINK };

  const ofp = await db.query(
    `SELECT id, segment, seeding_date AS occupancy_start, uprooted_at
       FROM open_field_planting
      WHERE field_id = $1::uuid
        AND migrated_to_planting_record_id IS NULL
        AND seeding_date <= $2::date
        AND (uprooted_at IS NULL OR uprooted_at >= $2::date)`,
    [input.fieldId, day],
  );
  const pr = await db.query(
    `SELECT id, segment, COALESCE(transplant_date, seeding_date) AS occupancy_start, uprooted_at
       FROM planting_records
      WHERE field_id = $1::uuid
        AND COALESCE(transplant_date, seeding_date) <= $2::date
        AND (uprooted_at IS NULL OR uprooted_at >= $2::date)`,
    [input.fieldId, day],
  );

  const candidates: HarvestPlantingCandidate[] = [
    ...ofp.rows.map((row) => mapCandidateRow(row, 'open_field')),
    ...pr.rows.map((row) => mapCandidateRow(row, 'planting_record')),
  ];

  return harvestPlantingLinkFromCandidate(
    pickHarvestPlantingCandidate(candidates, day, input.segmentId),
  );
}
