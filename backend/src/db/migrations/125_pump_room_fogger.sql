-- Fogger usage records (same layout as pump_room_water)

CREATE TABLE IF NOT EXISTS pump_room_fogger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  record_date DATE NOT NULL,
  meter_id VARCHAR(100),
  usage_area VARCHAR(200),
  pumps JSONB NOT NULL DEFAULT '[]'::jsonb,
  reading_1 NUMERIC,
  usage_1 NUMERIC,
  reading_2 NUMERIC,
  usage_2 NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deletion_id UUID
);

CREATE INDEX IF NOT EXISTS idx_pump_fogger_site_date ON pump_room_fogger(site_id, record_date);
CREATE INDEX IF NOT EXISTS idx_pump_fogger_deletion ON pump_room_fogger(deletion_id) WHERE deletion_id IS NOT NULL;

ALTER TABLE site_pump_room_config
  ADD COLUMN IF NOT EXISTS fogger_pump_count INT NOT NULL DEFAULT 2
    CHECK (fogger_pump_count >= 1 AND fogger_pump_count <= 10);

ALTER TABLE site_pump_room_config
  ADD COLUMN IF NOT EXISTS fogger_pump_labels JSONB NOT NULL DEFAULT '["Pump 1", "Pump 2"]'::jsonb;
