-- Optional Nursery Sowing (RC-241) and Nursery Transplant templates

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
SELECT 'nursery-sowing', 'Sowing Record (RC-241)', 'planting',
       'Nursery sowing record — seeds, trays, growing media, germination (EAG/AFO/IMS/RC-241)', 'Yard',
       '/admin/crop-history?tab=nursery-sowing', TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'nursery-sowing');

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system)
SELECT 'nursery-transplant', 'Nursery Transplant', 'planting',
       'Transplant seedlings to nethouse fields — link to a nursery sowing batch', 'Yard',
       '/admin/crop-history?tab=nursery-transplant', TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'nursery-transplant');

UPDATE form_templates SET columns_config = '{
  "headerRows": 2,
  "sections": [{"key":"media","label":"Quantity of Media used"}],
  "columns": [
    {"key":"seedingDate","label":"Date of sowing","type":"date","width":120},
    {"key":"cropId","label":"Crop","type":"dropdown","options":"(crops)","width":120},
    {"key":"varietyId","label":"Variety","type":"dropdown","options":"(varieties)","width":130},
    {"key":"seedBatch","label":"Seed Batch","type":"text","width":110},
    {"key":"breederId","label":"Breeder","type":"dropdown","options":"(breeders)","width":120},
    {"key":"seedsPerCell","label":"No: of Seeds /cell","type":"number","width":100},
    {"key":"trayType","label":"Tray type","type":"number","width":90},
    {"key":"trayCount","label":"No. of trays","type":"number","width":90},
    {"key":"growingMediaBrand","label":"Growing Media used","type":"text","width":120},
    {"key":"perliteQty","label":"Perlite","type":"number","width":80,"sectionId":"media"},
    {"key":"perliteUom","label":"UoM","type":"text","width":60,"sectionId":"media"},
    {"key":"peatQty","label":"Peat moss","type":"number","width":80,"sectionId":"media"},
    {"key":"peatUom","label":"UoM","type":"text","width":60,"sectionId":"media"},
    {"key":"compostQty","label":"Compost","type":"number","width":80,"sectionId":"media"},
    {"key":"compostUom","label":"UoM","type":"text","width":60,"sectionId":"media"},
    {"key":"vermiculiteQty","label":"Vermiculite","type":"number","width":90,"sectionId":"media"},
    {"key":"vermiculiteUom","label":"UoM","type":"text","width":60,"sectionId":"media"},
    {"key":"seedlingCount","label":"No. of Seedling","type":"number","width":110},
    {"key":"germinationPct","label":"Germination %","type":"number","width":100},
    {"key":"readyToTransplantDate","label":"Date - ready to transplant","type":"date","width":140},
    {"key":"totalDaysTaken","label":"Total days taken","type":"calculated","width":110},
    {"key":"releaseDate","label":"Dates of release","type":"date","width":120},
    {"key":"seedlingsPlanted","label":"No. of seedling planted","type":"number","width":130},
    {"key":"seedlingsRemaining","label":"Remaining seedling","type":"calculated","width":120}
  ]
}'::jsonb
WHERE slug = 'nursery-sowing';

UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"sowingRecordId","label":"Sowing batch","type":"dropdown","options":"(nursery sowing batches)","width":200},
    {"key":"seedingDate","label":"Seeding Date","type":"date","width":120},
    {"key":"cropId","label":"Crop Name","type":"dropdown","options":"(crops)","width":120},
    {"key":"varietyId","label":"Variety","type":"dropdown","options":"(varieties)","width":130},
    {"key":"cropSubClass","label":"Sub Class","type":"text","width":100},
    {"key":"cropType","label":"Crop Type","type":"text","width":100},
    {"key":"breederId","label":"Breeder","type":"dropdown","options":"(breeders)","width":120},
    {"key":"lotBatchNo","label":"Seed Batch","type":"text","width":110},
    {"key":"fieldId","label":"Field ID (NH)","type":"dropdown","options":"(site fields)","width":130},
    {"key":"segment","label":"Segment (Bay)","type":"text","width":110},
    {"key":"totalArea","label":"Area","type":"text","width":90},
    {"key":"transplantDate","label":"Transplant Date","type":"date","width":130},
    {"key":"authorizedBy","label":"Authorized By","type":"text","width":120}
  ]
}'::jsonb
WHERE slug = 'nursery-transplant';
