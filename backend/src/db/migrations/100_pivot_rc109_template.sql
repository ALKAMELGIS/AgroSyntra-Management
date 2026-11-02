-- Pivot PPP Application Record (RC-109) — dedicated form template for pivot fields

INSERT INTO form_templates (organization_id, slug, name, category, description, is_system, route_path, columns_config)
SELECT NULL, 'pest-pivot-rc109', 'Pivots (RC-109)', 'pest',
       'PPP application record for pivot fields — RC-109 layout (rate = qty ÷ 15)', TRUE,
       '/ipm/pesticide-applications', '{
  "sections": [],
  "structure": "pivot",
  "columns": []
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'pest-pivot-rc109');
