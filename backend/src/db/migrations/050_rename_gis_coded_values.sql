-- Migration 050: Rename GIS coded values to human-readable names
-- Uses DO blocks to safely handle UNIQUE constraint conflicts

-- ── Rename farm_areas from Structure_Type codes to real names ──
-- Skip if target name already exists under the same site
DO $$
DECLARE
  code_map RECORD;
BEGIN
  FOR code_map IN
    SELECT unnest(ARRAY['1000','1001','1002','1003','1004','1005','1006','1007']) AS code,
           unnest(ARRAY['Greenhouse','Nethouse','Glasshouse','Retractable Roof Houses','Cravo','Dates Farm','PIVOT','Farm Plots']) AS label
  LOOP
    UPDATE farm_areas fa
    SET name = code_map.label, updated_at = NOW()
    WHERE fa.name = code_map.code
      AND NOT EXISTS (
        SELECT 1 FROM farm_areas fa2
        WHERE fa2.site_id = fa.site_id AND fa2.name = code_map.label AND fa2.id != fa.id
      );
  END LOOP;
END $$;

-- ── Rename field_types from Structure_Type codes to real names ──
-- Skip if target name already exists
DO $$
DECLARE
  code_map RECORD;
BEGIN
  FOR code_map IN
    SELECT unnest(ARRAY['1000','1001','1002','1003','1004','1005','1006','1007']) AS code,
           unnest(ARRAY['Greenhouse','Nethouse','Glasshouse','Retractable Roof Houses','Cravo','Dates Farm','PIVOT','Farm Plots']) AS label
  LOOP
    UPDATE field_types
    SET name = code_map.label, updated_at = NOW()
    WHERE name = code_map.code
      AND NOT EXISTS (SELECT 1 FROM field_types WHERE name = code_map.label);
  END LOOP;
END $$;

-- ── Rename sites from plain numbers to "Site N" format ──
DO $$
DECLARE
  s RECORD;
  new_name TEXT;
BEGIN
  FOR s IN SELECT id, name, country_id FROM sites WHERE name ~ '^\d+$' AND name NOT LIKE 'Site %'
  LOOP
    new_name := 'Site ' || s.name;
    IF NOT EXISTS (SELECT 1 FROM sites WHERE country_id = s.country_id AND name = new_name AND id != s.id) THEN
      UPDATE sites SET name = new_name, updated_at = NOW() WHERE id = s.id;
    END IF;
  END LOOP;
END $$;
