import { SEASON_CLOSED_REASON } from '../services/seasons.service';

/**
 * List SELECT for GET /crop-history.
 * Cycles: MAX(cycle_number) for field + crop + the row's own season_id (deepest segment).
 * Uproot: latest paired date+reason, preferring a user reason over "Season closed".
 */
export const CROP_HISTORY_LIST_SQL = `
    SELECT ch.id, ch.field_id, ch.crop_id, ch.variety_id,
           ch.start_date, ch.end_date, ch.created_at, ch.season_id,
           f.name AS field_name, c.name AS crop_name,
           cv.name AS variety_name,
           fa.name AS farm_area_name, s.name AS site_name, s.id AS site_id,
           uproot.uprooted_at,
           uproot.uproot_reason,
           cycles.cycle_count
    FROM crop_history ch
    JOIN fields f ON f.id = ch.field_id
    JOIN crops c ON c.id = ch.crop_id
    LEFT JOIN crop_varieties cv ON cv.id = ch.variety_id
    JOIN farm_areas fa ON fa.id = f.farm_area_id
    JOIN sites s ON s.id = fa.site_id
    LEFT JOIN LATERAL (
      SELECT u.uprooted_at, u.uproot_reason
      FROM (
        SELECT p.uprooted_at, p.uproot_reason
          FROM planting_records p
         WHERE p.uprooted_at IS NOT NULL
           AND (
             p.crop_history_id = ch.id
             OR (
               p.field_id = ch.field_id
               AND p.crop_id IS NOT DISTINCT FROM ch.crop_id
               AND p.uprooted_at::date >= ch.start_date
               AND (ch.end_date IS NULL OR p.uprooted_at::date <= ch.end_date)
               AND (ch.season_id IS NULL OR p.season_id IS NOT DISTINCT FROM ch.season_id)
             )
           )
        UNION ALL
        SELECT o.uprooted_at, o.uproot_reason
          FROM open_field_planting o
         WHERE o.uprooted_at IS NOT NULL
           AND o.migrated_to_planting_record_id IS NULL
           AND (
             o.crop_history_id = ch.id
             OR (
               o.field_id = ch.field_id
               AND o.crop_id IS NOT DISTINCT FROM ch.crop_id
               AND o.uprooted_at::date >= ch.start_date
               AND (ch.end_date IS NULL OR o.uprooted_at::date <= ch.end_date)
               AND (ch.season_id IS NULL OR o.season_id IS NOT DISTINCT FROM ch.season_id)
             )
           )
      ) u
      ORDER BY
        CASE WHEN u.uproot_reason = '${SEASON_CLOSED_REASON}' THEN 1 ELSE 0 END,
        u.uprooted_at DESC
      LIMIT 1
    ) uproot ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(cyc.cycle_number) AS cycle_count
        FROM (
          SELECT pr.cycle_number
            FROM planting_records pr
           WHERE pr.field_id = ch.field_id
             AND pr.crop_id IS NOT DISTINCT FROM ch.crop_id
             AND pr.season_id IS NOT DISTINCT FROM ch.season_id
          UNION ALL
          SELECT ofp.cycle_number
            FROM open_field_planting ofp
           WHERE ofp.field_id = ch.field_id
             AND ofp.crop_id IS NOT DISTINCT FROM ch.crop_id
             AND ofp.season_id IS NOT DISTINCT FROM ch.season_id
             AND ofp.migrated_to_planting_record_id IS NULL
        ) cyc
    ) cycles ON TRUE
`;
