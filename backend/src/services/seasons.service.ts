/**
 * Seasons: a named date range per site (e.g. Sep 2025 – Jul 2026).
 *
 * Close stamps remaining plantings with reason "Season closed" so a later
 * reopen can undo only those, never a cycle uproot. End does not create the
 * next year. Historical years (closed, closed_by null) stay locked until an
 * auditor stamps reopened_at; they can still be deleted.
 */

import { dbPool } from '../db/client';
import { UserRole } from '../models/user.model';
import { farmManagerSiteAccessSql } from '../repositories/assignment.repository';
import { AppError } from '../utils/errors';
import { syncFieldCrop } from '../utils/fieldCropSync';
import {
  assertSeedingNotOccupied,
  uprootPlanting,
  type PlantingTable,
  type UprootDb,
} from './plantingUproot.service';

export type SeasonsDb = { query: typeof dbPool.query };

export interface SeasonRow {
  id: string;
  organization_id: string | null;
  site_id: string;
  name: string;
  start_date: string | Date;
  planned_end_date: string | Date;
  end_date: string | Date | null;
  status: 'open' | 'closed' | 'reopen_pending';
  closed_at: string | Date | null;
  closed_by: string | null;
  reopened_at: string | Date | null;
  reopened_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface SeasonRange {
  startDate: string;
  plannedEndDate: string;
  endDate?: string | null;
}

/** Inclusive calendar overlap using end_date, or planned_end_date while open. */
export function seasonRangesOverlap(a: SeasonRange, b: SeasonRange): boolean {
  const aEnd = a.endDate || a.plannedEndDate;
  const bEnd = b.endDate || b.plannedEndDate;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/** Farm year: 1 Sep → 31 Jul. August onwards belongs to the new season. */
export function defaultSeasonWindow(today: Date = new Date()): {
  startDate: string;
  plannedEndDate: string;
  name: string;
} {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const startYear = month >= 8 ? year : year - 1;
  const startDate = `${startYear}-09-01`;
  const plannedEndDate = `${startYear + 1}-07-31`;
  return {
    startDate,
    plannedEndDate,
    name: `${startYear}-${startYear + 1}`,
  };
}

/** Exact string reopen uses to undo only season-closure uproots. */
export const SEASON_CLOSED_REASON = 'Season closed';

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

export function todayYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const lookup = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value || ''
  );
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

/** Last farming day: YYYY-MM-DD, on/after start, on/before Dubai today. */
export function assertSeasonEndDate(
  endDate: string,
  startDate: string,
  today: string = todayYmd(),
): string {
  if (!ISO_DATE.test(endDate)) {
    throw new AppError('end_date must be YYYY-MM-DD', 'VALIDATION_ERROR', 400);
  }
  if (!startDate || endDate < startDate) {
    throw new AppError('end_date must be on or after start_date', 'VALIDATION_ERROR', 400);
  }
  if (!ISO_DATE.test(today) || endDate > today) {
    throw new AppError('end_date cannot be after today', 'VALIDATION_ERROR', 400);
  }
  return endDate;
}

/** Next open season after a close: starts the following day, name increments. */
export function nextSeasonDraft(closed: Pick<SeasonRow, 'name'>, endDate: string): {
  name: string;
  startDate: string;
  plannedEndDate: string;
} {
  const startDate = addDaysYmd(endDate, 1);
  const match = String(closed.name).match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    const window = defaultSeasonWindow(new Date(`${startDate}T00:00:00Z`));
    const plannedEndDate = window.plannedEndDate < startDate
      ? `${Number(window.plannedEndDate.slice(0, 4)) + 1}-07-31`
      : window.plannedEndDate;
    return { name: window.name, startDate, plannedEndDate };
  }
  const startYear = Number(match[1]) + 1;
  let endYear = Number(match[2]) + 1;
  let plannedEndDate = `${endYear}-07-31`;
  if (plannedEndDate < startDate) {
    endYear += 1;
    plannedEndDate = `${endYear}-07-31`;
  }
  return { name: `${startYear}-${endYear}`, startDate, plannedEndDate };
}

function asRange(row: SeasonRow): SeasonRange {
  return {
    startDate: toYmd(row.start_date),
    plannedEndDate: toYmd(row.planned_end_date),
    endDate: toYmd(row.end_date) || null,
  };
}

async function assertNoOverlap(
  siteId: string,
  range: SeasonRange,
  db: SeasonsDb,
  excludeId?: string,
): Promise<void> {
  const existing = await listSeasons(siteId, db);
  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue;
    if (seasonRangesOverlap(range, asRange(row))) {
      throw new AppError(
        `Season dates overlap ${row.name} (${toYmd(row.start_date)} – ${toYmd(row.end_date) || toYmd(row.planned_end_date)})`,
        'SEASON_OVERLAP',
        409,
        { conflictingSeasonId: row.id, conflictingName: row.name },
      );
    }
  }
}

