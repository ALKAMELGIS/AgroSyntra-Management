-- Ensure organization_id exists on core multi-tenant tables from 022.
-- Production may have skipped 022 while later migrations were tracked as applied.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Al Maha Farm', 'al-maha-farm')
ON CONFLICT (slug) DO NOTHING;

-- Core hierarchy (countries / sites / fields)
ALTER TABLE countries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_countries_org ON countries(organization_id);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(organization_id);

ALTER TABLE fields ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_fields_org ON fields(organization_id);

-- Operational tables from 022
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_harvests_org ON harvests(organization_id);

ALTER TABLE fertigation_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_fertigation_org ON fertigation_entries(organization_id);

ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_ecph_org ON ecph_entries(organization_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id);

ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON alert_rules(organization_id);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);

ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(organization_id);

ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_org ON cost_entries(organization_id);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_shifts_org ON shifts(organization_id);

ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_entity_comments_org ON entity_comments(organization_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- Optional tables (may not exist on every environment)
DO $$
BEGIN
  IF to_regclass('public.equipment') IS NOT NULL THEN
    ALTER TABLE equipment ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    CREATE INDEX IF NOT EXISTS idx_equipment_org ON equipment(organization_id);
  END IF;
  IF to_regclass('public.drone_flights') IS NOT NULL THEN
    ALTER TABLE drone_flights ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    CREATE INDEX IF NOT EXISTS idx_drone_flights_org ON drone_flights(organization_id);
  END IF;
END $$;

-- Backfill default org
UPDATE countries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE sites SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE fields SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE harvests SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE fertigation_entries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE ecph_entries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE tasks SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE alert_rules SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE api_keys SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE webhooks SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE cost_entries SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE shifts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE entity_comments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE users SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL AND deleted_at IS NULL;

DO $$
BEGIN
  IF to_regclass('public.equipment') IS NOT NULL THEN
    UPDATE equipment SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
  END IF;
  IF to_regclass('public.drone_flights') IS NOT NULL THEN
    UPDATE drone_flights SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
  END IF;
END $$;
