-- RC-132 pivot fertilizer application: catalog + monthly sheets + records

CREATE TABLE IF NOT EXISTS fertilizer_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  type_conc VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fertilizer_products_org_lower_name
  ON fertilizer_products (organization_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_fertilizer_products_active
  ON fertilizer_products (organization_id, is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS fertilizer_application_month_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  farm_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_fert_app_month_sheets_site_year
  ON fertilizer_application_month_sheets (site_id, year);

CREATE TABLE IF NOT EXISTS fertilizer_application_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_sheet_id UUID NOT NULL REFERENCES fertilizer_application_month_sheets(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  segment_id VARCHAR(50),
  area_ha NUMERIC,
  crop VARCHAR(100),
  fertilizer_product_id UUID REFERENCES fertilizer_products(id),
  fertilizer_name VARCHAR(255) NOT NULL,
  fertilizer_type_conc VARCHAR(255),
  total_kg NUMERIC,
  rate_per_ha NUMERIC,
  qty_tons NUMERIC,
  operator_name VARCHAR(100),
  authorized_by VARCHAR(100),
  mis_no VARCHAR(100),
  doc_no VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fert_app_records_sheet ON fertilizer_application_records (month_sheet_id);
CREATE INDEX IF NOT EXISTS idx_fert_app_records_field_date ON fertilizer_application_records (field_id, date);

-- Seed RC-132 fertilizer trade names from user's Excel (17 deduped names)
DO $$
DECLARE
  org UUID;
BEGIN
  SELECT id INTO org FROM organizations LIMIT 1;
  IF org IS NULL THEN RETURN; END IF;

  INSERT INTO fertilizer_products (organization_id, name)
  VALUES
    (org, 'Amino Acids'),
    (org, 'Ammonium Sulphate'),
    (org, 'Bio Gibb'),
    (org, 'Calcium Nitrate'),
    (org, 'DAP'),
    (org, 'MKP'),
    (org, 'Magnesium Sulphate'),
    (org, 'Mycorheza'),
    (org, 'NPK (18-18-18)'),
    (org, 'Phosphoric Acid'),
    (org, 'Potassium Nitrate'),
    (org, 'Solfomax'),
    (org, 'SOP'),
    (org, 'TPT Zinc Sulphate'),
    (org, 'Trace Element'),
    (org, 'Urea'),
    (org, 'ZN- Edta')
  ON CONFLICT DO NOTHING;
END $$;