export async function listSeasons(siteId: string, db: SeasonsDb = dbPool): Promise<SeasonRow[]> {
  const res = await db.query(
    `SELECT * FROM seasons WHERE site_id = $1::uuid ORDER BY start_date DESC, created_at DESC`,
    [siteId],
  );
  return res.rows as SeasonRow[];
}

export async function getSeasonById(
  id: string,
  db: SeasonsDb = dbPool,
): Promise<SeasonRow | null> {
  const res = await db.query(`SELECT * FROM seasons WHERE id = $1::uuid`, [id]);
  return (res.rows[0] as SeasonRow) || null;
}

export async function getOpenSeason(
  siteId: string,
  db: SeasonsDb = dbPool,
): Promise<SeasonRow | null> {
  const res = await db.query(
    `SELECT * FROM seasons WHERE site_id = $1::uuid AND status = 'open' LIMIT 1`,
    [siteId],
  );
  return (res.rows[0] as SeasonRow) || null;
}

/**
 * Farm Manager: a site in their org they can reach — inside a zone assigned to
 * them, or assigned to them directly (same rule as canUserAccessSite).
 * Operation Manager: assigned site only.
 */
export async function assertCanManageSeasons(
  userId: string,
  role: UserRole,
  siteId: string,
  orgId: string,
  db: SeasonsDb = dbPool,
): Promise<void> {
  switch (role) {
    case 'farm_manager': {
      const own = await db.query(
        `SELECT ${farmManagerSiteAccessSql('s', '$3')} AS can_manage
           FROM sites s
          WHERE s.id = $1::uuid AND s.organization_id = $2::uuid AND s.deleted_at IS NULL`,
        [siteId, orgId, userId],
      );
      if (own.rows.length === 0) {
        throw new AppError('Site not found', 'NOT_FOUND', 404);
      }
      if (!own.rows[0].can_manage) {
        throw new AppError(
          'Only a Farm Manager assigned to this site or its zone can manage its seasons',
          'FORBIDDEN',
          403,
        );
      }
      return;
    }
    case 'operation_manager': {
      const assigned = await db.query(
        `SELECT 1 FROM user_site_assignments
          WHERE user_id = $1::uuid AND site_id = $2::uuid
          LIMIT 1`,
        [userId, siteId],
      );
      if (assigned.rows.length === 0) {
        throw new AppError(
          'Only the Operation Manager assigned to this site can manage its seasons',
          'FORBIDDEN',
          403,
        );
      }
      return;
    }
    case 'ceo':
    case 'agronomist':
    case 'pest_agronomist':
    case 'scouter':
    case 'worker':
    case 'operator':
    case 'intern_student':
    case 'intern_teacher':
    case 'auditor':
      throw new AppError(
        'Only the Farm Manager or the site Operation Manager can manage seasons',
        'FORBIDDEN',
        403,
      );
    default: {
      const _exhaustive: never = role;
      throw new AppError(
        `Unknown role ${String(_exhaustive)}`,
        'FORBIDDEN',
        403,
      );
    }
  }
}

export async function startOpenSeason(
  input: {
    organizationId: string | null;
    siteId: string;
    name?: string;
    startDate?: string;
    plannedEndDate?: string;
  },
  db: SeasonsDb = dbPool,
): Promise<SeasonRow> {
  const window = defaultSeasonWindow();
  return createSeason({
    organizationId: input.organizationId,
    siteId: input.siteId,
    name: (input.name?.trim() || window.name),
    startDate: input.startDate || window.startDate,
    plannedEndDate: input.plannedEndDate || window.plannedEndDate,
    status: 'open',
  }, db);
}

export async function ensureOpenSeasonForSite(
  siteId: string,
  _organizationId: string | null,
  db: SeasonsDb = dbPool,
): Promise<SeasonRow> {
  const existing = await getOpenSeason(siteId, db);
  if (existing) return existing;
  throw new AppError(
    'No open season. Start a season to record new work.',
    'SEASON_NONE_OPEN',
    409,
  );
}

function assertCreatableStatus(status: SeasonRow['status']): asserts status is 'open' | 'closed' {
  switch (status) {
    case 'open':
    case 'closed':
      return;
    case 'reopen_pending':
      throw new AppError(
        'Cannot create a season as reopen_pending',
        'VALIDATION_ERROR',
        400,
      );
    default: {
      const _exhaustive: never = status;
      throw new AppError(`Unknown season status ${String(_exhaustive)}`, 'VALIDATION_ERROR', 400);
    }
  }
}

