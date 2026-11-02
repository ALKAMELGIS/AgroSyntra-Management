-- Add template_id and total_water_qty to pesticide_applications + seed Spray/Drench built-in templates

ALTER TABLE pesticide_applications ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES form_templates(id);
ALTER TABLE pesticide_applications ADD COLUMN IF NOT EXISTS total_water_qty NUMERIC(12,2);
ALTER TABLE pesticide_applications ALTER COLUMN field_id DROP NOT NULL;
ALTER TABLE pesticide_applications ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE pesticide_applications ALTER COLUMN phi_end_date DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pest_apps_template ON pesticide_applications(template_id);

-- Spray Application template
INSERT INTO form_templates (organization_id, slug, name, category, description, is_system, route_path, columns_config)
SELECT NULL, 'pest-spray', 'Spray Application', 'pest',
       'PPP spray application record matching RC-109 Excel format', TRUE,
       '/ipm/pesticide-applications', '{
  "sections": [],
  "columns": [
    {"key":"cropName","label":"Crop","type":"text","width":100},
    {"key":"variety","label":"Variety","type":"text","width":120},
    {"key":"fieldId","label":"Field ID","type":"dropdown","width":120},
    {"key":"segmentId","label":"Segment ID","type":"text","width":100},
    {"key":"applicationDate","label":"Application Date","type":"date","width":120},
    {"key":"justification","label":"Justification","type":"dropdown","options":"Pest : Whitefly,Pest : Thrips,Pest : Red Spider Mite,Pest : Mealybug,Pest : Worm (Caterpillar),Pest : Aphids,Pest : Phytium,Disease : Botrytis,Disease : Powdery Mildew,Disease : Downy Mildew,Preventative","width":150},
    {"key":"percentSeen","label":"% Seen","type":"text","width":80},
    {"key":"scoutingDate","label":"Scouting Date","type":"date","width":120},
    {"key":"applicationStartTime","label":"Start Time","type":"time","width":90},
    {"key":"applicationEndTime","label":"End Time","type":"time","width":90},
    {"key":"productId","label":"Name of PPP","type":"dropdown","width":150},
    {"key":"activeIngredient","label":"Active Ingredient","type":"text","width":160,"readonly":true},
    {"key":"dosage","label":"Dose/L Water","type":"number","width":90},
    {"key":"uom","label":"UOM","type":"dropdown","options":"ML,GM,L,KG","width":60},
    {"key":"totalQuantityApplied","label":"Qty Applied","type":"number","width":90},
    {"key":"unitPrice","label":"Unit Price","type":"number","width":90,"readonly":true},
    {"key":"cost","label":"Cost","type":"calculated","formula":"(totalQuantityApplied * unitPrice) / 1000","width":80},
    {"key":"totalWaterQty","label":"Total Water (Ltr)","type":"number","width":100},
    {"key":"machineryUsed","label":"Machinery","type":"text","width":80},
    {"key":"phiDays","label":"PHI","type":"number","width":50,"readonly":true},
    {"key":"clearToHarvestDate","label":"Clear Date","type":"calculated","formula":"applicationEndTime + phiDays","width":100},
    {"key":"weatherConditions","label":"Weather","type":"dropdown","options":"Sunny,Cloudy,Windy,Rainy,Partly Cloudy,Hot,Humid","width":90},
    {"key":"operatorName","label":"Operator","type":"text","width":100},
    {"key":"verifiedBy","label":"Verified By","type":"text","width":100}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'pest-spray');

-- Drench Application template
INSERT INTO form_templates (organization_id, slug, name, category, description, is_system, route_path, columns_config)
SELECT NULL, 'pest-drench', 'Drench Application', 'pest',
       'PPP drench application record matching RC-109 Excel format', TRUE,
       '/ipm/pesticide-applications', '{
  "sections": [],
  "columns": [
    {"key":"cropName","label":"Crop","type":"text","width":100},
    {"key":"variety","label":"Variety","type":"text","width":120},
    {"key":"fieldId","label":"Field ID","type":"dropdown","width":120},
    {"key":"segmentId","label":"Segment ID","type":"text","width":100},
    {"key":"applicationDate","label":"Application Date","type":"date","width":120},
    {"key":"justification","label":"Justification","type":"dropdown","options":"Pest : Whitefly,Pest : Thrips,Pest : Red Spider Mite,Pest : Mealybug,Pest : Worm (Caterpillar),Pest : Aphids,Pest : Phytium,Disease : Botrytis,Disease : Powdery Mildew,Disease : Downy Mildew,Preventative","width":150},
    {"key":"percentSeen","label":"% Seen","type":"text","width":80},
    {"key":"scoutingDate","label":"Scouting Date","type":"date","width":120},
    {"key":"applicationStartTime","label":"Start Time","type":"time","width":90},
    {"key":"applicationEndTime","label":"End Time","type":"time","width":90},
    {"key":"productId","label":"Name of PPP","type":"dropdown","width":150},
    {"key":"activeIngredient","label":"Active Ingredient","type":"text","width":160,"readonly":true},
    {"key":"dosage","label":"Dose/L Water","type":"number","width":90},
    {"key":"uom","label":"UOM","type":"dropdown","options":"ML,GM,L,KG","width":60},
    {"key":"totalQuantityApplied","label":"Qty Applied","type":"number","width":90},
    {"key":"unitPrice","label":"Unit Price","type":"number","width":90,"readonly":true},
    {"key":"cost","label":"Cost","type":"calculated","formula":"(totalQuantityApplied * unitPrice) / 1000","width":80},
    {"key":"totalWaterQty","label":"Total Water (Ltr)","type":"number","width":100},
    {"key":"machineryUsed","label":"Machinery","type":"text","width":80},
    {"key":"phiDays","label":"PHI","type":"number","width":50,"readonly":true},
    {"key":"clearToHarvestDate","label":"Clear Date","type":"calculated","formula":"applicationEndTime + phiDays","width":100},
    {"key":"weatherConditions","label":"Weather","type":"dropdown","options":"Sunny,Cloudy,Windy,Rainy,Partly Cloudy,Hot,Humid","width":90},
    {"key":"operatorName","label":"Operator","type":"text","width":100},
    {"key":"verifiedBy","label":"Verified By","type":"text","width":100}
  ]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'pest-drench');
