-- Activity reference lookup: unit/target per activity × crop × variety (site-scoped).

CREATE TABLE IF NOT EXISTS manpower_activity_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  activity VARCHAR(200) NOT NULL,
  crop VARCHAR(200),
  variety VARCHAR(200),
  unit VARCHAR(50),
  target NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_manpower_activity_references_lookup
  ON manpower_activity_references (
    organization_id,
    site_id,
    lower(btrim(activity)),
    lower(btrim(COALESCE(crop, ''))),
    lower(btrim(COALESCE(variety, '')))
  );

CREATE INDEX IF NOT EXISTS idx_manpower_activity_references_site
  ON manpower_activity_references (organization_id, site_id);
