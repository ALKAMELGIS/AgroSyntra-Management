-- Soft-delete support for pump room records
ALTER TABLE pump_room_electricity ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pump_room_electricity ADD COLUMN IF NOT EXISTS deletion_id UUID;

ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS deletion_id UUID;

-- Deleted sheet log (extensible record_type for future modules)
CREATE TABLE IF NOT EXISTS pump_room_deleted_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  record_type VARCHAR(50) NOT NULL,
  month_year VARCHAR(7) NOT NULL,
  record_count INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by UUID REFERENCES users(id),
  restored_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pump_deleted_sheets_active ON pump_room_deleted_sheets(restored_at) WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pump_elec_deletion ON pump_room_electricity(deletion_id) WHERE deletion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pump_water_deletion ON pump_room_water(deletion_id) WHERE deletion_id IS NOT NULL;
