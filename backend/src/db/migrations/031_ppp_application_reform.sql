-- Migration 031: PPP Application Record Reform
-- Adds new columns to pesticide_applications to match the company Excel template
-- (24-column Plant Protection Product Application Record)

ALTER TABLE pesticide_applications
  ADD COLUMN IF NOT EXISTS crop_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS variety VARCHAR(200),
  ADD COLUMN IF NOT EXISTS segment_id TEXT,
  ADD COLUMN IF NOT EXISTS scouting_date DATE,
  ADD COLUMN IF NOT EXISTS justification VARCHAR(200),
  ADD COLUMN IF NOT EXISTS percent_seen VARCHAR(200),
  ADD COLUMN IF NOT EXISTS application_start_time VARCHAR(20),
  ADD COLUMN IF NOT EXISTS application_end_time VARCHAR(20),
  ADD COLUMN IF NOT EXISTS active_ingredient VARCHAR(200),
  ADD COLUMN IF NOT EXISTS rate_per_ha NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS uom VARCHAR(20),
  ADD COLUMN IF NOT EXISTS total_quantity_applied NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS machinery_used VARCHAR(200),
  ADD COLUMN IF NOT EXISTS verified_by VARCHAR(200);

-- Migrate existing data into new columns for backward compatibility
UPDATE pesticide_applications
  SET justification = target_pest
  WHERE justification IS NULL AND target_pest IS NOT NULL;

UPDATE pesticide_applications
  SET uom = dosage_unit
  WHERE uom IS NULL AND dosage_unit IS NOT NULL;

UPDATE pesticide_applications
  SET machinery_used = application_method
  WHERE machinery_used IS NULL AND application_method IS NOT NULL;

-- Index for field-based filtering (records per field view)
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_crop ON pesticide_applications(crop_name);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_scouting ON pesticide_applications(scouting_date);
