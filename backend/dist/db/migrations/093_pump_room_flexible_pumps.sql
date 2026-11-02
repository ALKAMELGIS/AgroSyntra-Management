-- Per-site pump count config + flexible pumps JSONB on electricity/water records

CREATE TABLE IF NOT EXISTS site_pump_room_config (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  water_pump_count INT NOT NULL DEFAULT 2 CHECK (water_pump_count >= 1 AND water_pump_count <= 10),
  electricity_pump_count INT NOT NULL DEFAULT 2 CHECK (electricity_pump_count >= 1 AND electricity_pump_count <= 10),
  water_pump_labels JSONB NOT NULL DEFAULT '["Pump 1", "Pump 2"]'::jsonb,
  electricity_pump_labels JSONB NOT NULL DEFAULT '["Pump 1", "Pump 2"]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pump_room_electricity ADD COLUMN IF NOT EXISTS pumps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS pumps JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Water: align with electricity column layout for dual-write compatibility
ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS reading_1 NUMERIC;
ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS usage_1 NUMERIC;
ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS reading_2 NUMERIC;
ALTER TABLE pump_room_water ADD COLUMN IF NOT EXISTS usage_2 NUMERIC;

-- Migrate legacy water single-pump rows -> pumps JSONB
UPDATE pump_room_water
SET pumps = jsonb_build_array(
  jsonb_build_object('reading', reading, 'usage', usage_amount)
)
WHERE pumps = '[]'::jsonb
  AND (reading IS NOT NULL OR usage_amount IS NOT NULL);

UPDATE pump_room_water
SET reading_1 = (pumps->0->>'reading')::numeric,
    usage_1 = (pumps->0->>'usage')::numeric
WHERE jsonb_array_length(pumps) >= 1;

UPDATE pump_room_water
SET reading_2 = (pumps->1->>'reading')::numeric,
    usage_2 = (pumps->1->>'usage')::numeric
WHERE jsonb_array_length(pumps) >= 2;

-- Migrate existing electricity rows (reading_1/reading_2 -> pumps array)
UPDATE pump_room_electricity
SET pumps = (
  SELECT COALESCE(jsonb_agg(p ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('reading', reading_1, 'usage', usage_1) AS p, 1 AS ord
    WHERE reading_1 IS NOT NULL OR usage_1 IS NOT NULL
    UNION ALL
    SELECT jsonb_build_object('reading', reading_2, 'usage', usage_2), 2
    WHERE reading_2 IS NOT NULL OR usage_2 IS NOT NULL
  ) sub
)
WHERE pumps = '[]'::jsonb
  AND (reading_1 IS NOT NULL OR usage_1 IS NOT NULL OR reading_2 IS NOT NULL OR usage_2 IS NOT NULL);

-- Water: drop legacy single-pump columns if present (tab was never shipped)
ALTER TABLE pump_room_water DROP COLUMN IF EXISTS reading;
ALTER TABLE pump_room_water DROP COLUMN IF EXISTS usage_amount;
ALTER TABLE pump_room_water DROP COLUMN IF EXISTS unit;
