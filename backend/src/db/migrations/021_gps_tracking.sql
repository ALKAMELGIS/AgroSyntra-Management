-- Equipment for GPS tracking
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('tractor', 'sprayer', 'harvester', 'drone', 'vehicle', 'other')),
  identifier VARCHAR(100), -- serial/plate number
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GPS positions
CREATE TABLE IF NOT EXISTS gps_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  speed DECIMAL(6,2), -- km/h
  heading DECIMAL(5,2), -- degrees
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_positions_equipment ON gps_positions (equipment_id);
CREATE INDEX IF NOT EXISTS idx_gps_positions_recorded ON gps_positions (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_active ON equipment (is_active) WHERE is_active = true;
