-- Multi-tenant: Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add organization_id to core tables
-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users (organization_id);

-- Countries
ALTER TABLE countries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_countries_org ON countries (organization_id);

-- Sites
ALTER TABLE sites ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites (organization_id);

-- Fields
ALTER TABLE fields ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_fields_org ON fields (organization_id);

-- Harvests
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_harvests_org ON harvests (organization_id);

-- Fertigation entries
ALTER TABLE fertigation_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_fertigation_org ON fertigation_entries (organization_id);

-- EC/PH entries
ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_ecph_org ON ecph_entries (organization_id);

-- Tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks (organization_id);

-- Alert rules
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON alert_rules (organization_id);

-- API keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys (organization_id);

-- Webhooks
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks (organization_id);

-- Cost entries
ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_org ON cost_entries (organization_id);

-- Shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_shifts_org ON shifts (organization_id);

-- Equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_equipment_org ON equipment (organization_id);

-- Drone flights
ALTER TABLE drone_flights ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_drone_flights_org ON drone_flights (organization_id);

-- Entity comments
ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_entity_comments_org ON entity_comments (organization_id);

-- Row-Level Security policies
-- Enable RLS on key tables (example for users, fields, harvests)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fertigation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecph_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see rows in their organization
-- Note: these require the app to SET app.current_org_id before queries
CREATE POLICY IF NOT EXISTS tenant_isolation_users ON users
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_fields ON fields
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_harvests ON harvests
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_fertigation ON fertigation_entries
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_ecph ON ecph_entries
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_tasks ON tasks
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_costs ON cost_entries
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

CREATE POLICY IF NOT EXISTS tenant_isolation_shifts ON shifts
  USING (organization_id = current_setting('app.current_org_id', true)::uuid OR organization_id IS NULL);

-- Default org for existing data (migration convenience)
INSERT INTO organizations (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Al Maha Farm', 'al-maha-farm')
ON CONFLICT (slug) DO NOTHING;

-- Assign existing data to default org
UPDATE users SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE countries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE sites SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE fields SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE harvests SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE fertigation_entries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE ecph_entries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE tasks SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE cost_entries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE shifts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE equipment SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE drone_flights SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE entity_comments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
