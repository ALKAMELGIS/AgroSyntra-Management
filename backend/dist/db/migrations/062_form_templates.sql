-- Form templates: defines available entry form types and their structure
CREATE TABLE IF NOT EXISTS form_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    slug            VARCHAR(100) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(100) NOT NULL,
    description     TEXT,
    icon            VARCHAR(100),
    route_path      VARCHAR(255),
    columns_config  JSONB,
    is_system       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE INDEX idx_form_templates_category ON form_templates(category);
CREATE INDEX idx_form_templates_org ON form_templates(organization_id);

-- Junction: which templates are enabled per site
CREATE TABLE IF NOT EXISTS site_form_templates (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    template_id   UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
    is_default    BOOLEAN DEFAULT FALSE,
    sort_order    INT DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, template_id)
);

CREATE INDEX idx_site_form_templates_site ON site_form_templates(site_id);

-- Seed built-in templates (organization_id NULL = global / shared)
INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
VALUES
  ('ecph-standard',          'EC/PH Entry',              'ecph',        'Standard EC & pH readings with valve data',                   'Science',           '/ecph-entry',                    TRUE),
  ('fertigation-standard',   'Fertigation Entry',        'fertigation', 'Water and fertilizer application records',                    'WaterDrop',         '/fertigation/entry',             TRUE),
  ('harvest-standard',       'Harvest Entry',            'harvest',     'Harvest quantity and variety recording',                      'Agriculture',       '/harvest/entry',                 TRUE),
  ('planting-standard',      'Planting & Transplant',    'planting',    'Seeding, nursery, and transplant records',                    'Yard',              '/admin/crop-history',            TRUE),
  ('pest-application',       'Pesticide Applications',   'pest',        'PPP chemical application records',                            'PestControl',       '/ipm/pesticide-applications',    TRUE),
  ('scouting-report',        'Scouting Reports',         'scouting',    'Field scouting and pest/disease observations',                'Description',       '/ipm/scouting-reports',          TRUE),
  ('biological-control',     'Biological Control',       'biological',  'Biological agent releases and monitoring',                    'Spa',               '/ipm/biological-control',        TRUE),
  ('weather-log',            'Weather Log',              'weather',     'Daily weather and environmental conditions',                  'Cloud',             '/weather-log',                   TRUE),
  ('manpower-entry',         'Manpower Records',         'workforce',   'Worker attendance and task assignment',                       'Groups',            '/manpower/record',               TRUE)
ON CONFLICT DO NOTHING;
