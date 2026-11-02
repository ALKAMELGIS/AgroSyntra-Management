-- Migration 035: Fix crop_varieties seed data
-- Link existing varieties to correct crops and rename to user-friendly names

DO $$ 
DECLARE
  v_tomato_id UUID;
  v_capsicum_id UUID;
BEGIN
  SELECT id INTO v_tomato_id FROM crops WHERE LOWER(name) = 'tomato' LIMIT 1;
  SELECT id INTO v_capsicum_id FROM crops WHERE LOWER(name) = 'capsicum' LIMIT 1;

  -- Remove orphan varieties that don't belong to either crop
  DELETE FROM crop_varieties WHERE name IN ('Sweet Corn', 'Fig', 'All Crop');

  -- Update existing varieties: link to crop and rename
  IF v_tomato_id IS NOT NULL THEN
    UPDATE crop_varieties SET name = 'Table', crop_id = v_tomato_id, updated_at = NOW()
      WHERE name = 'SV4129TH';
    UPDATE crop_varieties SET name = 'Bunch', crop_id = v_tomato_id, updated_at = NOW()
      WHERE name = 'Botero F1';
    UPDATE crop_varieties SET name = 'Plum', crop_id = v_tomato_id, updated_at = NOW()
      WHERE name = 'Empres (CLX37373) F1';
    UPDATE crop_varieties SET name = 'Beef', crop_id = v_tomato_id, updated_at = NOW()
      WHERE name = 'Elpida F1';

    -- Insert if any of the above didn't exist
    INSERT INTO crop_varieties (crop_id, name)
      SELECT v_tomato_id, v.n FROM (VALUES ('Plum'),('Beef'),('Bunch'),('Table')) AS v(n)
      WHERE NOT EXISTS (SELECT 1 FROM crop_varieties WHERE crop_id = v_tomato_id AND name = v.n);
  END IF;

  IF v_capsicum_id IS NOT NULL THEN
    UPDATE crop_varieties SET name = 'Yellow', crop_id = v_capsicum_id, updated_at = NOW()
      WHERE name = 'Sven RZ';
    UPDATE crop_varieties SET name = 'Red', crop_id = v_capsicum_id, updated_at = NOW()
      WHERE name = 'Marletta F1';
    UPDATE crop_varieties SET name = 'Orange', crop_id = v_capsicum_id, updated_at = NOW()
      WHERE name = 'Arancia RZ';

    INSERT INTO crop_varieties (crop_id, name)
      SELECT v_capsicum_id, v.n FROM (VALUES ('Yellow'),('Green'),('Red'),('Orange')) AS v(n)
      WHERE NOT EXISTS (SELECT 1 FROM crop_varieties WHERE crop_id = v_capsicum_id AND name = v.n);
  END IF;

  -- Clean up any remaining varieties with NULL crop_id
  DELETE FROM crop_varieties WHERE crop_id IS NULL;
END $$;
