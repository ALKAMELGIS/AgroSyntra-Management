-- Seed only Site 1 with all active pesticide and bio products
-- Other sites start empty; workers use Browse All to copy what they need

DO $$
DECLARE
  target_site UUID;
BEGIN
  SELECT id INTO target_site
  FROM sites
  WHERE name = 'Site 1'
  LIMIT 1;

  IF target_site IS NOT NULL THEN
    INSERT INTO site_pesticide_products (site_id, product_id, unit_price)
    SELECT target_site, pp.id, NULL
    FROM pesticide_products pp
    WHERE pp.is_active = TRUE
    ON CONFLICT (site_id, product_id) DO NOTHING;

    INSERT INTO site_bio_products (site_id, product_id, price_per_package)
    SELECT target_site, bp.id, bp.price_per_package
    FROM bio_products_catalog bp
    WHERE bp.is_active = TRUE
    ON CONFLICT (site_id, product_id) DO NOTHING;
  END IF;
END $$;
