-- Add columns_config to built-in templates so the preview page can render spreadsheet mockups

-- 1. EC/PH Entry
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"fieldName","label":"Field","type":"text","width":100},
    {"key":"valveNumber","label":"Valve","type":"number","width":70},
    {"key":"time","label":"Time","type":"text","width":100},
    {"key":"ecIn","label":"EC In","type":"number","width":80},
    {"key":"phIn","label":"pH In","type":"number","width":80},
    {"key":"ecOut","label":"EC Out","type":"number","width":80},
    {"key":"phOut","label":"pH Out","type":"number","width":80},
    {"key":"dripVolume","label":"Drip Vol","type":"number","width":80},
    {"key":"drainVolume","label":"Drain Vol","type":"number","width":90},
    {"key":"totalWaterBasedOnDrip","label":"Water/Drip (M3)","type":"calculated","formula":"dripVolume based","width":120},
    {"key":"qtyOfWater","label":"Qty Water (M3)","type":"number","width":120},
    {"key":"cycle","label":"Cycle","type":"number","width":70},
    {"key":"totalWaterQty","label":"Total Water","type":"calculated","formula":"qtyOfWater * cycle","width":110},
    {"key":"weatherCondition","label":"Weather","type":"dropdown","options":"Sunny,Cloudy,Rainy,Foggy,Windy","width":110},
    {"key":"irrigationStatus","label":"Status","type":"dropdown","options":"Normal,Skipped,Partial,Flushing","width":100}
  ]
}'::jsonb
WHERE slug = 'ecph-standard';

-- 2. Fertigation Entry
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"fieldName","label":"Field","type":"text","width":100},
    {"key":"currentCrop","label":"Crop","type":"text","width":100},
    {"key":"recipeId","label":"Recipe","type":"dropdown","options":"(per site recipes)","width":140},
    {"key":"valves","label":"Valves","type":"number","width":70},
    {"key":"flowRate","label":"Flow Rate (m3/hr)","type":"number","width":130},
    {"key":"waterQty","label":"Water Qty (M3/Valve)","type":"number","width":150},
    {"key":"frequency","label":"Frequency","type":"number","width":90},
    {"key":"dailyTotal","label":"Daily Total (m3)","type":"calculated","formula":"waterQty * frequency * valves","width":130},
    {"key":"totalFertilizer","label":"Total Fert (kg)","type":"calculated","formula":"sum of recipe fertilizers","width":130}
  ]
}'::jsonb
WHERE slug = 'fertigation-standard';

-- 3. Harvest Entry
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"harvestDate","label":"Harvest Date","type":"date","width":120},
    {"key":"field","label":"Field","type":"dropdown","options":"(site fields)","width":120},
    {"key":"variety","label":"Variety","type":"dropdown","options":"(crop varieties)","width":140},
    {"key":"quantity","label":"Quantity (kg)","type":"number","width":120},
    {"key":"grade","label":"Grade","type":"dropdown","options":"A,B,C,Reject","width":90},
    {"key":"notes","label":"Notes","type":"text","width":200},
    {"key":"totalQuantity","label":"Total Quantity","type":"calculated","formula":"sum(quantity)","width":130}
  ]
}'::jsonb
WHERE slug = 'harvest-standard';

-- 4. Planting & Transplant
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"seedingDate","label":"Seeding Date","type":"date","width":120},
    {"key":"fieldId","label":"Field ID (NH)","type":"dropdown","options":"(site fields)","width":120},
    {"key":"segment","label":"Segment (Bay)","type":"text","width":110},
    {"key":"totalArea","label":"Area","type":"number","width":80},
    {"key":"cropId","label":"Crop Name","type":"dropdown","options":"(crops)","width":120},
    {"key":"varietyId","label":"Variety","type":"dropdown","options":"(varieties)","width":130},
    {"key":"cropSubClass","label":"Sub Class","type":"text","width":100},
    {"key":"cropType","label":"Crop Type","type":"dropdown","options":"Seed,Seedling,Cutting,Graft","width":100},
    {"key":"breederId","label":"Breeder","type":"dropdown","options":"(breeders)","width":120},
    {"key":"lotBatchNo","label":"Lot/Batch No","type":"text","width":110},
    {"key":"pmQuantity","label":"Quantity","type":"number","width":90},
    {"key":"uom","label":"UOM","type":"dropdown","options":"Seeds,Trays,Pieces,Kg","width":80},
    {"key":"traysPerHec","label":"Trays/Hec","type":"number","width":90},
    {"key":"ratePerHec","label":"Rate/Hec","type":"number","width":90},
    {"key":"transplantDate","label":"Transplant Date","type":"date","width":130},
    {"key":"authorizedBy","label":"Authorized By","type":"text","width":120}
  ]
}'::jsonb
WHERE slug = 'planting-standard';

-- 5. Pesticide Applications
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"cropName","label":"Crop","type":"text","width":100},
    {"key":"fieldName","label":"Field","type":"text","width":90},
    {"key":"scoutingDate","label":"Scouting Date","type":"date","width":120},
    {"key":"justification","label":"Justification","type":"text","width":140},
    {"key":"percentSeen","label":"% Seen","type":"number","width":80},
    {"key":"applicationDate","label":"App. Date","type":"date","width":110},
    {"key":"applicationStartTime","label":"Start","type":"text","width":80},
    {"key":"applicationEndTime","label":"End","type":"text","width":80},
    {"key":"productName","label":"Name of PPP","type":"text","width":140},
    {"key":"activeIngredient","label":"Active Ingredient","type":"text","width":140},
    {"key":"dosage","label":"Dose/L","type":"number","width":80},
    {"key":"ratePerHa","label":"Rate/Ha","type":"number","width":90},
    {"key":"unitPrice","label":"Unit Price","type":"number","width":90},
    {"key":"cost","label":"Cost","type":"calculated","formula":"dosage * unitPrice","width":80},
    {"key":"uom","label":"UoM","type":"text","width":70},
    {"key":"totalQuantityApplied","label":"Total Qty","type":"number","width":90},
    {"key":"machineryUsed","label":"Machinery","type":"text","width":110},
    {"key":"phiDays","label":"PHI (days)","type":"number","width":80},
    {"key":"phiEndDate","label":"Clear Date","type":"calculated","formula":"applicationDate + phiDays","width":110},
    {"key":"weatherConditions","label":"Weather","type":"text","width":100},
    {"key":"operatorName","label":"Operator","type":"text","width":110},
    {"key":"verifiedBy","label":"Verified By","type":"text","width":110}
  ]
}'::jsonb
WHERE slug = 'pest-application';

