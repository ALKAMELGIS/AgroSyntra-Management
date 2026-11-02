ALTER TABLE recipe_fertilizers
  ADD COLUMN IF NOT EXISTS tank_volume DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS quantity_per_1000l DECIMAL(10, 4);
