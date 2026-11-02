-- Pump room electricity usage records (daily meter readings)
CREATE TABLE IF NOT EXISTS pump_room_electricity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  record_date DATE NOT NULL,
  meter_id VARCHAR(100),
  usage_area VARCHAR(200),
  reading_1 NUMERIC,
  usage_1 NUMERIC,
  reading_2 NUMERIC,
  usage_2 NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pump_elec_site_date ON pump_room_electricity(site_id, record_date);

-- Pump room water usage records (daily meter readings)
CREATE TABLE IF NOT EXISTS pump_room_water (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  record_date DATE NOT NULL,
  meter_id VARCHAR(100),
  usage_area VARCHAR(200),
  reading NUMERIC,
  usage_amount NUMERIC,
  unit VARCHAR(20) DEFAULT 'm3',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pump_water_site_date ON pump_room_water(site_id, record_date);
