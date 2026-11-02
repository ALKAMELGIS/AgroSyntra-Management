-- Add variety tracking to crop_history
ALTER TABLE crop_history ADD COLUMN IF NOT EXISTS variety_id UUID REFERENCES crop_varieties(id);

-- Add crop+variety snapshot to entry tables for historical accuracy
ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS crop_id UUID REFERENCES crops(id);
ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS variety_id UUID REFERENCES crop_varieties(id);
ALTER TABLE fertigation_entries ADD COLUMN IF NOT EXISTS crop_id UUID REFERENCES crops(id);
ALTER TABLE fertigation_entries ADD COLUMN IF NOT EXISTS variety_id UUID REFERENCES crop_varieties(id);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS crop_id UUID REFERENCES crops(id);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS variety_id UUID REFERENCES crop_varieties(id);

-- Index for efficient crop_history lookups
CREATE INDEX IF NOT EXISTS idx_crop_history_field_date ON crop_history(field_id, start_date, end_date);
