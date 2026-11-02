-- Re-seed RC-132 fertilizer trade names from Excel (18 names, all organizations)

DO $$
DECLARE
  org UUID;
  fert_name TEXT;
  fert_names TEXT[] := ARRAY[
    'Amino Acids',
    'Ammonium Sulphate',
    'Bio Gibb',
    'Calcium Nitrate',
    'DAP',
    'MKP',
    'Magnesium Sulphate',
    'Mycorheza',
    'NPK (18-18-18)',
    'Phosphoric Acid',
    'Potassium Nitrate',
    'SOLFOMAX',
    'Solfomax',
    'SOP',
    'TPT Zinc Sulphate',
    'Trace Element',
    'Urea',
    'ZN- Edta'
  ];
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    FOREACH fert_name IN ARRAY fert_names LOOP
      IF NOT EXISTS (
        SELECT 1 FROM fertilizer_products
        WHERE organization_id IS NOT DISTINCT FROM org
          AND LOWER(TRIM(name)) = LOWER(TRIM(fert_name))
      ) THEN
        INSERT INTO fertilizer_products (organization_id, name)
        VALUES (org, fert_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
