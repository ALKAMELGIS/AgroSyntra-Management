-- RC-108 drip irrigation / fertigation record (nethouse-greenhouse wide log)

CREATE TABLE IF NOT EXISTS irrigation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  location_label VARCHAR(120) NOT NULL,
  valve_range VARCHAR(50),
  week_number INT,
  method VARCHAR(80) DEFAULT 'Drip',
  flow_rate_m3 NUMERIC,
  operator_name VARCHAR(255),
  authorized_by VARCHAR(255),
  water_qty_m3 NUMERIC,
  frequency NUMERIC,
  daily_water NUMERIC,
  fertilizer_type VARCHAR(255),
  fertilizer_qty NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, date, location_label)
);

CREATE INDEX IF NOT EXISTS idx_irrigation_entries_site_date
  ON irrigation_entries (site_id, date);

CREATE INDEX IF NOT EXISTS idx_irrigation_entries_org
  ON irrigation_entries (organization_id);