export async function createSeason(
  input: {
    organizationId: string | null;
    siteId: string;
    name: string;
    startDate: string;
    plannedEndDate: string;
    status?: 'open' | 'closed';
  },
  db: SeasonsDb = dbPool,
): Promise<SeasonRow> {
  const status = input.status ?? 'open';
  assertCreatableStatus(status);
  if (input.startDate > input.plannedEndDate) {
    throw new AppError('start_date must be on or before planned_end_date', 'VALIDATION_ERROR', 400);
  }
  await assertNoOverlap(input.siteId, {
    startDate: input.startDate,
    plannedEndDate: input.plannedEndDate,
    endDate: status === 'closed' ? input.plannedEndDate : null,
  }, db);
  if (status === 'open') {
    const open = await getOpenSeason(input.siteId, db);
    if (open) {
      throw new AppError(
        `Site already has an open season (${open.name})`,
        'SEASON_ALREADY_OPEN',
        409,
        { openSeasonId: open.id },
      );
    }
  }
  // Historical years: end_date set, closed_at/closed_by left null so the write
  // guard can tell them apart from a year closed with End Season.
  const endDate = status === 'closed' ? input.plannedEndDate : null;
  const res = await db.query(
    `INSERT INTO seasons (organization_id, site_id, name, start_date, planned_end_date, status, end_date)
     VALUES ($1, $2::uuid, $3, $4::date, $5::date, $6, $7::date)
     RETURNING *`,
    [
      input.organizationId,
      input.siteId,
      input.name.trim(),
      input.startDate,
      input.plannedEndDate,
      status,
      endDate,
    ],
  );
  return res.rows[0] as SeasonRow;
}

export async function updateSeason(
  id: string,
  patch: {
    name?: string;
    startDate?: string;
    plannedEndDate?: string;
    endDate?: string;
    today?: string;
  },
  db: SeasonsDb = dbPool,
): Promise<SeasonRow> {
  const current = await getSeasonById(id, db);
  if (!current) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }
  if (current.status === 'open' && patch.endDate) {
    throw new AppError('Open seasons do not have an end date until they are closed', 'VALIDATION_ERROR', 400);
  }
  if (current.status !== 'open' && patch.startDate) {
    throw new AppError('Cannot change start_date on a closed season', 'VALIDATION_ERROR', 400);
  }
  const startDate = patch.startDate ?? toYmd(current.start_date);
  const plannedEndDate = patch.plannedEndDate ?? toYmd(current.planned_end_date);
  const endDate = patch.endDate
    ? assertSeasonEndDate(patch.endDate, startDate, patch.today ?? todayYmd())
    : (toYmd(current.end_date) || null);
  const next: SeasonRange = {
    startDate,
    plannedEndDate,
    endDate,
  };
  if (next.startDate > next.plannedEndDate) {
    throw new AppError('start_date must be on or before planned_end_date', 'VALIDATION_ERROR', 400);
  }
  await assertNoOverlap(current.site_id, next, db, id);

  const res = await db.query(
    `UPDATE seasons
        SET name = COALESCE($2, name),
            start_date = COALESCE($3::date, start_date),
            planned_end_date = COALESCE($4::date, planned_end_date),
            end_date = COALESCE($5::date, end_date),
            updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *`,
    [
      id,
      patch.name?.trim() ?? null,
      patch.startDate ?? null,
      patch.plannedEndDate ?? null,
      patch.endDate ?? null,
    ],
  );
  return res.rows[0] as SeasonRow;
}

async function siteForField(
  fieldId: string,
  db: SeasonsDb,
): Promise<{ siteId: string; organizationId: string | null } | null> {
  const res = await db.query(
    `SELECT s.id AS site_id, s.organization_id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       JOIN sites s ON s.id = fa.site_id
      WHERE f.id = $1::uuid`,
    [fieldId],
  );
  const row = res.rows[0] as { site_id: string; organization_id: string | null } | undefined;
  if (!row) return null;
  return { siteId: row.site_id, organizationId: row.organization_id };
}

export async function openSeasonForField(
  fieldId: string,
  db: SeasonsDb = dbPool,
): Promise<SeasonRow | null> {
  const site = await siteForField(fieldId, db);
  if (!site) return null;
  return ensureOpenSeasonForSite(site.siteId, site.organizationId, db);
}

export async function seasonIdForField(
  fieldId: string,
  db: SeasonsDb = dbPool,
): Promise<string | null> {
  const season = await openSeasonForField(fieldId, db);
  return season?.id ?? null;
}

export async function coveringSeasonForSite(
  siteId: string,
  onDate: string,
  db: SeasonsDb = dbPool,
): Promise<SeasonRow | null> {
  const res = await db.query(
    `SELECT * FROM seasons
      WHERE site_id = $1::uuid
        AND start_date <= $2::date
        AND COALESCE(end_date, planned_end_date) >= $2::date
      ORDER BY start_date DESC, id DESC
      LIMIT 1`,
    [siteId, onDate],
  );
  return (res.rows[0] as SeasonRow) || null;
}

