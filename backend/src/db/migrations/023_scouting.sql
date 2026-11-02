-- Scouting / Pest & Disease reporting system

-- Pest/Disease catalog (predefined list + custom "Other")
CREATE TABLE IF NOT EXISTS pest_disease_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('pest', 'disease', 'other')),
  description TEXT,
  recommended_action TEXT,
  is_custom BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  organization_id UUID REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scouting reports
CREATE TABLE IF NOT EXISTS scouting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id),
  scout_user_id UUID NOT NULL REFERENCES users(id),
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  pest_disease_id UUID REFERENCES pest_disease_catalog(id),
  custom_pest_name VARCHAR(200),
  infestation_pct NUMERIC(5,2) CHECK (infestation_pct >= 0 AND infestation_pct <= 100),
  severity VARCHAR(20) CHECK (severity IN ('none', 'low', 'medium', 'high', 'critical')),
  notes TEXT,
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'resolved')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scouting report photos (multiple per report)
CREATE TABLE IF NOT EXISTS scouting_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scouting_report_id UUID NOT NULL REFERENCES scouting_reports(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(100),
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pest_catalog_category ON pest_disease_catalog (category);
CREATE INDEX IF NOT EXISTS idx_pest_catalog_org ON pest_disease_catalog (organization_id);
CREATE INDEX IF NOT EXISTS idx_scouting_field ON scouting_reports (field_id);
CREATE INDEX IF NOT EXISTS idx_scouting_date ON scouting_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_scouting_pest ON scouting_reports (pest_disease_id);
CREATE INDEX IF NOT EXISTS idx_scouting_scout ON scouting_reports (scout_user_id);
CREATE INDEX IF NOT EXISTS idx_scouting_status ON scouting_reports (status);
CREATE INDEX IF NOT EXISTS idx_scouting_org ON scouting_reports (organization_id);
CREATE INDEX IF NOT EXISTS idx_scouting_photos_report ON scouting_photos (scouting_report_id);

-- Seed default pest/disease catalog
INSERT INTO pest_disease_catalog (name, category, description, is_custom, organization_id) VALUES
  ('Whitefly', 'pest', 'Bemisia tabaci - common greenhouse pest', false, '00000000-0000-0000-0000-000000000001'),
  ('Thrips', 'pest', 'Western flower thrips (Frankliniella occidentalis)', false, '00000000-0000-0000-0000-000000000001'),
  ('Spider Mite', 'pest', 'Two-spotted spider mite (Tetranychus urticae)', false, '00000000-0000-0000-0000-000000000001'),
  ('Aphids', 'pest', 'Various species affecting greenhouse crops', false, '00000000-0000-0000-0000-000000000001'),
  ('Leaf Miner', 'pest', 'Liriomyza spp.', false, '00000000-0000-0000-0000-000000000001'),
  ('Mealybug', 'pest', 'Pseudococcidae family', false, '00000000-0000-0000-0000-000000000001'),
  ('Tuta Absoluta', 'pest', 'Tomato leaf miner moth', false, '00000000-0000-0000-0000-000000000001'),
  ('Caterpillar', 'pest', 'Various lepidoptera larvae', false, '00000000-0000-0000-0000-000000000001'),
  ('Nematodes', 'pest', 'Root-knot nematodes (Meloidogyne spp.)', false, '00000000-0000-0000-0000-000000000001'),
  ('Powdery Mildew', 'disease', 'Fungal infection causing white powdery coating', false, '00000000-0000-0000-0000-000000000001'),
  ('Downy Mildew', 'disease', 'Oomycete infection causing yellow/brown patches', false, '00000000-0000-0000-0000-000000000001'),
  ('Botrytis (Gray Mold)', 'disease', 'Botrytis cinerea - gray mold fungus', false, '00000000-0000-0000-0000-000000000001'),
  ('Fusarium Wilt', 'disease', 'Fusarium oxysporum - soil-borne fungal disease', false, '00000000-0000-0000-0000-000000000001'),
  ('Verticillium Wilt', 'disease', 'Verticillium dahliae - vascular wilt', false, '00000000-0000-0000-0000-000000000001'),
  ('Bacterial Spot', 'disease', 'Xanthomonas campestris', false, '00000000-0000-0000-0000-000000000001'),
  ('Tomato Yellow Leaf Curl Virus', 'disease', 'TYLCV - transmitted by whiteflies', false, '00000000-0000-0000-0000-000000000001'),
  ('Root Rot', 'disease', 'Pythium/Phytophthora spp.', false, '00000000-0000-0000-0000-000000000001'),
  ('Blossom End Rot', 'disease', 'Calcium deficiency disorder', false, '00000000-0000-0000-0000-000000000001'),
  ('Early Blight', 'disease', 'Alternaria solani', false, '00000000-0000-0000-0000-000000000001'),
  ('Late Blight', 'disease', 'Phytophthora infestans', false, '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
