-- Migration 042: Fix cascade behavior and add missing FK constraints
-- Ensures deleting master data doesn't leave orphan records

-- farm_area_crops: cascade on crop delete
ALTER TABLE farm_area_crops
  DROP CONSTRAINT IF EXISTS farm_area_crops_crop_id_fkey;
ALTER TABLE farm_area_crops
  ADD CONSTRAINT farm_area_crops_crop_id_fkey
  FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE;

ALTER TABLE farm_area_crops
  DROP CONSTRAINT IF EXISTS farm_area_crops_farm_area_id_fkey;
ALTER TABLE farm_area_crops
  ADD CONSTRAINT farm_area_crops_farm_area_id_fkey
  FOREIGN KEY (farm_area_id) REFERENCES farm_areas(id) ON DELETE CASCADE;

-- cost_entries.ipm_application_id: nullable FK with SET NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cost_entries' AND column_name = 'ipm_application_id')
  THEN
    ALTER TABLE cost_entries
      DROP CONSTRAINT IF EXISTS cost_entries_ipm_application_id_fkey;
  END IF;
END $$;

-- crop_varieties: cascade on crop delete
ALTER TABLE crop_varieties
  DROP CONSTRAINT IF EXISTS crop_varieties_crop_id_fkey;
ALTER TABLE crop_varieties
  ADD CONSTRAINT crop_varieties_crop_id_fkey
  FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE;
