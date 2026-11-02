-- Add template_id to ecph_entries for future template-driven filtering
ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES form_templates(id);
CREATE INDEX IF NOT EXISTS idx_ecph_entries_template ON ecph_entries(template_id);

-- Insert "Farm Plots" EC/pH template (simplified: no EC Out, pH Out, Drain, % Drain)
INSERT INTO form_templates (organization_id, slug, name, category, description, icon, route_path, columns_config, is_system)
SELECT NULL, 'ecph-farm-plots', 'Farm Plots EC/pH', 'ecph',
       'EC & pH entry for open-field farm plots — simplified without drain/outflow readings',
       'Agriculture', '/ecph-entry',
       '{
  "sections": [],
  "columns": [
    {"key":"fieldName","label":"Field","type":"text","width":100},
    {"key":"valveNumber","label":"Valve","type":"number","width":70},
    {"key":"time","label":"Time","type":"text","width":100},
    {"key":"ecIn","label":"EC In","type":"number","width":80},
    {"key":"phIn","label":"pH In","type":"number","width":80},
    {"key":"dripVolume","label":"Drip Vol","type":"number","width":80},
    {"key":"totalWaterBasedOnDrip","label":"Water/Drip (M3)","type":"calculated","formula":"dripVolume based on dripper count","width":120},
    {"key":"qtyOfWater","label":"Qty Water (M3)","type":"number","width":120},
    {"key":"cycle","label":"Cycle","type":"number","width":70},
    {"key":"totalWaterQty","label":"Total Water","type":"calculated","formula":"qtyOfWater * cycle","width":110},
    {"key":"weatherCondition","label":"Weather","type":"dropdown","options":"Sunny,Cloudy,Rainy,Foggy,Windy","width":110},
    {"key":"irrigationStatus","label":"Status","type":"dropdown","options":"Normal,Skipped,Partial,Flushing","width":100}
  ]
}'::jsonb,
       TRUE
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'ecph-farm-plots');