export async function seasonForWritableField(
  fieldId: string,
  onDate: string,
  db: SeasonsDb = dbPool,
): Promise<SeasonRow | null> {
  const site = await siteForField(fieldId, db);
  if (!site) return null;
  await assertDateWritableForSite(site.siteId, onDate, db);
  const covering = await coveringSeasonForSite(site.siteId, onDate, db);
  if (covering) return covering;
  return ensureOpenSeasonForSite(site.siteId, site.organizationId, db);
}

/** Refuse harvest / EC / IPM writes into a locked covering year, or when none is open. */
export async function assertFieldDateWritable(
  fieldId: string | null | undefined,
  onDate: string | Date | null | undefined,
  db: SeasonsDb = dbPool,
): Promise<void> {
  if (!fieldId || onDate == null || onDate === '') return;
  const ymd = toYmd(onDate);
  if (!ymd) return;
  const site = await siteForField(fieldId, db);
  if (!site) return;
  await assertDateWritableForSite(site.siteId, ymd, db);
  const covering = await coveringSeasonForSite(site.siteId, ymd, db);
  if (covering) return;
  const open = await getOpenSeason(site.siteId, db);
  if (open) return;
  throw new AppError(
    'No open season. Start a season to record new work.',
    'SEASON_NONE_OPEN',
    409,
  );
}

/**
 * Refuse edits/deletes of a record dated inside a closed (or reopen-pending)
 * season for the field's site. Unlike assertFieldDateWritable it does not
 * require an open season to exist.
 */
export async function assertFieldDateNotClosed(
  fieldId: string | null | undefined,
  onDate: string | Date | null | undefined,
  db: SeasonsDb = dbPool,
): Promise<void> {
  if (!fieldId || onDate == null || onDate === '') return;
  const ymd = toYmd(onDate);
  if (!ymd) return;
  const site = await siteForField(fieldId, db);
  if (!site) return;
  await assertDateWritableForSite(site.siteId, ymd, db);
}

export async function seasonIdForWritableField(
  fieldId: string,
  onDate: string,
  db: SeasonsDb = dbPool,
): Promise<string | null> {
  const season = await seasonForWritableField(fieldId, onDate, db);
  return season?.id ?? null;
}

export async function nextCycleNumber(
  _table: PlantingTable,
  fieldId: string,
  segment: string | null | undefined,
  cropId: string | null | undefined,
  seasonId: string,
  db: SeasonsDb = dbPool,
): Promise<number> {
  const res = await db.query(
    `SELECT COALESCE(MAX(cycle_number), 0) + 1 AS n
       FROM (
         SELECT cycle_number FROM planting_records
          WHERE field_id = $1::uuid
            AND season_id = $2::uuid
            AND crop_id IS NOT DISTINCT FROM $3::uuid
            AND COALESCE(segment, '') = COALESCE($4, '')
         UNION ALL
         SELECT cycle_number FROM open_field_planting
          WHERE field_id = $1::uuid
            AND season_id = $2::uuid
            AND crop_id IS NOT DISTINCT FROM $3::uuid
            AND COALESCE(segment, '') = COALESCE($4, '')
            AND migrated_to_planting_record_id IS NULL
       ) cycles`,
    [fieldId, seasonId, cropId ?? null, segment ?? ''],
  );
  return Number(res.rows[0]?.n) || 1;
}

/**
 * Stamp a new planting with the season covering the occupancy date (historical
 * or open) and the next cycle number, and refuse if those segments are still
 * growing in that season.
 */
export async function preparePlantingInsert(
  table: PlantingTable,
  input: {
    fieldId?: string | null;
    segment?: string | null;
    cropId?: string | null;
    occupancyDate: string;
    skipOccupancy?: boolean;
  },
  db: UprootDb = dbPool,
): Promise<{ seasonId: string | null; cycleNumber: number }> {
  if (!input.fieldId) {
    return { seasonId: null, cycleNumber: 1 };
  }

  const season = await seasonForWritableField(input.fieldId, input.occupancyDate, db);
  if (!season) {
    throw new AppError(
      'No open season. Start a season to record new work.',
      'SEASON_NONE_OPEN',
      409,
    );
  }
  const seasonId = season.id;

  if (!input.skipOccupancy) {
    await assertSeedingNotOccupied(
      table,
      input.fieldId,
      input.segment,
      input.occupancyDate,
      seasonId,
      db,
    );
  }

  const cycleNumber = await nextCycleNumber(
    table,
    input.fieldId,
    input.segment,
    input.cropId,
    seasonId,
    db,
  );
  return { seasonId, cycleNumber };
}

