-- Biological control agents in pest/disease catalog (simple names for scouting summary)

ALTER TABLE pest_disease_catalog
  ADD COLUMN IF NOT EXISTS match_pattern VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS include_in_summary BOOLEAN DEFAULT false;

ALTER TABLE pest_disease_catalog DROP CONSTRAINT IF EXISTS pest_disease_catalog_category_check;
ALTER TABLE pest_disease_catalog
  ADD CONSTRAINT pest_disease_catalog_category_check
  CHECK (category IN ('pest', 'disease', 'other', 'biological_control'));

INSERT INTO pest_disease_catalog (
  name, category, description, match_pattern, sort_order, include_in_summary, is_custom, organization_id
)
SELECT v.name, 'biological_control', v.description, v.match_pattern, v.sort_order, v.include_in_summary, false, NULL
FROM (VALUES
  ('Swriski', 'Scouting summary column — matches Swirski products in bio record', 'SWIRSKI', 1, true),
  ('Spidex', 'Scouting summary column — matches Spidex products in bio record', 'SPIDEX', 2, true),
  ('Aphipar', 'Scouting summary column — matches Aphipar products in bio record', 'APHIPAR', 3, true),
  ('Thripor', 'Scouting summary column — matches Thripor products in bio record', 'THRIPOR', 4, true),
  ('Cryptobug', 'Biological control reference', 'CRYPTOBUG', 5, false),
  ('Spical', 'Biological control reference', 'SPICAL', 6, false),
  ('Aphidend', 'Biological control reference', 'APHIDEND', 7, false),
  ('Chrysopa', 'Biological control reference', 'CHRYSOPA', 8, false),
  ('Capsanem', 'Biological control reference', 'CAPSANEM', 9, false),
  ('Trianaum', 'Biological control reference', 'TRIANUM', 10, false)
) AS v(name, description, match_pattern, sort_order, include_in_summary)
WHERE NOT EXISTS (
  SELECT 1 FROM pest_disease_catalog p
  WHERE p.category = 'biological_control' AND lower(p.name) = lower(v.name)
);
