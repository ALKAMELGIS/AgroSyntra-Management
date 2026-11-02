CREATE TABLE IF NOT EXISTS bio_uom (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS bio_uom_global_name
  ON bio_uom (lower(name))
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bio_uom_org_name
  ON bio_uom (organization_id, lower(name))
  WHERE organization_id IS NOT NULL;

INSERT INTO bio_uom (name)
SELECT seed.name
FROM (VALUES ('sachets'), ('ml')) AS seed(name)
WHERE NOT EXISTS (
  SELECT 1 FROM bio_uom u
  WHERE u.organization_id IS NULL AND lower(u.name) = seed.name
);

ALTER TABLE bio_products_catalog
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES bio_uom(id);

ALTER TABLE bio_record_field_products
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES bio_uom(id);
