-- Soil sensor readings: per-field, per-date soil data from sensors or manual entry

CREATE TABLE IF NOT EXISTS soil_sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  date DATE NOT NULL,
  moisture_pct NUMERIC,
  temperature_c NUMERIC,
  ec_dsm NUMERIC,
  ph NUMERIC,
  depth_cm NUMERIC,
  source VARCHAR(255) DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_soil_readings_unique
  ON soil_sensor_readings(field_id, date, source, COALESCE(depth_cm, 0));
CREATE INDEX IF NOT EXISTS idx_soil_readings_field ON soil_sensor_readings(field_id);
CREATE INDEX IF NOT EXISTS idx_soil_readings_date ON soil_sensor_readings(date DESC);
