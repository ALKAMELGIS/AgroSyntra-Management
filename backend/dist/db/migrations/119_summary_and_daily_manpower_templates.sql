-- Scouting Summary Report and Daily Manpower Report built-in templates

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
SELECT 'scouting-summary', 'Scouting Summary Report', 'scouting',
       'Excel-style field summary with pest/disease totals and biological control columns', 'Description',
       '/ipm/scouting-reports?tab=summary', TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'scouting-summary');

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
SELECT 'daily-manpower-report', 'Daily Manpower Report', 'workforce',
       'Read-only daily workforce activity sheet for one selected date', 'Groups',
       '/manpower-record?tab=daily', TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'daily-manpower-report');

UPDATE form_templates SET columns_config = '{
  "sections": [
    {"key":"meta","label":"General"},
    {"key":"diseases","label":"Diseases"},
    {"key":"pests","label":"Pests"},
    {"key":"bio","label":"Biological Control"},
    {"key":"notes","label":"Notes"}
  ],
  "columns": [
    {"key":"location","label":"Location","type":"text","width":100,"sectionId":"meta"},
    {"key":"crop","label":"Crop","type":"text","width":100,"sectionId":"meta"},
    {"key":"scoutingDate","label":"Scouting Date","type":"date","width":120,"sectionId":"meta"},
    {"key":"eBlight","label":"E Blight","type":"number","width":80,"sectionId":"diseases"},
    {"key":"lBlight","label":"L blight","type":"number","width":80,"sectionId":"diseases"},
    {"key":"bBlight","label":"B Blight","type":"number","width":80,"sectionId":"diseases"},
    {"key":"lSpot","label":"L Spot","type":"number","width":80,"sectionId":"diseases"},
    {"key":"bSpot","label":"B Spot","type":"number","width":80,"sectionId":"diseases"},
    {"key":"slSpot","label":"S.L. Spot","type":"number","width":80,"sectionId":"diseases"},
    {"key":"botrytis","label":"Botrytis","type":"number","width":80,"sectionId":"diseases"},
    {"key":"mite","label":"Mite","type":"number","width":70,"sectionId":"pests"},
    {"key":"miteL","label":"Mite L","type":"number","width":70,"sectionId":"pests"},
    {"key":"miteEgg","label":"Mite Egg","type":"number","width":70,"sectionId":"pests"},
    {"key":"broadMite","label":"Broad mite","type":"number","width":80,"sectionId":"pests"},
    {"key":"thrips","label":"Thrips","type":"number","width":70,"sectionId":"pests"},
    {"key":"whitefly","label":"Whitefly","type":"number","width":80,"sectionId":"pests"},
    {"key":"whiteflyEgg","label":"Whitefly Egg","type":"number","width":90,"sectionId":"pests"},
    {"key":"aphids","label":"Aphids","type":"number","width":70,"sectionId":"pests"},
    {"key":"mealybug","label":"Mealybug","type":"number","width":80,"sectionId":"pests"},
    {"key":"swriski","label":"Swriski","type":"number","width":80,"sectionId":"bio"},
    {"key":"spidex","label":"Spidex","type":"number","width":80,"sectionId":"bio"},
    {"key":"aphipar","label":"Aphipar","type":"number","width":80,"sectionId":"bio"},
    {"key":"thripor","label":"Thripor","type":"number","width":80,"sectionId":"bio"},
    {"key":"notes","label":"Notes","type":"text","width":200,"sectionId":"notes"}
  ]
}'::jsonb
WHERE slug = 'scouting-summary';

UPDATE form_templates SET columns_config = '{
  "sections": [
    {"key":"worker","label":"Worker"},
    {"key":"activity1","label":"Activity 1"},
    {"key":"activity2","label":"Activity 2"},
    {"key":"activity3","label":"Activity 3"},
    {"key":"totals","label":"Totals"}
  ],
  "columns": [
    {"key":"recordDate","label":"Date","type":"date","width":110,"sectionId":"worker"},
    {"key":"employeeId","label":"ID","type":"text","width":70,"sectionId":"worker"},
    {"key":"workerName","label":"Employee Name","type":"text","width":150,"sectionId":"worker"},
    {"key":"workerCategory","label":"Category","type":"dropdown","options":"Permanent,Casual","width":110,"sectionId":"worker"},
    {"key":"act1Activity","label":"Activity","type":"text","width":120,"sectionId":"activity1"},
    {"key":"act1Unit","label":"Unit","type":"text","width":70,"sectionId":"activity1"},
    {"key":"act1Variety","label":"Variety","type":"text","width":100,"sectionId":"activity1"},
    {"key":"act1Location","label":"Location","type":"text","width":100,"sectionId":"activity1"},
    {"key":"act1Section","label":"Section","type":"text","width":80,"sectionId":"activity1"},
    {"key":"act1Start","label":"Start","type":"text","width":80,"sectionId":"activity1"},
    {"key":"act1End","label":"End","type":"text","width":80,"sectionId":"activity1"},
    {"key":"act1Target","label":"Target","type":"number","width":70,"sectionId":"activity1"},
    {"key":"act1Actual","label":"Actual","type":"number","width":70,"sectionId":"activity1"},
    {"key":"act1Hours","label":"Hours","type":"number","width":70,"sectionId":"activity1"},
    {"key":"act2Activity","label":"Activity","type":"text","width":120,"sectionId":"activity2"},
    {"key":"act2Hours","label":"Hours","type":"number","width":70,"sectionId":"activity2"},
    {"key":"act3Activity","label":"Activity","type":"text","width":120,"sectionId":"activity3"},
    {"key":"act3Hours","label":"Hours","type":"number","width":70,"sectionId":"activity3"},
    {"key":"totalHours","label":"Total Hours","type":"number","width":100,"sectionId":"totals"}
  ]
}'::jsonb
WHERE slug = 'daily-manpower-report';

-- Assign new templates to sites that already have the parent scouting/manpower template
INSERT INTO site_form_templates (site_id, template_id, sort_order)
SELECT sft.site_id, new_tpl.id,
       COALESCE((SELECT MAX(sort_order) + 1 FROM site_form_templates WHERE site_id = sft.site_id), 0)
FROM site_form_templates sft
JOIN form_templates parent ON parent.id = sft.template_id AND parent.slug = 'scouting-report'
JOIN form_templates new_tpl ON new_tpl.slug = 'scouting-summary'
WHERE NOT EXISTS (
  SELECT 1 FROM site_form_templates x
  WHERE x.site_id = sft.site_id AND x.template_id = new_tpl.id
);

INSERT INTO site_form_templates (site_id, template_id, sort_order)
SELECT sft.site_id, new_tpl.id,
       COALESCE((SELECT MAX(sort_order) + 1 FROM site_form_templates WHERE site_id = sft.site_id), 0)
FROM site_form_templates sft
JOIN form_templates parent ON parent.id = sft.template_id AND parent.slug = 'manpower-entry'
JOIN form_templates new_tpl ON new_tpl.slug = 'daily-manpower-report'
WHERE NOT EXISTS (
  SELECT 1 FROM site_form_templates x
  WHERE x.site_id = sft.site_id AND x.template_id = new_tpl.id
);
