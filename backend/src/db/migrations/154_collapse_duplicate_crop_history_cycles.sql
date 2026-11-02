-- One crop_history row per field + crop + start_date. Old Excel imports
-- inserted one rotation per variety/companion, so History listed dozens of
-- copies of the same cycle (named variety mixed with "-"). 150 only closed
-- extra OPEN rows; ended duplicates stayed. Keep Current, then a named
-- variety, then the earliest id. Harvests stay on planting records.

UPDATE crop_history ch
   SET variety_id = COALESCE(ch.variety_id, sib.variety_id),
       season_id  = COALESCE(ch.season_id, sib.season_id)
  FROM (
    SELECT DISTINCT ON (field_id, crop_id, start_date)
           id, field_id, crop_id, start_date
      FROM crop_history
     ORDER BY field_id, crop_id, start_date,
              CASE WHEN end_date IS NULL THEN 0 ELSE 1 END,
              CASE WHEN variety_id IS NOT NULL THEN 0 ELSE 1 END,
              id ASC
  ) k
  JOIN LATERAL (
    SELECT x.variety_id, x.season_id
      FROM crop_history x
     WHERE x.field_id = k.field_id
       AND x.crop_id = k.crop_id
       AND x.start_date = k.start_date
     ORDER BY (x.variety_id IS NOT NULL) DESC,
              (x.season_id IS NOT NULL) DESC,
              x.id ASC
     LIMIT 1
  ) sib ON TRUE
 WHERE ch.id = k.id
   AND (
        (ch.variety_id IS NULL AND sib.variety_id IS NOT NULL)
     OR (ch.season_id IS NULL AND sib.season_id IS NOT NULL)
   );

UPDATE planting_records pr
   SET crop_history_id = k.id
  FROM crop_history loser
  JOIN (
    SELECT DISTINCT ON (field_id, crop_id, start_date)
           id, field_id, crop_id, start_date
      FROM crop_history
     ORDER BY field_id, crop_id, start_date,
              CASE WHEN end_date IS NULL THEN 0 ELSE 1 END,
              CASE WHEN variety_id IS NOT NULL THEN 0 ELSE 1 END,
              id ASC
  ) k ON k.field_id = loser.field_id
     AND k.crop_id = loser.crop_id
     AND k.start_date = loser.start_date
 WHERE pr.crop_history_id = loser.id
   AND loser.id <> k.id;

UPDATE open_field_planting ofp
   SET crop_history_id = k.id
  FROM crop_history loser
  JOIN (
    SELECT DISTINCT ON (field_id, crop_id, start_date)
           id, field_id, crop_id, start_date
      FROM crop_history
     ORDER BY field_id, crop_id, start_date,
              CASE WHEN end_date IS NULL THEN 0 ELSE 1 END,
              CASE WHEN variety_id IS NOT NULL THEN 0 ELSE 1 END,
              id ASC
  ) k ON k.field_id = loser.field_id
     AND k.crop_id = loser.crop_id
     AND k.start_date = loser.start_date
 WHERE ofp.crop_history_id = loser.id
   AND loser.id <> k.id;

UPDATE plantation_opening_records por
   SET crop_history_id = k.id
  FROM crop_history loser
  JOIN (
    SELECT DISTINCT ON (field_id, crop_id, start_date)
           id, field_id, crop_id, start_date
      FROM crop_history
     ORDER BY field_id, crop_id, start_date,
              CASE WHEN end_date IS NULL THEN 0 ELSE 1 END,
              CASE WHEN variety_id IS NOT NULL THEN 0 ELSE 1 END,
              id ASC
  ) k ON k.field_id = loser.field_id
     AND k.crop_id = loser.crop_id
     AND k.start_date = loser.start_date
 WHERE por.crop_history_id = loser.id
   AND loser.id <> k.id;

DELETE FROM crop_history loser
      USING (
        SELECT DISTINCT ON (field_id, crop_id, start_date)
               id, field_id, crop_id, start_date
          FROM crop_history
         ORDER BY field_id, crop_id, start_date,
                  CASE WHEN end_date IS NULL THEN 0 ELSE 1 END,
                  CASE WHEN variety_id IS NOT NULL THEN 0 ELSE 1 END,
                  id ASC
      ) k
 WHERE loser.field_id = k.field_id
   AND loser.crop_id = k.crop_id
   AND loser.start_date = k.start_date
   AND loser.id <> k.id;

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_crop_history_field_crop_start
  ON crop_history (field_id, crop_id, start_date);
