-- API Integrations: generic connector for weather stations, soil sensors, valve controllers, etc.

CREATE TABLE IF NOT EXISTS api_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('weather_station', 'soil_sensor', 'valve_controller', 'other')),
  provider VARCHAR(255),
  base_url TEXT NOT NULL,
  auth_type VARCHAR(30) NOT NULL DEFAULT 'api_key' CHECK (auth_type IN ('api_key', 'bearer_token', 'basic', 'none')),
  auth_config JSONB DEFAULT '{}'::jsonb,
  polling_interval_minutes INT NOT NULL DEFAULT 60,
  data_mapping JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_integration_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES api_integrations(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES fields(id),
  station_id VARCHAR(255),
  is_shared BOOLEAN DEFAULT false,
  config_override JSONB DEFAULT '{}'::jsonb,
  UNIQUE(integration_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_api_integrations_type ON api_integrations(type);
CREATE INDEX IF NOT EXISTS idx_api_integrations_active ON api_integrations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_integration_fields_integration ON api_integration_fields(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_integration_fields_field ON api_integration_fields(field_id);
