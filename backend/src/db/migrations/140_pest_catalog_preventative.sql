-- Preventative justifications in the pest/disease catalog (PPP spray reason)

ALTER TABLE pest_disease_catalog DROP CONSTRAINT IF EXISTS pest_disease_catalog_category_check;
ALTER TABLE pest_disease_catalog
  ADD CONSTRAINT pest_disease_catalog_category_check
  CHECK (category IN ('pest', 'disease', 'other', 'biological_control', 'preventative'));

INSERT INTO pest_disease_catalog (
  name, category, description, is_custom, organization_id, sort_order
)
SELECT 'Preventative', 'preventative', 'Default preventative spray justification', false, NULL, 0
WHERE NOT EXISTS (
  SELECT 1 FROM pest_disease_catalog p
  WHERE p.category = 'preventative' AND lower(p.name) = 'preventative'
);
