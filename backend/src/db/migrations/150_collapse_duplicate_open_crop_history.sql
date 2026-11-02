-- One open crop_history row per field. Same-day bay imports used to insert
-- one Current per planting row; 149 skipped any field that already had one.
-- Keep the earliest open row (start_date, id), close the rest, restamp
-- plantings onto the survivor with a season guard, and clear stale field crops.

WITH ranked AS (
  SELECT id, field_id,
         ROW_NUMBER() OVER (
           PARTITION BY field_id
           ORDER BY start_date ASC, id ASC
         ) AS rn
    FROM crop_history
   WHERE end_date IS NULL
)
UPDATE crop_history ch
   SET end_date = ch.start_date
  FROM ranked r
 WHERE ch.id = r.id AND r.rn > 1;

UPDATE planting_records pr
   SET crop_history_id = ch.id
  FROM crop_history ch
 WHERE pr.status = 'active'
   AND pr.field_id = ch.field_id
   AND pr.crop_id = ch.crop_id
   AND ch.end_date IS NULL
   AND pr.season_id IS NOT DISTINCT FROM ch.season_id;

UPDATE open_field_planting ofp
   SET crop_history_id = ch.id
  FROM crop_history ch
 WHERE ofp.status = 'active'
   AND ofp.migrated_to_planting_record_id IS NULL
   AND ofp.field_id = ch.field_id
   AND ofp.crop_id = ch.crop_id
   AND ch.end_date IS NULL
   AND ofp.season_id IS NOT DISTINCT FROM ch.season_id;

UPDATE fields f
   SET current_crop_id = NULL,
       variety_id = NULL,
       updated_at = NOW()
 WHERE NOT EXISTS (
   SELECT 1 FROM crop_history ch
    WHERE ch.field_id = f.id AND ch.end_date IS NULL
 );

UPDATE fields f
   SET current_crop_id = src.crop_id,
       variety_id = src.variety_id,
       updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (ch.field_id)
           ch.field_id, ch.crop_id, ch.variety_id
      FROM crop_history ch
     WHERE ch.end_date IS NULL
     ORDER BY ch.field_id, ch.start_date DESC, ch.id DESC
  ) src
 WHERE f.id = src.field_id;
