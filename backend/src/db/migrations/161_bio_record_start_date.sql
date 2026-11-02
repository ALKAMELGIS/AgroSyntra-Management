ALTER TABLE bio_record_field_setup
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS week_count INT;

-- Existing January 52-week sheets keep those rows visible.
UPDATE bio_record_field_setup bs
SET week_count = GREATEST(
  52,
  COALESCE((SELECT MAX(e.week_number) FROM bio_record_entries e WHERE e.field_setup_id = bs.id), 0)
)
WHERE week_count IS NULL;

ALTER TABLE bio_record_field_setup
  ALTER COLUMN week_count SET DEFAULT 36;
