-- Site-scoped crop-specific PHI overrides per product
CREATE TABLE IF NOT EXISTS site_product_crop_phi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES pesticide_products(id) ON DELETE CASCADE,
  crop_name VARCHAR(200) NOT NULL,
  phi_days INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, product_id, crop_name)
);

CREATE INDEX IF NOT EXISTS idx_site_prod_crop_phi_site ON site_product_crop_phi(site_id);
CREATE INDEX IF NOT EXISTS idx_site_prod_crop_phi_product ON site_product_crop_phi(product_id);
