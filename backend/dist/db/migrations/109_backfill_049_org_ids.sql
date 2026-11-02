-- Ensure org columns exist (049 may not have run on all environments), then backfill NULLs.
-- Must run before tenant-scoped reads go live.

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Al Maha Farm', 'al-maha-farm')
ON CONFLICT (slug) DO NOTHING;

-- Columns from 049_multi_tenant_complete.sql
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_inv_items_org ON inventory_items(organization_id);

ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_org ON inventory_transactions(organization_id);

ALTER TABLE api_integrations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_api_integrations_org ON api_integrations(organization_id);

ALTER TABLE workers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_workers_org ON workers(organization_id);

ALTER TABLE manpower_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_manpower_records_org ON manpower_records(organization_id);

ALTER TABLE gis_layers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_gis_layers_org ON gis_layers(organization_id);

ALTER TABLE soil_sensor_readings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_soil_sensor_org ON soil_sensor_readings(organization_id);

ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- Backfill organization_id on tables that were left NULL.
UPDATE inventory_items
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE inventory_transactions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE workers
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE manpower_records
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE gis_layers
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE soil_sensor_readings
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE api_integrations
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

UPDATE user_permissions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Users without an org belong to the default org (legacy accounts).
UPDATE users
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL AND deleted_at IS NULL;
