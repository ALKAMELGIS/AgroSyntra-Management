import { dbPool } from '../db/client';
import { SEASON_CLOSED_REASON, getOpenSeason, type SeasonsDb } from './seasons.service';
import { fieldSegmentUniverseBySite, type UprootDb } from './plantingUproot.service';
import {
  classifyFieldAvailability,
  inSeasonWindow,
  occupancyTokensFromSegment,
  toYmd,
} from '../utils/cropHistoryAvailability';

function seasonWindow(season: { start_date: string | Date; end_date: string | Date | null; planned_end_date: string | Date } | null): {
  start: string;
  end: string;
} | null {
  if (!season) return null;
  const start = toYmd(season.start_date);
  const end = toYmd(season.end_date) || toYmd(season.planned_end_date);
  if (!start || !end) return null;
  return { start, end };
}

export async function listCropHistoryAvailability(siteId: string, db: SeasonsDb & UprootDb = dbPool) {
  const season = await getOpenSeason(siteId, db);
  const window = seasonWindow(season);

  const fieldsRes = await db.query(
    `SELECT f.id, f.name, fa.name AS farm_area_name
       FROM fields f
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid
      ORDER BY f.name ASC`,
    [siteId],
  );

  const occupancyRes = await db.query(
    `SELECT p.field_id, p.segment
       FROM planting_records p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid AND p.status = 'active'
     UNION ALL
     SELECT p.field_id, p.segment
       FROM open_field_planting p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid
        AND p.status = 'active'
        AND p.migrated_to_planting_record_id IS NULL`,
    [siteId],
  );

  const occupiedByField = new Map<string, string[]>();
  for (const row of occupancyRes.rows) {
    const fieldId = String(row.field_id);
    const next = occupiedByField.get(fieldId) || [];
    next.push(...occupancyTokensFromSegment(row.segment as string));
    occupiedByField.set(fieldId, next);
  }

  const plantingDatesRes = await db.query(
    `SELECT p.field_id, COALESCE(p.transplant_date, p.seeding_date) AS occupancy_start
       FROM planting_records p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid
     UNION ALL
     SELECT p.field_id, p.seeding_date AS occupancy_start
       FROM open_field_planting p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
      WHERE fa.site_id = $1::uuid
        AND p.migrated_to_planting_record_id IS NULL`,
    [siteId],
  );

  const plantedInWindow = new Set<string>();
  for (const row of plantingDatesRes.rows) {
    if (!window || inSeasonWindow(row.occupancy_start, window.start, window.end)) {
      plantedInWindow.add(String(row.field_id));
    }
  }

  const uprootRes = await db.query(
    `SELECT p.field_id, p.uprooted_at, p.uproot_reason, p.segment,
            c.name AS crop_name, cv.name AS variety_name
       FROM planting_records p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN crops c ON c.id = p.crop_id
       LEFT JOIN crop_varieties cv ON cv.id = p.variety_id
      WHERE fa.site_id = $1::uuid AND p.uprooted_at IS NOT NULL
     UNION ALL
     SELECT p.field_id, p.uprooted_at, p.uproot_reason, p.segment,
            c.name AS crop_name, cv.name AS variety_name
       FROM open_field_planting p
       JOIN fields f ON f.id = p.field_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN crops c ON c.id = p.crop_id
       LEFT JOIN crop_varieties cv ON cv.id = p.variety_id
      WHERE fa.site_id = $1::uuid
        AND p.uprooted_at IS NOT NULL
        AND p.migrated_to_planting_record_id IS NULL`,
    [siteId],
  );

  type UprootAgg = {
    at: string;
    reason: string | null;
    tokens: string[];
    cropName: string | null;
    varietyName: string | null;
    seasonClose: boolean;
  };
  const uprootByField = new Map<string, UprootAgg>();
  for (const row of uprootRes.rows) {
    const at = toYmd(row.uprooted_at);
    if (!at) continue;
    if (window && !inSeasonWindow(at, window.start, window.end)) continue;
    const fieldId = String(row.field_id);
    const seasonClose = row.uproot_reason === SEASON_CLOSED_REASON;
    const current = uprootByField.get(fieldId);
    const tokens = occupancyTokensFromSegment(row.segment as string);
    if (!current) {
      uprootByField.set(fieldId, {
        at,
        reason: row.uproot_reason || null,
        tokens: [...tokens],
        cropName: row.crop_name || null,
        varietyName: row.variety_name || null,
        seasonClose,
      });
      continue;
    }
    current.tokens.push(...tokens);
    const betterUser = current.seasonClose && !seasonClose;
    const newerSameClass = current.seasonClose === seasonClose && at > current.at;
    if (betterUser || newerSameClass) {
      current.at = at;
      current.reason = row.uproot_reason || null;
      current.cropName = row.crop_name || null;
      current.varietyName = row.variety_name || null;
      current.seasonClose = seasonClose;
    }
  }

  const universeByField = await fieldSegmentUniverseBySite(siteId, db);

  const rows = [];
  for (const field of fieldsRes.rows) {
    const fieldId = String(field.id);
    const classified = classifyFieldAvailability({
      occupied: occupiedByField.get(fieldId) || [],
      universe: universeByField.get(fieldId) || [],
      plantedInWindow: plantedInWindow.has(fieldId),
      uprootedInWindow: uprootByField.has(fieldId)
        ? {
            at: uprootByField.get(fieldId)!.at,
            reason: uprootByField.get(fieldId)!.reason,
            tokens: [...new Set(uprootByField.get(fieldId)!.tokens)],
            cropName: uprootByField.get(fieldId)!.cropName,
            varietyName: uprootByField.get(fieldId)!.varietyName,
          }
        : null,
    });
    if (!classified) continue;
    rows.push({
      field_id: fieldId,
      field_name: field.name,
      farm_area_name: field.farm_area_name,
      availability: classified.availability,
      kind: classified.kind,
      occupied_segments: classified.occupiedTokens,
      free_segments: classified.freeTokens,
      uprooted_at: classified.uprootedAt,
      uproot_reason: classified.uprootReason,
      last_crop: classified.lastCrop,
      planted_in_window: classified.plantedInWindow,
    });
  }

  return rows;
}
