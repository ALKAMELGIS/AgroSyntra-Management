-- Migration 116: Separate plant count from dripper count for scouting and other calculations

ALTER TABLE crops ADD COLUMN IF NOT EXISTS plant_count INT;

-- Backfill from dripper_count where plant count was previously implied
UPDATE crops
SET plant_count = dripper_count
WHERE plant_count IS NULL AND dripper_count IS NOT NULL;
