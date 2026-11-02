-- Org-scoped Excel → catalog activity aliases (misspellings from daily import).

CREATE TABLE IF NOT EXISTS manpower_activity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  source_key VARCHAR(200) NOT NULL,
  source_name VARCHAR(200) NOT NULL,
  activity_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_manpower_activity_aliases_org_key
  ON manpower_activity_aliases (organization_id, source_key);
