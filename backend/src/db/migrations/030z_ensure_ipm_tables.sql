-- Migration 030z: Ensure IPM tables exist
-- Fixes issue where pesticide_products and pesticide_applications tables
-- were missing from production despite migration 030 being recorded as applied.
-- All statements use IF NOT EXISTS for safety.

-- ─── Pesticide Product Catalog ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pesticide_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  active_ingredient VARCHAR(200),
  formulation_type VARCHAR(50),
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

-- ─── Pesticide Applications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pesticide_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  product_id UUID NOT NULL REFERENCES pesticide_products(id),
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  phi_end_date DATE NOT NULL DEFAULT CURRENT_DATE,
  dosage NUMERIC(10,3),
  dosage_unit VARCHAR(20) DEFAULT 'ml/L',
  concentration VARCHAR(50),
  application_method VARCHAR(50),
  target_pest VARCHAR(200),
  operator_name VARCHAR(200),
  weather_conditions TEXT,
  ppe_used JSONB DEFAULT '[]'::jsonb,
  authorized_by UUID REFERENCES users(id),
  approval_status VARCHAR(20) DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Biological Control Products ───────────────────────────────
CREATE TABLE IF NOT EXISTS bio_control_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  agent_type VARCHAR(50),
  form_type VARCHAR(50),
  target_pests JSONB DEFAULT '[]'::jsonb,
  application_rate_guide TEXT,
  is_active BOOLEAN DEFAULT true,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Biological Control Releases ───────────────────────────────
CREATE TABLE IF NOT EXISTS bio_control_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  product_id UUID NOT NULL REFERENCES bio_control_products(id),
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity INTEGER NOT NULL DEFAULT 0,
  form_type VARCHAR(50),
  target_pest VARCHAR(200),
  pre_release_pest_pct NUMERIC(5,2),
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Bumble Bee Deployments ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bumble_bee_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  date_placed DATE NOT NULL,
  box_count INTEGER NOT NULL DEFAULT 0,
  date_removed DATE,
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PHI Notification Tracking ─────────────────────────────────
CREATE TABLE IF NOT EXISTS phi_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES pesticide_applications(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES fields(id),
  notification_type VARCHAR(20) NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  recipient_user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id)
);

-- ─── Scouting Thresholds ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS scouting_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pest_disease_id UUID,
  crop_id UUID,
  warning_pct NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  critical_pct NUMERIC(5,2) NOT NULL DEFAULT 15.0,
  notes TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Essential Indexes ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_field ON pesticide_applications (field_id);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_date ON pesticide_applications (application_date);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_phi ON pesticide_applications (phi_end_date);
CREATE INDEX IF NOT EXISTS idx_bio_releases_field ON bio_control_releases (field_id);
CREATE INDEX IF NOT EXISTS idx_bumble_bees_field ON bumble_bee_deployments (field_id);
CREATE INDEX IF NOT EXISTS idx_phi_notifications_app ON phi_notifications (application_id);
