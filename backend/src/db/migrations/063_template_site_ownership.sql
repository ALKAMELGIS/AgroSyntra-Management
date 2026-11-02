ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS created_by_site_id UUID REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS idx_form_templates_site_owner ON form_templates(created_by_site_id);
