-- Germination record sections (named tables: "Main", "Trial Variety", etc.)
CREATE TABLE IF NOT EXISTS germination_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  site_id UUID REFERENCES sites(id),
  name VARCHAR(100) NOT NULL DEFAULT 'Main',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual germination records within a section
CREATE TABLE IF NOT EXISTS germination_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES germination_sections(id) ON DELETE CASCADE,
  variety_id UUID REFERENCES crop_varieties(id),
  variety_name VARCHAR(200),
  counts JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_germ_sections_site ON germination_sections(site_id);
CREATE INDEX IF NOT EXISTS idx_germ_records_section ON germination_records(section_id);
