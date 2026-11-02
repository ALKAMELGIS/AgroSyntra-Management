-- RC-133 pivot irrigation: monthly sheets + daily records

CREATE TABLE IF NOT EXISTS irrigation_month_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  farm_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_irrigation_month_sheets_site_year
  ON irrigation_month_sheets (site_id, year);

CREATE TABLE IF NOT EXISTS irrigation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_sheet_id UUID NOT NULL REFERENCES irrigation_month_sheets(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  segment_id VARCHAR(50),
  area_ha NUMERIC,
  crop VARCHAR(100),
  flow_rate_m3_hr NUMERIC,
  cycle_duration_hr NUMERIC,
  volume_m3 NUMERIC,
  authorized_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irrigation_records_sheet ON irrigation_records (month_sheet_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_records_field_date ON irrigation_records (field_id, date);
