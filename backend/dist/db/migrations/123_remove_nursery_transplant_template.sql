-- Transplant entry lives on Planting & Transplant; remove separate nursery-transplant template

DELETE FROM site_form_templates
WHERE template_id IN (SELECT id FROM form_templates WHERE slug = 'nursery-transplant');

DELETE FROM form_templates WHERE slug = 'nursery-transplant';
