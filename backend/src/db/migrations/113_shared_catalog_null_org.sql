-- Shared foundation catalogs: platform seeds use NULL organization_id.
-- Copy-on-write overrides link back via source_* columns; org_catalog_hidden
-- lets each tenant hide foundation rows without affecting others.

ALTER TABLE pesticide_products
  ADD COLUMN IF NOT EXISTS source_product_id UUID REFERENCES pesticide_products(id);

ALTER TABLE pest_disease_catalog
  ADD COLUMN IF NOT EXISTS source_pest_id UUID REFERENCES pest_disease_catalog(id);

CREATE TABLE IF NOT EXISTS org_catalog_hidden (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  catalog_type TEXT NOT NULL CHECK (catalog_type IN ('pesticide_product', 'pest_catalog', 'bio_product')),
  item_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, catalog_type, item_id)
);

-- Platform pest catalog seeds were tagged to default org; make them shared foundation.
UPDATE pest_disease_catalog
SET organization_id = NULL
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND is_custom = false;

-- Bio catalog seeds used first org; promote to shared foundation when not org-custom.
UPDATE bio_products_catalog
SET organization_id = NULL
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

CREATE INDEX IF NOT EXISTS idx_pesticide_products_source ON pesticide_products(source_product_id)
  WHERE source_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pest_catalog_source ON pest_disease_catalog(source_pest_id)
  WHERE source_pest_id IS NOT NULL;
