-- Backfill organization_id on IPM and operational tables from fields/sites chain.
-- Ensures tenant-scoped reads work even when row-level org column was never set.

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Al Maha Farm', 'al-maha-farm')
ON CONFLICT (slug) DO NOTHING;

-- IPM tables (columns from 023/025/064/079/060/086/089)
ALTER TABLE pesticide_applications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_pesticide_apps_org ON pesticide_applications(organization_id);

ALTER TABLE scouting_reports ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_scouting_org ON scouting_reports(organization_id);

ALTER TABLE bio_control_releases ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_bio_releases_org ON bio_control_releases(organization_id);

ALTER TABLE bumble_bee_deployments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_bumble_bees_org ON bumble_bee_deployments(organization_id);

ALTER TABLE spray_work_orders ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_swo_org ON spray_work_orders(organization_id);

ALTER TABLE planting_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_planting_records_org ON planting_records(organization_id);

ALTER TABLE open_field_planting ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_ofp_org ON open_field_planting(organization_id);

ALTER TABLE germination_sections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_germ_sections_org ON germination_sections(organization_id);

ALTER TABLE germination_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_germ_records_org ON germination_records(organization_id);

DO $$
BEGIN
  IF to_regclass('public.fertilizer_application_records') IS NOT NULL THEN
    ALTER TABLE fertilizer_application_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    CREATE INDEX IF NOT EXISTS idx_fert_app_records_org ON fertilizer_application_records(organization_id);
  END IF;
END $$;

-- Backfill from fields
UPDATE pesticide_applications pa
SET organization_id = f.organization_id
FROM fields f
WHERE pa.field_id = f.id AND pa.organization_id IS NULL;

UPDATE scouting_reports sr
SET organization_id = f.organization_id
FROM fields f
WHERE sr.field_id = f.id AND sr.organization_id IS NULL;

UPDATE bio_control_releases br
SET organization_id = f.organization_id
FROM fields f
WHERE br.field_id = f.id AND br.organization_id IS NULL;

UPDATE bumble_bee_deployments bb
SET organization_id = f.organization_id
FROM fields f
WHERE bb.field_id = f.id AND bb.organization_id IS NULL;

UPDATE planting_records pr
SET organization_id = f.organization_id
FROM fields f
WHERE pr.field_id = f.id AND pr.organization_id IS NULL;

UPDATE open_field_planting ofp
SET organization_id = f.organization_id
FROM fields f
WHERE ofp.field_id = f.id AND ofp.organization_id IS NULL;

UPDATE germination_records gr
SET organization_id = gs.organization_id
FROM germination_sections gs
WHERE gr.section_id = gs.id AND gr.organization_id IS NULL AND gs.organization_id IS NOT NULL;

-- Backfill from sites
UPDATE spray_work_orders wo
SET organization_id = s.organization_id
FROM sites s
WHERE wo.site_id = s.id AND wo.organization_id IS NULL;

UPDATE germination_sections gs
SET organization_id = s.organization_id
FROM sites s
WHERE gs.site_id = s.id AND gs.organization_id IS NULL;

DO $$
BEGIN
  IF to_regclass('public.fertilizer_application_records') IS NOT NULL THEN
    UPDATE fertilizer_application_records r
    SET organization_id = s.organization_id
    FROM sites s
    WHERE r.site_id = s.id AND r.organization_id IS NULL;
  END IF;
END $$;

-- Remaining NULLs default to Al Maha org (legacy data)
UPDATE pesticide_applications SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE scouting_reports SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE bio_control_releases SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE bumble_bee_deployments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE spray_work_orders SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE planting_records SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE open_field_planting SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE germination_sections SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE germination_records SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

DO $$
BEGIN
  IF to_regclass('public.fertilizer_application_records') IS NOT NULL THEN
    UPDATE fertilizer_application_records SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
  END IF;
END $$;
