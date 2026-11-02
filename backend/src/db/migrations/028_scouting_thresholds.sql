-- Add configurable warning/critical thresholds per pest/disease
ALTER TABLE pest_disease_catalog
  ADD COLUMN IF NOT EXISTS warning_threshold NUMERIC(5,2) DEFAULT 20.0,
  ADD COLUMN IF NOT EXISTS critical_threshold NUMERIC(5,2) DEFAULT 50.0;
