"use strict";
/**
 * Seasons: a named date range per site (e.g. Sep 2025 – Jul 2026).
 *
 * Close stamps remaining plantings with reason "Season closed" so a later
 * reopen can undo only those, never a cycle uproot. End does not create the
 * next year. Historical years (closed, closed_by null) stay locked until an
 * auditor stamps reopened_at; they can still be deleted.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEASON_CLOSED_REASON = void 0;
exports.seasonRangesOverlap = seasonRangesOverlap;
exports.defaultSeasonWindow = defaultSeasonWindow;
exports.addDaysYmd = addDaysYmd;
exports.todayYmd = todayYmd;
exports.nextSeasonDraft = nextSeasonDraft;
exports.listSeasons = listSeasons;
exports.getSeasonById = getSeasonById;
exports.getOpenSeason = getOpenSeason;
exports.assertCanManageSeasons = assertCanManageSeasons;
exports.startOpenSeason = startOpenSeason;
exports.ensureOpenSeasonForSite = ensureOpenSeasonForSite;
exports.createSeason = createSeason;
exports.updateSeason = updateSeason;
exports.openSeasonForField = openSeasonForField;
exports.seasonIdForField = seasonIdForField;
exports.coveringSeasonForSite = coveringSeasonForSite;
exports.seasonForWritableField = seasonForWritableField;
exports.assertFieldDateWritable = assertFieldDateWritable;
exports.seasonIdForWritableField = seasonIdForWritableField;
exports.nextCycleNumber = nextCycleNumber;
exports.preparePlantingInsert = preparePlantingInsert;
exports.assertDateWritableForSite = assertDateWritableForSite;
exports.closeSeason = closeSeason;
exports.reopenSeason = reopenSeason;
exports.requestSeasonReopen = requestSeasonReopen;
exports.listSeasonReopenRequests = listSeasonReopenRequests;
exports.countPendingSeasonReopenRequests = countPendingSeasonReopenRequests;
exports.reviewSeasonReopen = reviewSeasonReopen;
exports.deleteSeason = deleteSeason;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const fieldCropSync_1 = require("../utils/fieldCropSync");
const plantingUproot_service_1 = require("./plantingUproot.service");
/** Inclusive calendar overlap using end_date, or planned_end_date while open. */
function seasonRangesOverlap(a, b) {
    const aEnd = a.endDate || a.plannedEndDate;
    const bEnd = b.endDate || b.plannedEndDate;
    return a.startDate <= bEnd && b.startDate <= aEnd;
}
/** Farm year: 1 Sep → 31 Jul. August onwards belongs to the new season. */
function defaultSeasonWindow(today = new Date()) {
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
exports.SEASON_CLOSED_REASON = 'Season closed';
function addDaysYmd(ymd, days) {
    const [year, month, day] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(year, month - 1, day + days));
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function todayYmd(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/** Next open season after a close: starts the following day, name increments. */
function nextSeasonDraft(closed, endDate) {
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
function toYmd(value) {
    if (value == null || value === '')
        return '';
    if (typeof value === 'string') {
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    }
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function asRange(row) {
    return {
        startDate: toYmd(row.start_date),
        plannedEndDate: toYmd(row.planned_end_date),
        endDate: toYmd(row.end_date) || null,
    };
}
async function assertNoOverlap(siteId, range, db, excludeId) {
    const existing = await listSeasons(siteId, db);
    for (const row of existing) {
        if (excludeId && row.id === excludeId)
            continue;
        if (seasonRangesOverlap(range, asRange(row))) {
            throw new errors_1.AppError(`Season dates overlap ${row.name} (${toYmd(row.start_date)} – ${toYmd(row.end_date) || toYmd(row.planned_end_date)})`, 'SEASON_OVERLAP', 409, { conflictingSeasonId: row.id, conflictingName: row.name });
        }
    }
}
async function listSeasons(siteId, db = client_1.dbPool) {
    const res = await db.query(`SELECT * FROM seasons WHERE site_id = $1::uuid ORDER BY start_date DESC, created_at DESC`, [siteId]);
    return res.rows;
}
async function getSeasonById(id, db = client_1.dbPool) {
    const res = await db.query(`SELECT * FROM seasons WHERE id = $1::uuid`, [id]);
    return res.rows[0] || null;
}
async function getOpenSeason(siteId, db = client_1.dbPool) {
    const res = await db.query(`SELECT * FROM seasons WHERE site_id = $1::uuid AND status = 'open' LIMIT 1`, [siteId]);
    return res.rows[0] || null;
}
/**
 * Farm Manager: any site in their org. Operation Manager: assigned site only.
 * Do not use canUserAccessSite — that 403s FM who have no assignment rows.
 */
async function assertCanManageSeasons(userId, role, siteId, orgId, db = client_1.dbPool) {
    switch (role) {
        case 'farm_manager': {
            const own = await db.query(`SELECT 1 FROM sites
          WHERE id = $1::uuid AND organization_id = $2::uuid AND deleted_at IS NULL`, [siteId, orgId]);
            if (own.rows.length === 0) {
                throw new errors_1.AppError('Site not found', 'NOT_FOUND', 404);
            }
            return;
        }
        case 'operation_manager': {
            const assigned = await db.query(`SELECT 1 FROM user_site_assignments
          WHERE user_id = $1::uuid AND site_id = $2::uuid
          LIMIT 1`, [userId, siteId]);
            if (assigned.rows.length === 0) {
                throw new errors_1.AppError('Only the Operation Manager assigned to this site can manage its seasons', 'FORBIDDEN', 403);
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
            throw new errors_1.AppError('Only the Farm Manager or the site Operation Manager can manage seasons', 'FORBIDDEN', 403);
        default: {
            const _exhaustive = role;
            throw new errors_1.AppError(`Unknown role ${String(_exhaustive)}`, 'FORBIDDEN', 403);
        }
    }
}
async function startOpenSeason(input, db = client_1.dbPool) {
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
async function ensureOpenSeasonForSite(siteId, _organizationId, db = client_1.dbPool) {
    const existing = await getOpenSeason(siteId, db);
    if (existing)
        return existing;
    throw new errors_1.AppError('No open season. Start a season to record new work.', 'SEASON_NONE_OPEN', 409);
}
function assertCreatableStatus(status) {
    switch (status) {
        case 'open':
        case 'closed':
            return;
        case 'reopen_pending':
            throw new errors_1.AppError('Cannot create a season as reopen_pending', 'VALIDATION_ERROR', 400);
        default: {
            const _exhaustive = status;
            throw new errors_1.AppError(`Unknown season status ${String(_exhaustive)}`, 'VALIDATION_ERROR', 400);
        }
    }
}
async function createSeason(input, db = client_1.dbPool) {
    const status = input.status ?? 'open';
    assertCreatableStatus(status);
    if (input.startDate > input.plannedEndDate) {
        throw new errors_1.AppError('start_date must be on or before planned_end_date', 'VALIDATION_ERROR', 400);
    }
    await assertNoOverlap(input.siteId, {
        startDate: input.startDate,
        plannedEndDate: input.plannedEndDate,
        endDate: status === 'closed' ? input.plannedEndDate : null,
    }, db);
    if (status === 'open') {
        const open = await getOpenSeason(input.siteId, db);
        if (open) {
            throw new errors_1.AppError(`Site already has an open season (${open.name})`, 'SEASON_ALREADY_OPEN', 409, { openSeasonId: open.id });
        }
    }
    // Historical years: end_date set, closed_at/closed_by left null so the write
    // guard can tell them apart from a year closed with End Season.
    const endDate = status === 'closed' ? input.plannedEndDate : null;
    const res = await db.query(`INSERT INTO seasons (organization_id, site_id, name, start_date, planned_end_date, status, end_date)
     VALUES ($1, $2::uuid, $3, $4::date, $5::date, $6, $7::date)
     RETURNING *`, [
        input.organizationId,
        input.siteId,
        input.name.trim(),
        input.startDate,
        input.plannedEndDate,
        status,
        endDate,
    ]);
    return res.rows[0];
}
async function updateSeason(id, patch, db = client_1.dbPool) {
    const current = await getSeasonById(id, db);
    if (!current) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    const next = {
        startDate: patch.startDate ?? toYmd(current.start_date),
        plannedEndDate: patch.plannedEndDate ?? toYmd(current.planned_end_date),
        endDate: toYmd(current.end_date) || null,
    };
    if (next.startDate > next.plannedEndDate) {
        throw new errors_1.AppError('start_date must be on or before planned_end_date', 'VALIDATION_ERROR', 400);
    }
    await assertNoOverlap(current.site_id, next, db, id);
    const res = await db.query(`UPDATE seasons
        SET name = COALESCE($2, name),
            start_date = COALESCE($3::date, start_date),
            planned_end_date = COALESCE($4::date, planned_end_date),
            updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *`, [id, patch.name?.trim() ?? null, patch.startDate ?? null, patch.plannedEndDate ?? null]);
    return res.rows[0];
}
async function siteForField(fieldId, db) {
    const res = await db.query(`SELECT s.id AS site_id, s.organization_id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       JOIN sites s ON s.id = fa.site_id
      WHERE f.id = $1::uuid`, [fieldId]);
    const row = res.rows[0];
    if (!row)
        return null;
    return { siteId: row.site_id, organizationId: row.organization_id };
}
async function openSeasonForField(fieldId, db = client_1.dbPool) {
    const site = await siteForField(fieldId, db);
    if (!site)
        return null;
    return ensureOpenSeasonForSite(site.siteId, site.organizationId, db);
}
async function seasonIdForField(fieldId, db = client_1.dbPool) {
    const season = await openSeasonForField(fieldId, db);
    return season?.id ?? null;
}
async function coveringSeasonForSite(siteId, onDate, db = client_1.dbPool) {
    const res = await db.query(`SELECT * FROM seasons
      WHERE site_id = $1::uuid
        AND start_date <= $2::date
        AND COALESCE(end_date, planned_end_date) >= $2::date
      ORDER BY start_date DESC, id DESC
      LIMIT 1`, [siteId, onDate]);
    return res.rows[0] || null;
}
async function seasonForWritableField(fieldId, onDate, db = client_1.dbPool) {
    const site = await siteForField(fieldId, db);
    if (!site)
        return null;
    await assertDateWritableForSite(site.siteId, onDate, db);
    const covering = await coveringSeasonForSite(site.siteId, onDate, db);
    if (covering)
        return covering;
    return ensureOpenSeasonForSite(site.siteId, site.organizationId, db);
}
/** Refuse harvest / EC / IPM writes into a locked covering year, or when none is open. */
async function assertFieldDateWritable(fieldId, onDate, db = client_1.dbPool) {
    if (!fieldId || onDate == null || onDate === '')
        return;
    const ymd = toYmd(onDate);
    if (!ymd)
        return;
    const site = await siteForField(fieldId, db);
    if (!site)
        return;
    await assertDateWritableForSite(site.siteId, ymd, db);
    const covering = await coveringSeasonForSite(site.siteId, ymd, db);
    if (covering)
        return;
    const open = await getOpenSeason(site.siteId, db);
    if (open)
        return;
    throw new errors_1.AppError('No open season. Start a season to record new work.', 'SEASON_NONE_OPEN', 409);
}
async function seasonIdForWritableField(fieldId, onDate, db = client_1.dbPool) {
    const season = await seasonForWritableField(fieldId, onDate, db);
    return season?.id ?? null;
}
async function nextCycleNumber(_table, fieldId, segment, cropId, seasonId, db = client_1.dbPool) {
    const res = await db.query(`SELECT COALESCE(MAX(cycle_number), 0) + 1 AS n
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
       ) cycles`, [fieldId, seasonId, cropId ?? null, segment ?? '']);
    return Number(res.rows[0]?.n) || 1;
}
/**
 * Stamp a new planting with the season covering the occupancy date (historical
 * or open) and the next cycle number, and refuse if those segments are still
 * growing in that season.
 */
async function preparePlantingInsert(table, input, db = client_1.dbPool) {
    if (!input.fieldId) {
        return { seasonId: null, cycleNumber: 1 };
    }
    const season = await seasonForWritableField(input.fieldId, input.occupancyDate, db);
    if (!season) {
        throw new errors_1.AppError('No open season. Start a season to record new work.', 'SEASON_NONE_OPEN', 409);
    }
    const seasonId = season.id;
    await (0, plantingUproot_service_1.assertSeedingNotOccupied)(table, input.fieldId, input.segment, input.occupancyDate, seasonId, db);
    const cycleNumber = await nextCycleNumber(table, input.fieldId, input.segment, input.cropId, seasonId, db);
    return { seasonId, cycleNumber };
}
async function assertDateWritableForSite(siteId, onDate, db = client_1.dbPool) {
    const res = await db.query(`SELECT name FROM seasons
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
      LIMIT 1`, [siteId, onDate]);
    const name = res.rows[0]?.name;
    if (!name)
        return;
    throw new errors_1.AppError(`${name} is closed. Request a reopen or start a new season to record new work.`, 'SEASON_CLOSED', 403, { seasonName: name });
}
/**
 * End a site year: uproot whatever is still growing (reason Season closed),
 * close open rotations, stamp the season closed. Does not create the next year.
 * Nothing is deleted. Caller owns BEGIN/COMMIT.
 */
async function closeSeason(input, db = client_1.dbPool) {
    const current = await getSeasonById(input.seasonId, db);
    if (!current) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    if (current.status !== 'open') {
        throw new errors_1.AppError('Season is already closed', 'SEASON_ALREADY_CLOSED', 409);
    }
    const fields = await db.query(`SELECT f.id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid`, [current.site_id]);
    const fieldIds = fields.rows.map((row) => String(row.id));
    let ofpRowsUprooted = 0;
    let prRowsUprooted = 0;
    let fieldsCleared = 0;
    for (const fieldId of fieldIds) {
        const ofp = await (0, plantingUproot_service_1.uprootPlanting)({
            table: 'open_field_planting',
            fieldId,
            segments: 'ALL',
            uprootDate: input.endDate,
            reason: exports.SEASON_CLOSED_REASON,
            userId: input.userId,
            organizationId: input.organizationId,
            allActive: true,
        }, db);
        const pr = await (0, plantingUproot_service_1.uprootPlanting)({
            table: 'planting_records',
            fieldId,
            segments: 'ALL',
            uprootDate: input.endDate,
            reason: exports.SEASON_CLOSED_REASON,
            userId: input.userId,
            organizationId: input.organizationId,
            allActive: true,
        }, db);
        ofpRowsUprooted += ofp.rowsUprooted + ofp.rowsSplit;
        prRowsUprooted += pr.rowsUprooted + pr.rowsSplit;
        if (pr.fieldCleared)
            fieldsCleared += 1;
    }
    let cropHistoryClosed = 0;
    if (fieldIds.length > 0) {
        const closedHistory = await db.query(`UPDATE crop_history SET end_date = $1::date
        WHERE field_id = ANY($2::uuid[]) AND end_date IS NULL
        RETURNING id`, [input.endDate, fieldIds]);
        cropHistoryClosed = closedHistory.rowCount ?? closedHistory.rows.length;
        for (const fieldId of fieldIds) {
            await (0, fieldCropSync_1.syncFieldCrop)(fieldId, db);
        }
    }
    const closedRes = await db.query(`UPDATE seasons
        SET status = 'closed',
            end_date = $2::date,
            closed_at = NOW(),
            closed_by = $3::uuid,
            updated_at = NOW()
      WHERE id = $1::uuid AND status = 'open'
      RETURNING *`, [input.seasonId, input.endDate, input.userId]);
    const closed = closedRes.rows[0];
    if (!closed) {
        throw new errors_1.AppError('Season is already closed', 'SEASON_ALREADY_CLOSED', 409);
    }
    return {
        closed,
        ofpRowsUprooted,
        prRowsUprooted,
        fieldsCleared,
        cropHistoryClosed,
    };
}
async function siteFieldIds(siteId, db) {
    const fields = await db.query(`SELECT f.id
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid`, [siteId]);
    return fields.rows.map((row) => String(row.id));
}
/**
 * Undo End season: reactivate only Season closed uproots, restore their
 * rotations, and mark this season open. Does not delete another Open year.
 */
async function reopenSeason(input, db = client_1.dbPool) {
    const current = await getSeasonById(input.seasonId, db);
    if (!current) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    if (current.status === 'open') {
        throw new errors_1.AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
    }
    if (current.status !== 'closed' && current.status !== 'reopen_pending') {
        throw new errors_1.AppError('Season cannot be reopened', 'VALIDATION_ERROR', 400);
    }
    const successor = await getOpenSeason(current.site_id, db);
    if (successor && successor.id !== current.id) {
        throw new errors_1.AppError(`${successor.name} is already open. End that year before reopening this one.`, 'SEASON_SUCCESSOR_IN_USE', 409, { successorSeasonId: successor.id, successorName: successor.name });
    }
    const ofp = await db.query(`UPDATE open_field_planting
        SET status = 'active',
            uprooted_at = NULL,
            uprooted_by = NULL,
            uproot_reason = NULL,
            updated_at = NOW()
      WHERE season_id = $1::uuid
        AND status = 'uprooted'
        AND uproot_reason = $2
        AND migrated_to_planting_record_id IS NULL`, [input.seasonId, exports.SEASON_CLOSED_REASON]);
    const pr = await db.query(`UPDATE planting_records
        SET status = 'active',
            uprooted_at = NULL,
            uprooted_by = NULL,
            uproot_reason = NULL,
            updated_at = NOW()
      WHERE season_id = $1::uuid
        AND status = 'uprooted'
        AND uproot_reason = $2`, [input.seasonId, exports.SEASON_CLOSED_REASON]);
    const plantingsRestored = (ofp.rowCount ?? ofp.rows.length) + (pr.rowCount ?? pr.rows.length);
    const history = await db.query(`UPDATE crop_history
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
        AND end_date IS NOT NULL`, [input.seasonId]);
    const cropHistoryReopened = history.rowCount ?? history.rows.length;
    for (const fieldId of await siteFieldIds(current.site_id, db)) {
        await (0, fieldCropSync_1.syncFieldCrop)(fieldId, db);
    }
    const opened = await db.query(`UPDATE seasons
        SET status = 'open',
            reopened_at = NOW(),
            reopened_by = $2::uuid,
            updated_at = NOW()
      WHERE id = $1::uuid
        AND status IN ('closed', 'reopen_pending')
      RETURNING *`, [input.seasonId, input.userId]);
    const season = opened.rows[0];
    if (!season) {
        throw new errors_1.AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
    }
    return {
        season,
        discardedNextSeasonId: null,
        plantingsRestored,
        cropHistoryReopened,
    };
}
async function unlockHistoricalSeason(input, db) {
    const unlocked = await db.query(`UPDATE seasons
        SET status = 'closed',
            reopened_at = NOW(),
            reopened_by = $2::uuid,
            updated_at = NOW()
      WHERE id = $1::uuid
        AND status = 'reopen_pending'
        AND closed_by IS NULL
      RETURNING *`, [input.seasonId, input.userId]);
    const season = unlocked.rows[0];
    if (!season) {
        throw new errors_1.AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
    }
    return season;
}
async function requestSeasonReopen(input, db = client_1.dbPool) {
    const season = await getSeasonById(input.seasonId, db);
    if (!season) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    if (season.status === 'open') {
        throw new errors_1.AppError('Season is already open', 'SEASON_ALREADY_OPEN', 409);
    }
    if (season.status === 'reopen_pending') {
        throw new errors_1.AppError('A reopen request is already waiting for an auditor', 'REOPEN_ALREADY_PENDING', 409);
    }
    if (season.status !== 'closed') {
        const _exhaustive = season.status;
        throw new errors_1.AppError(`Season cannot be reopened (${_exhaustive})`, 'VALIDATION_ERROR', 400);
    }
    if (input.organizationId && season.organization_id && season.organization_id !== input.organizationId) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    const reason = input.reason.trim();
    if (!reason) {
        throw new errors_1.AppError('A reason is required', 'VALIDATION_ERROR', 400);
    }
    let inserted;
    try {
        inserted = await db.query(`INSERT INTO season_reopen_requests
         (organization_id, season_id, reason, requested_by, status)
       VALUES ($1, $2::uuid, $3, $4::uuid, 'pending')
       RETURNING *`, [input.organizationId ?? season.organization_id, input.seasonId, reason, input.userId]);
    }
    catch (err) {
        if (err.code === '23505') {
            throw new errors_1.AppError('A reopen request is already waiting for an auditor', 'REOPEN_ALREADY_PENDING', 409);
        }
        throw err;
    }
    await db.query(`UPDATE seasons SET status = 'reopen_pending', updated_at = NOW() WHERE id = $1::uuid`, [input.seasonId]);
    return inserted.rows[0];
}
async function listSeasonReopenRequests(input, db = client_1.dbPool) {
    const params = [input.organizationId];
    let statusClause = '';
    if (input.status) {
        params.push(input.status);
        statusClause = ` AND r.status = $${params.length}`;
    }
    const res = await db.query(`SELECT r.*,
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
      ORDER BY r.created_at DESC`, params);
    return res.rows;
}
async function countPendingSeasonReopenRequests(organizationId, db = client_1.dbPool) {
    const res = await db.query(`SELECT COUNT(*)::int AS n
       FROM season_reopen_requests
      WHERE status = 'pending'
        AND organization_id = $1`, [organizationId]);
    return Number(res.rows[0]?.n) || 0;
}
async function reviewSeasonReopen(input, db = client_1.dbPool) {
    const locked = await db.query(`SELECT * FROM season_reopen_requests WHERE id = $1::uuid FOR UPDATE`, [input.requestId]);
    const row = locked.rows[0];
    if (!row) {
        throw new errors_1.AppError('Reopen request not found', 'NOT_FOUND', 404);
    }
    if (row.status !== 'pending') {
        throw new errors_1.AppError('Reopen request is no longer pending', 'CONFLICT', 409);
    }
    if (input.organizationId && row.organization_id && row.organization_id !== input.organizationId) {
        throw new errors_1.AppError('Reopen request not found', 'NOT_FOUND', 404);
    }
    let reopen;
    switch (input.decision) {
        case 'approved': {
            const season = await getSeasonById(row.season_id, db);
            if (!season) {
                throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
            }
            if (season.closed_by) {
                reopen = await reopenSeason({ seasonId: row.season_id, userId: input.userId }, db);
            }
            else {
                await unlockHistoricalSeason({ seasonId: row.season_id, userId: input.userId }, db);
            }
            break;
        }
        case 'rejected':
            await db.query(`UPDATE seasons
            SET status = 'closed', updated_at = NOW()
          WHERE id = $1::uuid AND status = 'reopen_pending'`, [row.season_id]);
            break;
        default: {
            const _exhaustive = input.decision;
            throw new errors_1.AppError(`Unsupported reopen decision (${_exhaustive})`, 'VALIDATION_ERROR', 400);
        }
    }
    const updated = await db.query(`UPDATE season_reopen_requests
        SET status = $2,
            reviewed_by = $3::uuid,
            reviewed_at = NOW(),
            reviewer_comment = $4,
            updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *`, [input.requestId, input.decision, input.userId, input.comment?.trim() || null]);
    return {
        request: updated.rows[0],
        reopen,
    };
}
function uniqueFieldIds(rows) {
    return [...new Set(rows.map((row) => row.field_id).filter((id) => Boolean(id)))];
}
/**
 * Wipe a historical year (closed, no closer). Open / ended / reopen_pending stay.
 * Order matters: OF archive FKs and crop_history FKs have no ON DELETE.
 */
async function deleteSeason(input, db = client_1.dbPool) {
    const season = await getSeasonById(input.seasonId, db);
    if (!season) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    if (input.organizationId && season.organization_id && season.organization_id !== input.organizationId) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    switch (season.status) {
        case 'open':
            throw new errors_1.AppError('End the open season instead of deleting it', 'SEASON_OPEN', 409);
        case 'reopen_pending':
            throw new errors_1.AppError('This season is waiting for an auditor. It cannot be deleted.', 'SEASON_ENDED', 409);
        case 'closed':
            break;
        default: {
            const _exhaustive = season.status;
            throw new errors_1.AppError(`Season cannot be deleted (${_exhaustive})`, 'VALIDATION_ERROR', 400);
        }
    }
    if (season.closed_by) {
        throw new errors_1.AppError('Ended seasons cannot be deleted. Request a reopen instead.', 'SEASON_ENDED', 409);
    }
    const plantings = await db.query(`SELECT id, field_id FROM planting_records WHERE season_id = $1::uuid`, [input.seasonId]);
    const ofp = await db.query(`SELECT id, field_id FROM open_field_planting WHERE season_id = $1::uuid`, [input.seasonId]);
    const history = await db.query(`SELECT id, field_id FROM crop_history WHERE season_id = $1::uuid`, [input.seasonId]);
    const plantingIds = plantings.rows.map((row) => row.id);
    const historyIds = history.rows.map((row) => row.id);
    const fieldIds = uniqueFieldIds([...plantings.rows, ...ofp.rows, ...history.rows]);
    if (plantingIds.length > 0) {
        await db.query(`UPDATE open_field_planting
          SET migrated_to_planting_record_id = NULL
        WHERE migrated_to_planting_record_id = ANY($1::uuid[])`, [plantingIds]);
    }
    let workbookUnlinked = 0;
    if (historyIds.length > 0) {
        await db.query(`UPDATE planting_records SET crop_history_id = NULL WHERE crop_history_id = ANY($1::uuid[])`, [historyIds]);
        await db.query(`UPDATE open_field_planting SET crop_history_id = NULL WHERE crop_history_id = ANY($1::uuid[])`, [historyIds]);
        const workbook = await db.query(`UPDATE plantation_opening_records
          SET crop_history_id = NULL
        WHERE crop_history_id = ANY($1::uuid[])`, [historyIds]);
        workbookUnlinked = workbook.rowCount ?? 0;
    }
    const ofpDel = await db.query(`DELETE FROM open_field_planting WHERE season_id = $1::uuid`, [input.seasonId]);
    const prDel = await db.query(`DELETE FROM planting_records WHERE season_id = $1::uuid`, [input.seasonId]);
    const chDel = await db.query(`DELETE FROM crop_history WHERE season_id = $1::uuid`, [input.seasonId]);
    await db.query(`DELETE FROM season_reopen_requests WHERE season_id = $1::uuid`, [input.seasonId]);
    const gone = await db.query(`DELETE FROM seasons WHERE id = $1::uuid RETURNING *`, [input.seasonId]);
    if ((gone.rowCount ?? gone.rows.length) === 0) {
        throw new errors_1.AppError('Season not found', 'NOT_FOUND', 404);
    }
    for (const fieldId of fieldIds) {
        await (0, fieldCropSync_1.syncFieldCrop)(fieldId, db);
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
