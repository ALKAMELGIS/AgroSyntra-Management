-- Seed biological control products from Al Maha Excel into catalog
-- Uses the single organization's id; skips if item_code already exists
DO $$
DECLARE
  org UUID;
BEGIN
  SELECT id INTO org FROM organizations LIMIT 1;
  IF org IS NULL THEN RETURN; END IF;

  INSERT INTO bio_products_catalog (organization_id, item_code, item_name, per_package, price_per_package, is_active)
  VALUES
    (org, '06820',  'HORIVER/SMALL/YELLOW/10x25cm/10pcs PACK', 10,    NULL, TRUE),
    (org, '80201',  'NATUPOL Excel Hive',                      100,   NULL, TRUE),
    (org, '05405',  'SWIRSKI-MITE/50.000/500ml',               50000, NULL, TRUE),
    (org, '05430',  'SWIRSKI ULTI-MITE/250/500 Sachets',       500,   NULL, TRUE),
    (org, '04045',  'THRIPOR/LAEVIGATUS/2000/100ml',           2000,  NULL, TRUE),
    (org, '04908',  'SPICAL/25.000/500ml',                     25000, NULL, TRUE),
    (org, '03182',  'SPIDEX VITAL/10000/500ml',                10000, NULL, TRUE),
    (org, '02640',  'APHIPAR/5000/500ml',                      5000,  NULL, TRUE),
    (org, '02500',  'APHIDEND/1.000/100ml',                    1000,  NULL, TRUE),
    (org, '04736',  'CRYPTOBUG-L/1000',                        1000,  NULL, TRUE),
    (org, '04280',  'CHRYSOPA/1000/500ml',                     1000,  NULL, TRUE),
    (org, '04460',  'CAPSANEM/2x250 Million',                  500000000, NULL, TRUE),
    (org, '11103',  'TRIANUM-P/500gr/EN',                      500,   NULL, TRUE),
    (org, 'SPD2K',  'Spidex /2000/100 ML',                    2000,  NULL, TRUE),
    (org, 'SPD10K', 'Spidex /10000/500 ML',                   10000, NULL, TRUE),
    (org, 'APH1K',  'APHIPAR/1000/100ml',                     1000,  NULL, TRUE),
    (org, '14715',  'NOPATH DRENCH/5ltr/NL-GB',               NULL,  NULL, TRUE),
    (org, '04903',  'SPICAL ULTI-MITE/100/500 Sachets',       500,   NULL, TRUE)
  ON CONFLICT (organization_id, item_code) DO NOTHING;
END $$;
