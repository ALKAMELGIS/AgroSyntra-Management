-- Add organization_id to tables that are missing it for complete multi-tenancy

-- inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_inv_items_org ON inventory_items(organization_id);

-- inventory_transactions
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_org ON inventory_transactions(organization_id);

-- api_integrations
ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_api_integrations_org ON api_integrations(organization_id);

-- workers (manpower)
ALTER TABLE workers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_workers_org ON workers(organization_id);

-- manpower_records
ALTER TABLE manpower_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_manpower_records_org ON manpower_records(organization_id);

-- gis_layers
ALTER TABLE gis_layers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_gis_layers_org ON gis_layers(organization_id);

-- soil_sensor_readings
ALTER TABLE soil_sensor_readings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_soil_sensor_org ON soil_sensor_readings(organization_id);

-- feature_flags (org-scoped flags for future multi-tenant use)
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- user_permissions
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Backfill organization_id from related FK chains where possible
-- inventory_items: no direct FK to fields, so we leave NULL for now
-- workers: same, no direct FK
-- These will be set by the application on new inserts going forward
