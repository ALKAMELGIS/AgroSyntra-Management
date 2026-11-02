-- Site-scoped product catalogs: per-site pricing for bio control and pesticide products

CREATE TABLE IF NOT EXISTS site_bio_products (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES bio_products_catalog(id) ON DELETE CASCADE,
    price_per_package NUMERIC,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_site_bio_products_site ON site_bio_products(site_id);

CREATE TABLE IF NOT EXISTS site_pesticide_products (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES pesticide_products(id) ON DELETE CASCADE,
    unit_price  NUMERIC,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_site_pest_products_site ON site_pesticide_products(site_id);

-- Seed: assign all existing bio catalog products to the first site (Site 1)
DO $$
DECLARE
  first_site UUID;
BEGIN
  SELECT s.id INTO first_site
  FROM sites s
  JOIN countries c ON c.id = s.country_id
  ORDER BY c.name, s.name
  LIMIT 1;

  IF first_site IS NOT NULL THEN
    INSERT INTO site_bio_products (site_id, product_id, price_per_package)
    SELECT first_site, bp.id, bp.price_per_package
    FROM bio_products_catalog bp
    WHERE bp.is_active = TRUE
    ON CONFLICT (site_id, product_id) DO NOTHING;

    INSERT INTO site_pesticide_products (site_id, product_id, unit_price)
    SELECT first_site, pp.id, NULL
    FROM pesticide_products pp
    WHERE pp.is_active = TRUE
    ON CONFLICT (site_id, product_id) DO NOTHING;
  END IF;
END $$;
