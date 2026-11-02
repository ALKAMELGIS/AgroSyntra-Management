-- Feature flags for safe rollouts and per-role feature gating
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,
  description TEXT DEFAULT '',
  roles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);

-- Seed some default flags
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('gis_map', true, 'GIS Map module'),
  ('yield_predictions', true, 'Yield prediction and crop recommendations'),
  ('gps_tracking', false, 'GPS device tracking'),
  ('drone_imagery', false, 'Drone imagery analysis')
ON CONFLICT (key) DO NOTHING;
