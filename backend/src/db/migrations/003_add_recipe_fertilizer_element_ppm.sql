ALTER TABLE recipe_fertilizers
  ADD COLUMN IF NOT EXISTS element_ppm JSONB;
