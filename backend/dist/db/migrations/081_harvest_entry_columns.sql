-- Migration 081: Add Excel-style harvest entry columns
-- Matches the per-field harvest record sheets from the Excel workbook.

ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS shift_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS segment_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS harvested_area_ha NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS packhouse VARCHAR(100),
  ADD COLUMN IF NOT EXISTS authorized_by VARCHAR(100);

-- Add variety_id to harvest_varieties for DB-driven variety lookup
ALTER TABLE harvest_varieties
  ADD COLUMN IF NOT EXISTS variety_id UUID REFERENCES crop_varieties(id);

-- Index for fast per-field date lookups (used by summary tabs)
CREATE INDEX IF NOT EXISTS idx_harvests_field_date ON harvests(field_id, date);