export async function assertDateWritableForSite(
  siteId: string,
  onDate: string,
  db: SeasonsDb = dbPool,
): Promise<void> {
  const res = await db.query(
    `SELECT name FROM seasons
      WHERE site_id = $1::uuid
        AND start_date <= $2::date
        AND COALESCE(end_date, planned_end_date) >= $2::date
        AND (
          status = 'reopen_pending'
          OR (
            status = 'closed'
            AND (closed_by IS NOT NULL OR reopened_at IS NULL)
          )
        )
      LIMIT 1`,
    [siteId, onDate],
  );
  const name = res.rows[0]?.name as string | undefined;
  if (!name) return;
  throw new AppError(
    `${name} is closed. Request a reopen or start a new season to record new work.`,
    'SEASON_CLOSED',
    403,
    { seasonName: name },
  );
}

export interface CloseSeasonResult {
  closed: SeasonRow;
  ofpRowsUprooted: number;
  prRowsUprooted: number;
  fieldsCleared: number;
  cropHistoryClosed: number;
}

/**
 * End a site year: uproot whatever is still growing (reason Season closed),
 * close open rotations, stamp the season closed. Does not create the next year.
 * Nothing is deleted. Caller owns BEGIN/COMMIT.
 */
export async function closeSeason(
  input: {
    seasonId: string;
    endDate: string;
    userId: string;
    organizationId: string | null;
    today?: string;
  },
  db: SeasonsDb = dbPool,
): Promise<CloseSeasonResult> {
  const current = await getSeasonById(input.seasonId, db);
  if (!current) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }
  if (current.status !== 'open') {
    throw new AppError('Season is already closed', 'SEASON_ALREADY_CLOSED', 409);
  }

  const startDate = toYmd(current.start_date);
  const endDate = assertSeasonEndDate(input.endDate, startDate, input.today ?? todayYmd());
  await assertNoOverlap(current.site_id, {
    startDate,
    plannedEndDate: toYmd(current.planned_end_date),
    endDate,
  }, db, current.id);

  const fields = await db.query(
    `SELECT f.id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid`,
    [current.site_id],
  );
  const fieldIds = fields.rows.map((row) => String(row.id));

  let ofpRowsUprooted = 0;
  let prRowsUprooted = 0;
  let fieldsCleared = 0;

  for (const fieldId of fieldIds) {
    const ofp = await uprootPlanting(
      {
        table: 'open_field_planting',
        fieldId,
        segments: 'ALL',
        uprootDate: endDate,
        reason: SEASON_CLOSED_REASON,
        userId: input.userId,
        organizationId: input.organizationId,
        allActive: true,
      },
      db,
    );
    const pr = await uprootPlanting(
      {
        table: 'planting_records',
        fieldId,
        segments: 'ALL',
        uprootDate: endDate,
        reason: SEASON_CLOSED_REASON,
        userId: input.userId,
        organizationId: input.organizationId,
        allActive: true,
      },
      db,
    );
    ofpRowsUprooted += ofp.rowsUprooted + ofp.rowsSplit;
    prRowsUprooted += pr.rowsUprooted + pr.rowsSplit;
    if (pr.fieldCleared) fieldsCleared += 1;
  }

  let cropHistoryClosed = 0;
  if (fieldIds.length > 0) {
    const closedHistory = await db.query(
      `UPDATE crop_history SET end_date = $1::date
        WHERE field_id = ANY($2::uuid[]) AND end_date IS NULL
        RETURNING id`,
      [endDate, fieldIds],
    );
    cropHistoryClosed = closedHistory.rowCount ?? closedHistory.rows.length;
    for (const fieldId of fieldIds) {
      await syncFieldCrop(fieldId, db);
    }
  }

  const closedRes = await db.query(
    `UPDATE seasons
        SET status = 'closed',
            end_date = $2::date,
            closed_at = NOW(),
            closed_by = $3::uuid,
            updated_at = NOW()
      WHERE id = $1::uuid AND status = 'open'
      RETURNING *`,
    [input.seasonId, endDate, input.userId],
  );
  const closed = closedRes.rows[0] as SeasonRow | undefined;
  if (!closed) {
    throw new AppError('Season is already closed', 'SEASON_ALREADY_CLOSED', 409);
  }

  return {
    closed,
    ofpRowsUprooted,
    prRowsUprooted,
    fieldsCleared,
    cropHistoryClosed,
  };
}

export type ReopenRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SeasonReopenRequestRow {
  id: string;
  organization_id: string | null;
  season_id: string;
  reason: string;
  requested_by: string;
  status: ReopenRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  reviewer_comment: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  season_name?: string;
  site_id?: string;
  site_name?: string;
  requested_by_name?: string;
  requested_by_email?: string;
  reviewed_by_name?: string;
}

