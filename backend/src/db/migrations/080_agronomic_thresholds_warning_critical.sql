-- Migration 080: Split agronomic thresholds into warning + critical ranges
-- Each row now stores both warning and critical min/max per crop+parameter.

ALTER TABLE agronomic_thresholds
  ADD COLUMN IF NOT EXISTS warning_min NUMERIC,
  ADD COLUMN IF NOT EXISTS warning_max NUMERIC,
  ADD COLUMN IF NOT EXISTS critical_min NUMERIC,
  ADD COLUMN IF NOT EXISTS critical_max NUMERIC;

-- Migrate existing data: copy min_value/max_value into the appropriate columns based on severity
UPDATE agronomic_thresholds
SET warning_min = min_value, warning_max = max_value
WHERE severity = 'warning';

UPDATE agronomic_thresholds
SET critical_min = min_value, critical_max = max_value
WHERE severity = 'critical';

-- Drop old columns
ALTER TABLE agronomic_thresholds
  DROP COLUMN IF EXISTS min_value,
  DROP COLUMN IF EXISTS max_value,
  DROP COLUMN IF EXISTS severity;
