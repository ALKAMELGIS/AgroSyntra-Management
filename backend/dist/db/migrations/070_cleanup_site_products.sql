-- Remove accidental seeding: delete site_product rows for all sites except Site 1

DO $$
DECLARE
  site1_id UUID;
BEGIN
  SELECT id INTO site1_id FROM sites WHERE name = 'Site 1' LIMIT 1;

  IF site1_id IS NOT NULL THEN
    DELETE FROM site_pesticide_products WHERE site_id != site1_id;
    DELETE FROM site_bio_products WHERE site_id != site1_id;
  END IF;
END $$;
