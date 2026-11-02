-- Drone flight tracking
CREATE TABLE IF NOT EXISTS drone_flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  flight_date DATE NOT NULL,
  pilot VARCHAR(100),
  altitude DECIMAL(6,1), -- meters
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drone images linked to flights
CREATE TABLE IF NOT EXISTS drone_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id UUID NOT NULL REFERENCES drone_flights(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  storage_key VARCHAR(500),
  image_type VARCHAR(20) NOT NULL CHECK (image_type IN ('rgb', 'ndvi', 'thermal', 'other')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drone_flights_field ON drone_flights (field_id);
CREATE INDEX IF NOT EXISTS idx_drone_flights_date ON drone_flights (flight_date);
CREATE INDEX IF NOT EXISTS idx_drone_images_flight ON drone_images (flight_id);
