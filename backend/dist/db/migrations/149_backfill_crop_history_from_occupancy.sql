-- One open crop_history row per field that is occupied but has no Current rotation.
-- Re-runnable: skips any field that already has end_date IS NULL.
-- planting_records occupancy starts at COALESCE(transplant_date, seeding_date);
-- open_field_planting occupancy starts at seeding_date only.
-- Mixed-crop fields get the earliest occupancy's crop (field-level Current).

WITH occupancy AS (
  SELECT field_id, crop_id, variety_id, occupancy_start, season_id, created_at
  FROM (
    SELECT pr.field_id, pr.crop_id, pr.variety_id,
           COALESCE(pr.transplant_date, pr.seeding_date) AS occupancy_start,
           pr.season_id, pr.created_at
      FROM planting_records pr
     WHERE pr.status = 'active'
       AND pr.field_id IS NOT NULL
       AND pr.crop_id IS NOT NULL
       AND COALESCE(pr.transplant_date, pr.seeding_date) IS NOT NULL
    UNION ALL
    SELECT ofp.field_id, ofp.crop_id, ofp.variety_id,
           ofp.seeding_date AS occupancy_start,
           ofp.season_id, ofp.created_at
      FROM open_field_planting ofp
     WHERE ofp.status = 'active'
       AND ofp.migrated_to_planting_record_id IS NULL
       AND ofp.field_id IS NOT NULL
       AND ofp.crop_id IS NOT NULL
       AND ofp.seeding_date IS NOT NULL
  ) live
),
earliest AS (
  SELECT DISTINCT ON (field_id)
         field_id, crop_id, variety_id, occupancy_start, season_id
    FROM occupancy
   ORDER BY field_id, occupancy_start ASC, created_at ASC
)
INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, season_id)
SELECT e.field_id, e.crop_id, e.variety_id, e.occupancy_start, e.season_id
  FROM earliest e
 WHERE NOT EXISTS (
   SELECT 1 FROM crop_history ch
    WHERE ch.field_id = e.field_id AND ch.end_date IS NULL
 );

UPDATE planting_records pr
   SET crop_history_id = ch.id
  FROM crop_history ch
 WHERE pr.crop_history_id IS NULL
   AND pr.status = 'active'
   AND pr.field_id = ch.field_id
   AND pr.crop_id = ch.crop_id
   AND ch.end_date IS NULL;

UPDATE open_field_planting ofp
   SET crop_history_id = ch.id
  FROM crop_history ch
 WHERE ofp.crop_history_id IS NULL
   AND ofp.status = 'active'
   AND ofp.migrated_to_planting_record_id IS NULL
   AND ofp.field_id = ch.field_id
   AND ofp.crop_id = ch.crop_id
   AND ch.end_date IS NULL;

UPDATE fields f
   SET current_crop_id = src.crop_id,
       variety_id = src.variety_id,
       updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (ch.field_id)
           ch.field_id, ch.crop_id, ch.variety_id
      FROM crop_history ch
     WHERE ch.end_date IS NULL
     ORDER BY ch.field_id, ch.start_date DESC
  ) src
 WHERE f.id = src.field_id;
