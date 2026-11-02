-- Production may be missing pest_disease_catalog columns from 028/052/118
-- when those files were tracked in _migrations after a failed run, or when
-- 030 created the table without later ALTER columns.

ALTER TABLE pest_disease_catalog
  ADD COLUMN IF NOT EXISTS warning_threshold NUMERIC(5,2) DEFAULT 20.0,
  ADD COLUMN IF NOT EXISTS critical_threshold NUMERIC(5,2) DEFAULT 50.0,
  ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(10),
  ADD COLUMN IF NOT EXISTS match_pattern VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS include_in_summary BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_pest_id UUID REFERENCES pest_disease_catalog(id);
