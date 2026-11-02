-- Catalog variants (spots, combos) link to one or more original pests.
-- Application records store the catalog id used as justification.

CREATE TABLE IF NOT EXISTS pest_catalog_group_members (
  member_id UUID NOT NULL REFERENCES pest_disease_catalog(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES pest_disease_catalog(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, group_id),
  CONSTRAINT pest_catalog_group_no_self CHECK (member_id <> group_id)
);

CREATE INDEX IF NOT EXISTS idx_pest_catalog_group_group_id
  ON pest_catalog_group_members (group_id);

ALTER TABLE pesticide_applications
  ADD COLUMN IF NOT EXISTS justification_catalog_id UUID REFERENCES pest_disease_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pesticide_applications_justification_catalog
  ON pesticide_applications (justification_catalog_id)
  WHERE justification_catalog_id IS NOT NULL;
