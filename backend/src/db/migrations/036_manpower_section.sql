-- Consolidate valve + bay into a single "section" column
ALTER TABLE manpower_records RENAME COLUMN valve TO section;
ALTER TABLE manpower_records DROP COLUMN IF EXISTS bay;