export interface ReopenSeasonResult {
  season: SeasonRow;
  discardedNextSeasonId: string | null;
  plantingsRestored: number;
  cropHistoryReopened: number;
}

async function siteFieldIds(siteId: string, db: SeasonsDb): Promise<string[]> {
  const fields = await db.query(
    `SELECT f.id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid`,
    [siteId],
  );
  return fields.rows.map((row) => String(row.id));
}

/**
 * Undo End season: reactivate only Season closed uproots, restore their
 * rotations, and mark this season open. Does not delete another Open year.
 */
export async function reopenSeason(
  input: { seasonId: string; userId: string },
  db: SeasonsDb = dbPool,
): Promise<ReopenSeasonResult> {
  const current = await getSeasonById(input.seasonId, db);
  if (!current) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }
  if (current.status === 'open') {
    throw new AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
  }
  if (current.status !== 'closed' && current.status !== 'reopen_pending') {
    throw new AppError('Season cannot be reopened', 'VALIDATION_ERROR', 400);
  }

  const successor = await getOpenSeason(current.site_id, db);
  if (successor && successor.id !== current.id) {
    throw new AppError(
      `${successor.name} is already open. End that year before reopening this one.`,
      'SEASON_SUCCESSOR_IN_USE',
      409,
      { successorSeasonId: successor.id, successorName: successor.name },
    );
  }

  const ofp = await db.query(
    `UPDATE open_field_planting
        SET status = 'active',
            uprooted_at = NULL,
            uprooted_by = NULL,
            uproot_reason = NULL,
            updated_at = NOW()
      WHERE season_id = $1::uuid
        AND status = 'uprooted'
        AND uproot_reason = $2
        AND migrated_to_planting_record_id IS NULL`,
    [input.seasonId, SEASON_CLOSED_REASON],
  );
  const pr = await db.query(
    `UPDATE planting_records
        SET status = 'active',
            uprooted_at = NULL,
            uprooted_by = NULL,
            uproot_reason = NULL,
            updated_at = NOW()
      WHERE season_id = $1::uuid
        AND status = 'uprooted'
        AND uproot_reason = $2`,
    [input.seasonId, SEASON_CLOSED_REASON],
  );
  const plantingsRestored = (ofp.rowCount ?? ofp.rows.length) + (pr.rowCount ?? pr.rows.length);

  const history = await db.query(
    `UPDATE crop_history
        SET end_date = NULL
      WHERE id IN (
        SELECT crop_history_id FROM planting_records
         WHERE season_id = $1::uuid AND status = 'active' AND crop_history_id IS NOT NULL
        UNION
        SELECT crop_history_id FROM open_field_planting
         WHERE season_id = $1::uuid
           AND status = 'active'
           AND crop_history_id IS NOT NULL
           AND migrated_to_planting_record_id IS NULL
      )
        AND end_date IS NOT NULL`,
    [input.seasonId],
  );
  const cropHistoryReopened = history.rowCount ?? history.rows.length;

  for (const fieldId of await siteFieldIds(current.site_id, db)) {
    await syncFieldCrop(fieldId, db);
  }

  const opened = await db.query(
    `UPDATE seasons
        SET status = 'open',
            reopened_at = NOW(),
            reopened_by = $2::uuid,
            updated_at = NOW()
      WHERE id = $1::uuid
        AND status IN ('closed', 'reopen_pending')
      RETURNING *`,
    [input.seasonId, input.userId],
  );
  const season = opened.rows[0] as SeasonRow | undefined;
  if (!season) {
    throw new AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
  }

  return {
    season,
    discardedNextSeasonId: null,
    plantingsRestored,
    cropHistoryReopened,
  };
}

async function unlockHistoricalSeason(
  input: { seasonId: string; userId: string },
  db: SeasonsDb,
): Promise<SeasonRow> {
  const unlocked = await db.query(
    `UPDATE seasons
        SET status = 'closed',
            reopened_at = NOW(),
            reopened_by = $2::uuid,
            updated_at = NOW()
      WHERE id = $1::uuid
        AND status = 'reopen_pending'
        AND closed_by IS NULL
      RETURNING *`,
    [input.seasonId, input.userId],
  );
  const season = unlocked.rows[0] as SeasonRow | undefined;
  if (!season) {
    throw new AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
  }
  return season;
}

