-- Saved field groups for bulk fertigation entry (shared recipe/water defaults)

CREATE TABLE IF NOT EXISTS fertigation_field_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  field_ids UUID[] NOT NULL DEFAULT '{}',
  default_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fertigation_field_groups_site
  ON fertigation_field_groups(site_id);

CREATE INDEX IF NOT EXISTS idx_fertigation_field_groups_org
  ON fertigation_field_groups(organization_id);
