-- Per-site visibility for form templates (Crop History tabs, etc.)

ALTER TABLE site_form_templates
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
SELECT 'germination-record', 'Germination Record', 'planting',
       'Germination sections and tray readings', 'Yard', '/admin/crop-history?tab=germination', TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'germination-record');

INSERT INTO site_form_templates (site_id, template_id, sort_order, is_visible)
SELECT s.id, ft.id, 0, TRUE
FROM sites s
CROSS JOIN form_templates ft
WHERE ft.slug = 'planting-standard'
  AND NOT EXISTS (
    SELECT 1 FROM site_form_templates x
    WHERE x.site_id = s.id AND x.template_id = ft.id
  );

INSERT INTO site_form_templates (site_id, template_id, sort_order, is_visible)
SELECT s.id, ft.id, 1, TRUE
FROM sites s
CROSS JOIN form_templates ft
WHERE ft.slug = 'germination-record'
  AND NOT EXISTS (
    SELECT 1 FROM site_form_templates x
    WHERE x.site_id = s.id AND x.template_id = ft.id
  );
