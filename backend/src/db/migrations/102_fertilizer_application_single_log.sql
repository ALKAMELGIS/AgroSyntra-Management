-- RC-132: one continuous log per site (matches Excel — single Fertilization sheet, not monthly tabs)

CREATE TABLE IF NOT EXISTS fertilizer_application_workbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  farm_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'fertilizer_application_month_sheets'
  ) THEN
    ALTER TABLE fertilizer_application_records
      ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

    UPDATE fertilizer_application_records r
    SET site_id = s.site_id
    FROM fertilizer_application_month_sheets s
    WHERE r.month_sheet_id = s.id AND r.site_id IS NULL;

    INSERT INTO fertilizer_application_workbooks (site_id, farm_name)
    SELECT DISTINCT ON (site_id) site_id, farm_name
    FROM fertilizer_application_month_sheets
    ORDER BY site_id, updated_at DESC
    ON CONFLICT (site_id) DO NOTHING;

    ALTER TABLE fertilizer_application_records
      DROP CONSTRAINT IF EXISTS fertilizer_application_records_month_sheet_id_fkey;
    ALTER TABLE fertilizer_application_records DROP COLUMN IF EXISTS month_sheet_id;

    DROP TABLE IF EXISTS fertilizer_application_month_sheets;
  END IF;
END $$;

ALTER TABLE fertilizer_application_records
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

ALTER TABLE fertilizer_application_records
  DROP CONSTRAINT IF EXISTS fertilizer_application_records_month_sheet_id_fkey;
ALTER TABLE fertilizer_application_records DROP COLUMN IF EXISTS month_sheet_id;

CREATE INDEX IF NOT EXISTS idx_fert_app_records_site_date
  ON fertilizer_application_records (site_id, date);

DROP INDEX IF EXISTS idx_fert_app_records_sheet;
DROP INDEX IF EXISTS idx_fert_app_month_sheets_site_year;
