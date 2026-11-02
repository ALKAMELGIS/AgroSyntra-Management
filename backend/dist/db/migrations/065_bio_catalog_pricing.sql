ALTER TABLE bio_products_catalog ADD COLUMN IF NOT EXISTS per_package INT;
ALTER TABLE bio_products_catalog ADD COLUMN IF NOT EXISTS price_per_package NUMERIC;
