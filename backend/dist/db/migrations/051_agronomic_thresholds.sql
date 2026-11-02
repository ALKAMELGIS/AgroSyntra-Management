-- Migration 051: Agronomic Reference Thresholds
-- Stores crop-specific min/max thresholds for environmental parameters.
-- When weather/soil readings exceed these, the alert engine fires notifications.

CREATE TABLE IF NOT EXISTS agronomic_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
  parameter VARCHAR(50) NOT NULL,
  min_value NUMERIC,
  max_value NUMERIC,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(crop_id, parameter)
);

CREATE INDEX IF NOT EXISTS idx_agronomic_thresholds_crop ON agronomic_thresholds(crop_id);
CREATE INDEX IF NOT EXISTS idx_agronomic_thresholds_enabled ON agronomic_thresholds(enabled) WHERE enabled = true;