-- 6. Scouting Reports
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"reportDate","label":"Date","type":"date","width":110},
    {"key":"fieldName","label":"Field","type":"text","width":100},
    {"key":"pestDisease","label":"Pest / Disease","type":"text","width":140},
    {"key":"infestationPct","label":"Infestation %","type":"number","width":110},
    {"key":"severity","label":"Severity","type":"dropdown","options":"Low,Medium,High,Critical","width":100},
    {"key":"status","label":"Status","type":"dropdown","options":"Open,In Progress,Resolved,Monitoring","width":110},
    {"key":"scoutName","label":"Scout","type":"text","width":120},
    {"key":"cropHeight","label":"Crop Height (cm)","type":"number","width":120},
    {"key":"soilCondition","label":"Soil Condition","type":"text","width":120},
    {"key":"weather","label":"Weather","type":"text","width":100},
    {"key":"notes","label":"Notes","type":"text","width":200}
  ]
}'::jsonb
WHERE slug = 'scouting-report';

-- 7. Biological Control
UPDATE form_templates SET columns_config = '{
  "sections": [
    {"key":"productGroup","label":"Product Columns (dynamic per field setup)"}
  ],
  "columns": [
    {"key":"weekNumber","label":"Week","type":"number","width":60},
    {"key":"weekDateRange","label":"Date Range","type":"calculated","formula":"week to date range","width":140},
    {"key":"productPerM2","label":"per m²","type":"number","width":80,"sectionId":"productGroup"},
    {"key":"productUnits","label":"# units","type":"number","width":80,"sectionId":"productGroup"}
  ]
}'::jsonb
WHERE slug = 'biological-control';

-- 8. Weather Log
UPDATE form_templates SET columns_config = '{
  "sections": [],
  "columns": [
    {"key":"date","label":"Date","type":"date","width":120},
    {"key":"site","label":"Site","type":"dropdown","options":"(organization sites)","width":130},
    {"key":"maxTemp","label":"Max Temp (°C)","type":"number","width":110},
    {"key":"minTemp","label":"Min Temp (°C)","type":"number","width":110},
    {"key":"avgTemp","label":"Avg Temp (°C)","type":"calculated","formula":"(maxTemp + minTemp) / 2","width":120},
    {"key":"avgRH","label":"Avg Humidity (%)","type":"number","width":120},
    {"key":"rainfall","label":"Rainfall (mm)","type":"number","width":110},
    {"key":"notes","label":"Notes","type":"text","width":200}
  ]
}'::jsonb
WHERE slug = 'weather-log';

-- 9. Manpower Records
UPDATE form_templates SET columns_config = '{
  "sections": [
    {"key":"activity1","label":"Activity 1"},
    {"key":"activity2","label":"Activity 2"},
    {"key":"activity3","label":"Activity 3"}
  ],
  "columns": [
    {"key":"recordDate","label":"Date","type":"date","width":110},
    {"key":"employeeId","label":"ID","type":"text","width":70},
    {"key":"workerName","label":"Employee Name","type":"text","width":150},
    {"key":"workerCategory","label":"Category","type":"dropdown","options":"Permanent,Temporary,Contract,Seasonal","width":110},
    {"key":"act1Activity","label":"Activity","type":"text","width":120,"sectionId":"activity1"},
    {"key":"act1Location","label":"Location","type":"text","width":100,"sectionId":"activity1"},
    {"key":"act1Start","label":"Start","type":"text","width":80,"sectionId":"activity1"},
    {"key":"act1End","label":"End","type":"text","width":80,"sectionId":"activity1"},
    {"key":"act1Hours","label":"Hours","type":"number","width":70,"sectionId":"activity1"},
    {"key":"act2Activity","label":"Activity","type":"text","width":120,"sectionId":"activity2"},
    {"key":"act2Location","label":"Location","type":"text","width":100,"sectionId":"activity2"},
    {"key":"act2Start","label":"Start","type":"text","width":80,"sectionId":"activity2"},
    {"key":"act2End","label":"End","type":"text","width":80,"sectionId":"activity2"},
    {"key":"act2Hours","label":"Hours","type":"number","width":70,"sectionId":"activity2"},
    {"key":"act3Activity","label":"Activity","type":"text","width":120,"sectionId":"activity3"},
    {"key":"act3Location","label":"Location","type":"text","width":100,"sectionId":"activity3"},
    {"key":"act3Start","label":"Start","type":"text","width":80,"sectionId":"activity3"},
    {"key":"act3End","label":"End","type":"text","width":80,"sectionId":"activity3"},
    {"key":"act3Hours","label":"Hours","type":"number","width":70,"sectionId":"activity3"},
    {"key":"totalHours","label":"Total Hours","type":"calculated","formula":"sum of activity hours","width":100}
  ]
}'::jsonb
WHERE slug = 'manpower-entry';
