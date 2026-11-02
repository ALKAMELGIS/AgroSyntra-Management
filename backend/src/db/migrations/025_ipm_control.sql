-- IPM Control: Pesticide Applications, Biological Control, Bumble Bees

-- ─── Pesticide Product Catalog ────────────────────────────────────

CREATE TABLE IF NOT EXISTS pesticide_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  active_ingredient VARCHAR(200),
  formulation_type VARCHAR(50) CHECK (formulation_type IN ('spray', 'drench', 'fog', 'granule', 'dust', 'other')),
  phi_days INTEGER NOT NULL DEFAULT 0,
  manufacturer VARCHAR(200),
  registration_number VARCHAR(100),
  target_pests JSONB DEFAULT '[]'::jsonb,
  safety_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Pesticide Applications ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS pesticide_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  product_id UUID NOT NULL REFERENCES pesticide_products(id),
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  phi_end_date DATE NOT NULL,
  dosage NUMERIC(10,3),
  dosage_unit VARCHAR(20) DEFAULT 'ml/L',
  concentration VARCHAR(50),
  application_method VARCHAR(50) CHECK (application_method IN ('spray', 'drench', 'fog', 'granule', 'other')),
  target_pest VARCHAR(200),
  operator_name VARCHAR(200),
  weather_conditions TEXT,
  ppe_used JSONB DEFAULT '[]'::jsonb,
  authorized_by UUID REFERENCES users(id),
  approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Biological Control Product Catalog ──────────────────────────

CREATE TABLE IF NOT EXISTS bio_control_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  agent_type VARCHAR(50) CHECK (agent_type IN ('predatory_mite', 'parasitic_wasp', 'nematode', 'fungus', 'bacteria', 'other')),
  form_type VARCHAR(50) CHECK (form_type IN ('bottle', 'sachet', 'pouch', 'other')),
  target_pests JSONB DEFAULT '[]'::jsonb,
  application_rate_guide TEXT,
  is_active BOOLEAN DEFAULT true,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Biological Control Releases ─────────────────────────────────

CREATE TABLE IF NOT EXISTS bio_control_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  product_id UUID NOT NULL REFERENCES bio_control_products(id),
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity INTEGER NOT NULL,
  form_type VARCHAR(50) CHECK (form_type IN ('bottle', 'sachet', 'pouch', 'other')),
  target_pest VARCHAR(200),
  pre_release_pest_pct NUMERIC(5,2),
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Bumble Bee Deployments ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS bumble_bee_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  date_placed DATE NOT NULL,
  box_count INTEGER NOT NULL,
  date_removed DATE,
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pesticide_products_org ON pesticide_products (organization_id);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_field ON pesticide_applications (field_id);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_date ON pesticide_applications (application_date);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_phi ON pesticide_applications (phi_end_date);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_status ON pesticide_applications (approval_status);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_org ON pesticide_applications (organization_id);
CREATE INDEX IF NOT EXISTS idx_bio_products_org ON bio_control_products (organization_id);
CREATE INDEX IF NOT EXISTS idx_bio_releases_field ON bio_control_releases (field_id);
CREATE INDEX IF NOT EXISTS idx_bio_releases_date ON bio_control_releases (release_date);
CREATE INDEX IF NOT EXISTS idx_bio_releases_org ON bio_control_releases (organization_id);
CREATE INDEX IF NOT EXISTS idx_bumble_bees_field ON bumble_bee_deployments (field_id);
CREATE INDEX IF NOT EXISTS idx_bumble_bees_org ON bumble_bee_deployments (organization_id);