export async function requestSeasonReopen(
  input: {
    seasonId: string;
    reason: string;
    userId: string;
    organizationId: string | null;
  },
  db: SeasonsDb = dbPool,
): Promise<SeasonReopenRequestRow> {
  const season = await getSeasonById(input.seasonId, db);
  if (!season) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }
  if (season.status === 'open') {
    throw new AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
  }
  if (season.status === 'reopen_pending') {
    throw new AppError('A reopen request is already waiting for an auditor', 'REOPEN_ALREADY_PENDING', 409);
  }
  if (season.status !== 'closed') {
    const _exhaustive: never = season.status;
    throw new AppError(`Season cannot be reopened (${_exhaustive})`, 'VALIDATION_ERROR', 400);
  }
  if (input.organizationId && season.organization_id && season.organization_id !== input.organizationId) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }

  const reason = input.reason.trim();
  if (!reason) {
    throw new AppError('A reason is required', 'VALIDATION_ERROR', 400);
  }

  let inserted;
  try {
    inserted = await db.query(
      `INSERT INTO season_reopen_requests
         (organization_id, season_id, reason, requested_by, status)
       VALUES ($1, $2::uuid, $3, $4::uuid, 'pending')
       RETURNING *`,
      [input.organizationId ?? season.organization_id, input.seasonId, reason, input.userId],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new AppError('A reopen request is already waiting for an auditor', 'REOPEN_ALREADY_PENDING', 409);
    }
    throw err;
  }
  await db.query(
    `UPDATE seasons SET status = 'reopen_pending', updated_at = NOW() WHERE id = $1::uuid`,
    [input.seasonId],
  );
  return inserted.rows[0] as SeasonReopenRequestRow;
}

export async function listSeasonReopenRequests(
  input: { organizationId: string; status?: ReopenRequestStatus | '' },
  db: SeasonsDb = dbPool,
): Promise<SeasonReopenRequestRow[]> {
  const params: unknown[] = [input.organizationId];
  let statusClause = '';
  if (input.status) {
    params.push(input.status);
    statusClause = ` AND r.status = $${params.length}`;
  }
  const res = await db.query(
    `SELECT r.*,
            s.name AS season_name, s.site_id,
            sites.name AS site_name,
            ru.name AS requested_by_name, ru.email AS requested_by_email,
            rv.name AS reviewed_by_name
       FROM season_reopen_requests r
       JOIN seasons s ON s.id = r.season_id
       JOIN sites ON sites.id = s.site_id
       LEFT JOIN users ru ON ru.id = r.requested_by
       LEFT JOIN users rv ON rv.id = r.reviewed_by
      WHERE COALESCE(r.organization_id, s.organization_id) = $1
        ${statusClause}
      ORDER BY r.created_at DESC`,
    params,
  );
  return res.rows as SeasonReopenRequestRow[];
}

