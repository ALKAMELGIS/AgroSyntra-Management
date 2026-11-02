-- Add "Open Field Seeding" as a built-in template under the planting category

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
SELECT 'open-field-seeding', 'Open Field Seeding', 'planting',
       'Seeding records for open field / farm plot areas', 'Yard', '/admin/crop-history', TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'open-field-seeding');

UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"seedingDate","label":"Seeding Date","type":"date","width":120},
    {"key":"fieldId","label":"Field","type":"dropdown","options":"(site fields)","width":120},
    {"key":"segment","label":"Segment","type":"text","width":100},
    {"key":"totalArea","label":"Total Area","type":"number","width":90},
    {"key":"cropId","label":"Crop Name","type":"dropdown","options":"(crops)","width":120},
    {"key":"varietyId","label":"Variety","type":"dropdown","options":"(varieties)","width":130},
    {"key":"cropType","label":"Crop Type","type":"dropdown","options":"Annual,Permanent","width":100},
    {"key":"breederId","label":"Breeder","type":"dropdown","options":"(breeders)","width":120},
    {"key":"lotBatchNo","label":"Lot/Batch No","type":"text","width":110},
    {"key":"quantity","label":"Quantity","type":"number","width":90},
    {"key":"uom","label":"UOM","type":"dropdown","options":"Kg,MT,PCS","width":80},
    {"key":"authorizedBy","label":"Authorized By","type":"text","width":120}
  ]
}'::jsonb
WHERE slug = 'open-field-seeding';
