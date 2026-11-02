/**
 * Uproot: freeing a field, or part of one, for the next planting cycle.
 *
 * Sweetcorn runs three cycles in a season on the same ground. Uproot is what
 * ends one cycle: it frees all or some segments so the next seeding can go in,
 * without deleting a single harvest, spray, irrigation or manpower record. The
 * cycle that produced them stays in the table with an uprooted_at stamp.
 *
 * The mechanics are identical for open field and for greenhouse/nethouse, so
 * both planting tables run through here. They differ only in how occupancy
 * starts, which is what OCCUPANCY_START_SQL captures.
 */

import { z } from 'zod';
import { dbPool } from '../db/client';
import {
  ALL_SEGMENTS,
  parseSegmentTokens,
  serializeSegmentTokens,
  splitSegmentTokens,
} from '../utils/plantingSegmentTokens';
import { occupancyTokensOverlap } from '../utils/plantingSegmentOverlap';
import { closeCropHistoryForUproot, syncFieldCrop } from '../utils/fieldCropSync';
import { AppError } from '../utils/errors';

/** A pool or a checked-out client, so uproot can run in one transaction. */
export type UprootDb = { query: typeof dbPool.query };

export type PlantingTable = 'open_field_planting' | 'planting_records';

/**
 * When a planting starts occupying its field.
 *
 * A greenhouse record that has been sown in trays but not yet transplanted is
 * not holding the field, so it cannot be uprooted from it; open field seeding
 * goes straight into the ground.
 */
const OCCUPANCY_START_SQL: Record<PlantingTable, string> = {
  open_field_planting: 'seeding_date',
  planting_records: 'COALESCE(transplant_date, seeding_date)',
};

/** Archive OF rows copied onto planting_records must not occupy land twice. */
function liveRowSql(table: PlantingTable, alias = ''): string {
  const col = alias ? `${alias}.` : '';
  const migrated = table === 'open_field_planting'
    ? ` AND ${col}migrated_to_planting_record_id IS NULL`
    : '';
  return `${col}status = 'active'${migrated}`;
}

/** Set on the copied row rather than carried over from the source row. */
const UPROOT_COLUMNS = ['segment', 'status', 'uprooted_at', 'uprooted_by', 'uproot_reason'] as const;

