ALTER TABLE bio_record_field_setup
  ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id);

-- Prefer season containing start_date, else Jan 1 of year, else closest site season.
UPDATE bio_record_field_setup bs
SET season_id = picked.id
FROM (
  SELECT DISTINCT ON (bs2.id)
    bs2.id AS setup_id,
    s.id
  FROM bio_record_field_setup bs2
  JOIN fields f ON f.id = bs2.field_id
  JOIN farm_areas fa ON fa.id = f.farm_area_id
  JOIN seasons s ON s.site_id = fa.site_id
  ORDER BY
    bs2.id,
    CASE
      WHEN bs2.start_date IS NOT NULL
        AND bs2.start_date >= s.start_date
        AND bs2.start_date <= COALESCE(s.end_date, s.planned_end_date) THEN 0
      WHEN make_date(bs2.year, 1, 1) >= s.start_date
        AND make_date(bs2.year, 1, 1) <= COALESCE(s.end_date, s.planned_end_date) THEN 1
      ELSE 2
    END,
    CASE
      WHEN bs2.start_date IS NOT NULL
        AND bs2.start_date >= s.start_date
        AND bs2.start_date <= COALESCE(s.end_date, s.planned_end_date) THEN 0
      WHEN make_date(bs2.year, 1, 1) >= s.start_date
        AND make_date(bs2.year, 1, 1) <= COALESCE(s.end_date, s.planned_end_date) THEN 0
      ELSE abs(s.start_date - COALESCE(bs2.start_date, make_date(bs2.year, 1, 1)))
    END,
    s.start_date DESC
) picked
WHERE bs.id = picked.setup_id
  AND bs.season_id IS NULL;

UPDATE bio_record_field_setup bs
SET season_id = (
  SELECT s.id FROM seasons s
  WHERE bs.organization_id IS NULL
     OR s.organization_id IS NULL
     OR s.organization_id = bs.organization_id
  ORDER BY s.start_date DESC
  LIMIT 1
)
WHERE bs.season_id IS NULL;

WITH ranked AS (
  SELECT
    bs.id,
    row_number() OVER (
      PARTITION BY bs.field_id, bs.crop_id, bs.season_id
      ORDER BY
        (SELECT count(*) FROM bio_record_field_products p WHERE p.field_setup_id = bs.id) DESC,
        (SELECT count(*) FROM bio_record_entries e WHERE e.field_setup_id = bs.id) DESC,
        bs.year DESC
    ) AS rn
  FROM bio_record_field_setup bs
  WHERE bs.season_id IS NOT NULL
)
DELETE FROM bio_record_field_setup
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE bio_record_field_setup
  ALTER COLUMN season_id SET NOT NULL;

ALTER TABLE bio_record_field_setup
  DROP CONSTRAINT IF EXISTS bio_record_field_setup_field_id_crop_id_year_key;

DROP INDEX IF EXISTS bio_record_field_setup_field_id_crop_id_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS bio_record_field_setup_field_crop_season_key
  ON bio_record_field_setup (field_id, crop_id, season_id);

CREATE INDEX IF NOT EXISTS idx_bio_record_field_setup_crop_season
  ON bio_record_field_setup (crop_id, season_id);