export async function countPendingSeasonReopenRequests(
  organizationId: string,
  db: SeasonsDb = dbPool,
): Promise<number> {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM season_reopen_requests
      WHERE status = 'pending'
        AND organization_id = $1`,
    [organizationId],
  );
  return Number(res.rows[0]?.n) || 0;
}

export async function reviewSeasonReopen(
  input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    userId: string;
    organizationId?: string | null;
    comment?: string | null;
  },
  db: SeasonsDb = dbPool,
): Promise<{ request: SeasonReopenRequestRow; reopen?: ReopenSeasonResult }> {
  const locked = await db.query(
    `SELECT * FROM season_reopen_requests WHERE id = $1::uuid FOR UPDATE`,
    [input.requestId],
  );
  const row = locked.rows[0] as SeasonReopenRequestRow | undefined;
  if (!row) {
    throw new AppError('Reopen request not found', 'NOT_FOUND', 404);
  }
  if (row.status !== 'pending') {
    throw new AppError('Reopen request is no longer pending', 'CONFLICT', 409);
  }
  if (input.organizationId && row.organization_id && row.organization_id !== input.organizationId) {
    throw new AppError('Reopen request not found', 'NOT_FOUND', 404);
  }

  let reopen: ReopenSeasonResult | undefined;
  switch (input.decision) {
    case 'approved': {
      const season = await getSeasonById(row.season_id, db);
      if (!season) {
        throw new AppError('Season not found', 'NOT_FOUND', 404);
      }
      if (season.closed_by) {
        reopen = await reopenSeason({ seasonId: row.season_id, userId: input.userId }, db);
      } else {
        await unlockHistoricalSeason({ seasonId: row.season_id, userId: input.userId }, db);
      }
      break;
    }
    case 'rejected':
      await db.query(
        `UPDATE seasons
            SET status = 'closed', updated_at = NOW()
          WHERE id = $1::uuid AND status = 'reopen_pending'`,
        [row.season_id],
      );
      break;
    default: {
      const _exhaustive: never = input.decision;
      throw new AppError(`Unsupported reopen decision (${_exhaustive})`, 'VALIDATION_ERROR', 400);
    }
  }

  const updated = await db.query(
    `UPDATE season_reopen_requests
        SET status = $2,
            reviewed_by = $3::uuid,
            reviewed_at = NOW(),
            reviewer_comment = $4,
            updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *`,
    [input.requestId, input.decision, input.userId, input.comment?.trim() || null],
  );

  return {
    request: updated.rows[0] as SeasonReopenRequestRow,
    reopen,
  };
}

export interface DeleteSeasonResult {
  season: SeasonRow;
  deleted: {
    plantings: number;
    openField: number;
    cropHistory: number;
    workbookUnlinked: number;
  };
}

function uniqueFieldIds(rows: Array<{ field_id?: string | null }>): string[] {
  return [...new Set(rows.map((row) => row.field_id).filter((id): id is string => Boolean(id)))];
}

/**
 * Wipe a historical year (closed, no closer). Open / ended / reopen_pending stay.
 * Order matters: OF archive FKs and crop_history FKs have no ON DELETE.
 */
export async function deleteSeason(
  input: { seasonId: string; organizationId?: string | null },
  db: SeasonsDb = dbPool,
): Promise<DeleteSeasonResult> {
  const season = await getSeasonById(input.seasonId, db);
  if (!season) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }
  if (input.organizationId && season.organization_id && season.organization_id !== input.organizationId) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }

  switch (season.status) {
    case 'open':
      throw new AppError('End the open season instead of deleting it', 'SEASON_OPEN', 409);
    case 'reopen_pending':
      throw new AppError(
        'This season is waiting for an auditor. It cannot be deleted.',
        'SEASON_ENDED',
        409,
      );
    case 'closed':
      break;
    default: {
      const _exhaustive: never = season.status;
      throw new AppError(`Season cannot be deleted (${_exhaustive})`, 'VALIDATION_ERROR', 400);
    }
  }

  if (season.closed_by) {
    throw new AppError(
      'Ended seasons cannot be deleted. Request a reopen instead.',
      'SEASON_ENDED',
      409,
    );
  }

  const plantings = await db.query(
    `SELECT id, field_id FROM planting_records WHERE season_id = $1::uuid`,
    [input.seasonId],
  );
  const ofp = await db.query(
    `SELECT id, field_id FROM open_field_planting WHERE season_id = $1::uuid`,
    [input.seasonId],
  );
  const history = await db.query(
    `SELECT id, field_id FROM crop_history WHERE season_id = $1::uuid`,
    [input.seasonId],
  );

  const plantingIds = plantings.rows.map((row: { id: string }) => row.id);
  const historyIds = history.rows.map((row: { id: string }) => row.id);
  const fieldIds = uniqueFieldIds([...plantings.rows, ...ofp.rows, ...history.rows]);

  if (plantingIds.length > 0) {
    await db.query(
      `UPDATE open_field_planting
          SET migrated_to_planting_record_id = NULL
        WHERE migrated_to_planting_record_id = ANY($1::uuid[])`,
      [plantingIds],
    );
  }

  let workbookUnlinked = 0;
  if (historyIds.length > 0) {
    await db.query(
      `UPDATE planting_records SET crop_history_id = NULL WHERE crop_history_id = ANY($1::uuid[])`,
      [historyIds],
    );
    await db.query(
      `UPDATE open_field_planting SET crop_history_id = NULL WHERE crop_history_id = ANY($1::uuid[])`,
      [historyIds],
    );
    const workbook = await db.query(
      `UPDATE plantation_opening_records
          SET crop_history_id = NULL
        WHERE crop_history_id = ANY($1::uuid[])`,
      [historyIds],
    );
    workbookUnlinked = workbook.rowCount ?? 0;
  }

  const ofpDel = await db.query(
    `DELETE FROM open_field_planting WHERE season_id = $1::uuid`,
    [input.seasonId],
  );
  const prDel = await db.query(
    `DELETE FROM planting_records WHERE season_id = $1::uuid`,
    [input.seasonId],
  );
  const chDel = await db.query(
    `DELETE FROM crop_history WHERE season_id = $1::uuid`,
    [input.seasonId],
  );
  await db.query(
    `DELETE FROM season_reopen_requests WHERE season_id = $1::uuid`,
    [input.seasonId],
  );
  const gone = await db.query(
    `DELETE FROM seasons WHERE id = $1::uuid RETURNING *`,
    [input.seasonId],
  );
  if ((gone.rowCount ?? gone.rows.length) === 0) {
    throw new AppError('Season not found', 'NOT_FOUND', 404);
  }

  for (const fieldId of fieldIds) {
    await syncFieldCrop(fieldId, db);
  }

  return {
    season,
    deleted: {
      plantings: prDel.rowCount ?? 0,
      openField: ofpDel.rowCount ?? 0,
      cropHistory: chDel.rowCount ?? 0,
      workbookUnlinked,
    },
  };
}