/** Request body shared by the open field and greenhouse uproot endpoints. */
export const uprootSchema = z.object({
  fieldId: z.string().uuid(),
  segments: z.union([z.literal('ALL'), z.array(z.string().min(1)).min(1)]),
  uprootDate: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export interface UprootInput {
  table: PlantingTable;
  fieldId: string;
  /** Canonical or free-text segment labels, or 'ALL' for the whole field. */
  segments: readonly string[] | 'ALL';
  uprootDate: string;
  reason?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  /**
   * End season must free every still-growing row, including ones whose
   * occupancy start is after the close date. Cycle uproot keeps the date filter.
   */
  allActive?: boolean;
}

export interface UprootSummary {
  /** Rows moved wholly to uprooted. */
  rowsUprooted: number;
  /** Rows partially uprooted, leaving the remainder growing. */
  rowsSplit: number;
  segmentsUprooted: string[];
  /** Segments on this field still growing after the uproot. */
  segmentsRemaining: string[];
  /** Requested segments that had nothing growing on them. */
  segmentsNotFound: string[];
  /** True when the field is now bare and its crop has been cleared. */
  fieldCleared: boolean;
}

const columnCache = new Map<PlantingTable, string[]>();

/**
 * Columns worth carrying onto a split row, read from the catalogue so a future
 * migration that adds a column does not silently drop it from the copy.
 */
async function copyableColumns(table: PlantingTable, db: UprootDb): Promise<string[]> {
  const cached = columnCache.get(table);
  if (cached) return cached;

  const res = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = $1
        AND column_name NOT IN ('id', 'created_at', 'updated_at')
      ORDER BY ordinal_position`,
    [table],
  );
  const columns = res.rows.map((row) => String(row.column_name));
  columnCache.set(table, columns);
  return columns;
}

/**
 * Every segment token known to be real on this field, from planting rows and
 * configured valves.
 *
 * Nothing is invented here. If a field has no recorded segments, a partial
 * uproot of a row stored as ALL stays ambiguous and the tokenizer raises,
 * which is the right outcome: guessing would free land that is still growing.
 */
export async function fieldSegmentUniverse(fieldId: string, db: UprootDb): Promise<string[]> {
  const tokens = new Set<string>();

  const stored = await db.query(
    `SELECT segment FROM open_field_planting WHERE field_id = $1 AND segment IS NOT NULL
     UNION ALL
     SELECT segment FROM planting_records WHERE field_id = $1 AND segment IS NOT NULL`,
    [fieldId],
  );
  for (const row of stored.rows) {
    for (const token of parseSegmentTokens(row.segment as string)) {
      if (token !== ALL_SEGMENTS) tokens.add(token);
    }
  }

  const valves = await db.query(`SELECT number FROM valves WHERE field_id = $1`, [fieldId]);
  for (const row of valves.rows) {
    tokens.add(`V${Number(row.number)}`);
  }

  return [...tokens];
}

/**
 * Segment universe for every field on a site, in two queries instead of 2N.
 */
export async function fieldSegmentUniverseBySite(
  siteId: string,
  db: UprootDb,
): Promise<Map<string, string[]>> {
  const tokensByField = new Map<string, Set<string>>();
  const add = (fieldId: string, token: string) => {
    if (!token || token === ALL_SEGMENTS) return;
    const next = tokensByField.get(fieldId) || new Set<string>();
    next.add(token);
    tokensByField.set(fieldId, next);
  };

  const stored = await db.query(
    `SELECT p.field_id, p.segment
       FROM planting_records p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid AND p.segment IS NOT NULL
     UNION ALL
     SELECT p.field_id, p.segment
       FROM open_field_planting p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid AND p.segment IS NOT NULL`,
    [siteId],
  );
  for (const row of stored.rows) {
    for (const token of parseSegmentTokens(row.segment as string)) {
      add(String(row.field_id), token);
    }
  }

  const valves = await db.query(
    `SELECT v.field_id, v.number
       FROM valves v
       JOIN fields f ON f.id = v.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid`,
    [siteId],
  );
  for (const row of valves.rows) {
    add(String(row.field_id), `V${Number(row.number)}`);
  }

  const out = new Map<string, string[]>();
  for (const [fieldId, tokens] of tokensByField) {
    out.set(fieldId, [...tokens]);
  }
  return out;
}

interface ActiveRow {
  id: string;
  segment: string | null;
}

/** Rows holding this field on the uproot date, oldest cycle first. */
async function activeRows(
  input: UprootInput,
  db: UprootDb,
): Promise<ActiveRow[]> {
  const occupancyStart = OCCUPANCY_START_SQL[input.table];
  const params: unknown[] = [input.fieldId];
  let dateFilter = '';
  if (!input.allActive) {
    params.push(input.uprootDate);
    dateFilter = ` AND ${occupancyStart} <= $${params.length}::date`;
  }
  let orgFilter = '';
  if (input.organizationId) {
    params.push(input.organizationId);
    orgFilter = ` AND organization_id = $${params.length}::uuid`;
  }

  const res = await db.query(
    `SELECT id, segment FROM ${input.table}
      WHERE field_id = $1::uuid
        AND ${liveRowSql(input.table)}${dateFilter}${orgFilter}
      ORDER BY ${occupancyStart} ASC, created_at ASC`,
    params,
  );
  return res.rows.map((row) => ({ id: String(row.id), segment: row.segment as string | null }));
}

/** Segments still growing on a field, across both planting tables. */
async function remainingSegments(fieldId: string, db: UprootDb): Promise<string[]> {
  const res = await db.query(
    `SELECT segment FROM open_field_planting
      WHERE field_id = $1 AND ${liveRowSql('open_field_planting')}
     UNION ALL
     SELECT segment FROM planting_records
      WHERE field_id = $1 AND ${liveRowSql('planting_records')}`,
    [fieldId],
  );
  const tokens = new Set<string>();
  for (const row of res.rows) {
    for (const token of parseSegmentTokens(row.segment as string)) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * Uproot all or part of a field.
 *
 * Rows fully covered by the request are stamped in place. A row that is only
 * partly covered is split: the original keeps the segments still growing and a
 * copy carries the uprooted ones, so the freed land and the growing land end up
 * as separate rows and neither loses its planting detail.
 *
 * Expects to be called inside a transaction.
 */
export async function uprootPlanting(input: UprootInput, db: UprootDb): Promise<UprootSummary> {
  const requested = input.segments === 'ALL' ? [ALL_SEGMENTS] : input.segments;
  const rows = await activeRows(input, db);

  const wantsWholeField = requested.some(
    (entry) => parseSegmentTokens(entry)[0] === ALL_SEGMENTS,
  );
  const universe = wantsWholeField ? [] : await fieldSegmentUniverse(input.fieldId, db);

  const uprootedTokens = new Set<string>();
  let rowsUprooted = 0;
  let rowsSplit = 0;

  for (const row of rows) {
    const { removed, remaining } = splitSegmentTokens(row.segment, requested, { universe });
    if (removed.length === 0) continue;

    for (const token of removed) uprootedTokens.add(token);

    if (remaining.length === 0) {
      await db.query(
        `UPDATE ${input.table}
            SET status = 'uprooted', uprooted_at = $1::date, uprooted_by = $2::uuid,
                uproot_reason = $3, updated_at = NOW()
          WHERE id = $4::uuid`,
        [input.uprootDate, input.userId ?? null, input.reason ?? null, row.id],
      );
      rowsUprooted += 1;
      continue;
    }

    // Partial: the original row keeps growing on what is left, and the freed
    // segments move to a copy that carries the uproot stamp.
    const columns = await copyableColumns(input.table, db);
    const passthrough = columns.filter(
      (column) => !UPROOT_COLUMNS.includes(column as (typeof UPROOT_COLUMNS)[number]),
    );
    await db.query(
      `INSERT INTO ${input.table} (${[...passthrough, ...UPROOT_COLUMNS].join(', ')})
       SELECT ${passthrough.join(', ')}, $2, 'uprooted', $3::date, $4::uuid, $5
         FROM ${input.table} WHERE id = $1::uuid`,
      [
        row.id,
        serializeSegmentTokens(removed),
        input.uprootDate,
        input.userId ?? null,
        input.reason ?? null,
      ],
    );
    await db.query(
      `UPDATE ${input.table} SET segment = $1, updated_at = NOW() WHERE id = $2::uuid`,
      [serializeSegmentTokens(remaining), row.id],
    );
    rowsSplit += 1;
  }

  const stillGrowing = await remainingSegments(input.fieldId, db);
  const fieldCleared = stillGrowing.length === 0;

  // Closing the rotation only makes sense once the whole field is bare. While
  // any segment is still growing the field keeps its crop, and the per-segment
  // truth lives on the planting rows.
  if (fieldCleared) {
    await closeCropHistoryForUproot(input.fieldId, input.uprootDate, db);
  } else {
    await syncFieldCrop(input.fieldId, db);
  }

  const notFound = wantsWholeField
    ? []
    : requested
        .flatMap((entry) => parseSegmentTokens(entry))
        .filter((token) => !uprootedTokens.has(token));

  return {
    rowsUprooted,
    rowsSplit,
    segmentsUprooted: [...uprootedTokens],
    segmentsRemaining: stillGrowing,
    segmentsNotFound: [...new Set(notFound)],
    fieldCleared,
  };
}

/**
 * Segments on a field that already have something growing on them.
 *
 * Both planting tables are scanned: open field and greenhouse share land, and
 * a row copied during the OF→planting_records migrate is skipped via
 * migrated_to_planting_record_id. Same-day uproot then seed is allowed because
 * the uprooted row is no longer active.
 */
export async function occupiedSegments(
  _table: PlantingTable,
  fieldId: string,
  onDate: string,
  db: UprootDb = dbPool,
  seasonId?: string | null,
): Promise<string[]> {
  const seasonClause = seasonId
    ? 'AND (season_id = $3::uuid OR season_id IS NULL)'
    : '';
  const params: unknown[] = seasonId ? [fieldId, onDate, seasonId] : [fieldId, onDate];
  const res = await db.query(
    `SELECT segment FROM open_field_planting
      WHERE field_id = $1::uuid
        AND ${liveRowSql('open_field_planting')}
        AND seeding_date <= $2::date
        ${seasonClause}
     UNION ALL
     SELECT segment FROM planting_records
      WHERE field_id = $1::uuid
        AND ${liveRowSql('planting_records')}
        AND COALESCE(transplant_date, seeding_date) <= $2::date
        ${seasonClause}`,
    params,
  );
  const tokens = new Set<string>();
  for (const row of res.rows) {
    for (const token of parseSegmentTokens(row.segment as string)) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

export interface OccupancyRow {
  id: string;
  segment: string | null;
  segmentTokens: string[];
  cropId: string | null;
  cropName: string | null;
  varietyName: string | null;
  occupancyStart: string | null;
}

/**
 * What is currently growing on a field, one entry per planting row.
 *
 * This drives the occupancy panel on the seeding screens and the segment
 * checklist in the uproot dialog, so only segments with something in the
 * ground can be offered for uprooting.
 */
export async function listActiveOccupancy(
  table: PlantingTable,
  fieldId: string,
  db: UprootDb = dbPool,
): Promise<OccupancyRow[]> {
  const occupancyStart = OCCUPANCY_START_SQL[table];
  const res = await db.query(
    `SELECT p.id, p.segment, p.crop_id, ${occupancyStart} AS occupancy_start,
            c.name AS crop_name, cv.name AS variety_name
       FROM ${table} p
       LEFT JOIN crops c ON c.id = p.crop_id
       LEFT JOIN crop_varieties cv ON cv.id = p.variety_id
      WHERE p.field_id = $1::uuid AND ${liveRowSql(table, 'p')}
      ORDER BY ${occupancyStart} ASC, p.created_at ASC`,
    [fieldId],
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    segment: (row.segment as string) ?? null,
    segmentTokens: parseSegmentTokens(row.segment as string),
    cropId: (row.crop_id as string) ?? null,
    cropName: (row.crop_name as string) ?? null,
    varietyName: (row.variety_name as string) ?? null,
    occupancyStart: row.occupancy_start ? String(row.occupancy_start) : null,
  }));
}

/**
 * Which of the requested segments are already taken.
 *
 * A field occupied as ALL blocks everything; a request for ALL is blocked by
 * any occupancy at all.
 */
export function conflictingSegments(
  requested: readonly string[] | 'ALL',
  occupied: readonly string[],
): string[] {
  const occupiedTokens = new Set(occupied);
  if (occupiedTokens.size === 0) return [];

  const requestedTokens =
    requested === 'ALL'
      ? [ALL_SEGMENTS]
      : [...new Set(requested.flatMap((entry) => parseSegmentTokens(entry)))];

  if (requestedTokens.includes(ALL_SEGMENTS) || occupiedTokens.has(ALL_SEGMENTS)) {
    return [...occupiedTokens];
  }
  return [...occupiedTokens].filter((occupiedToken) => (
    requestedTokens.some((requestedToken) => occupancyTokensOverlap(requestedToken, occupiedToken))
  ));
}

/** Empty or ALL on a field row means the whole field. */
export function requestedOccupancyTokens(segment: string | null | undefined): string[] | 'ALL' {
  const tokens = parseSegmentTokens(segment);
  if (tokens.length === 0 || tokens.includes(ALL_SEGMENTS)) return 'ALL';
  return tokens;
}

/**
 * Hard stop: a new seeding may not land on ground that is still growing in
 * this season. Same-day uproot then seed is allowed because the uprooted row
 * is no longer active.
 */
export async function assertSeedingNotOccupied(
  table: PlantingTable,
  fieldId: string,
  segment: string | null | undefined,
  onDate: string,
  seasonId: string | null | undefined,
  db: UprootDb = dbPool,
): Promise<void> {
  const occupied = await occupiedSegments(table, fieldId, onDate, db, seasonId);
  const conflicts = conflictingSegments(requestedOccupancyTokens(segment), occupied);
  if (conflicts.length === 0) return;
  throw new AppError(
    `Cannot seed onto occupied ground (${conflicts.join(', ')}). Uproot first.`,
    'SEGMENTS_OCCUPIED',
    409,
    { conflicts },
  );
}
