-- RC-241 Nursery Sowing Record (separate from combined planting_records transplant rows)

CREATE TABLE IF NOT EXISTS nursery_sowing_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id                   UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  seeding_date              DATE NOT NULL,
  crop_id                   UUID REFERENCES crops(id) ON DELETE SET NULL,
  variety_id                UUID REFERENCES crop_varieties(id) ON DELETE SET NULL,
  seed_batch                VARCHAR(255),
  breeder_id                UUID REFERENCES breeders(id) ON DELETE SET NULL,
  seeds_per_cell            DECIMAL(12, 4),
  tray_type                 VARCHAR(50),
  tray_count                DECIMAL(12, 2),
  growing_media_brand       VARCHAR(255),
  media_components          JSONB NOT NULL DEFAULT '{}',
  seedling_count            DECIMAL(14, 2),
  germination_pct           DECIMAL(8, 4),
  ready_to_transplant_date  DATE,
  release_date              DATE,
  seedlings_planted         DECIMAL(14, 2),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nursery_sowing_records_site
  ON nursery_sowing_records(site_id);

CREATE INDEX IF NOT EXISTS idx_nursery_sowing_records_org
  ON nursery_sowing_records(organization_id);

CREATE INDEX IF NOT EXISTS idx_nursery_sowing_records_seeding_date
  ON nursery_sowing_records(seeding_date DESC);

ALTER TABLE planting_records
  ADD COLUMN IF NOT EXISTS sowing_record_id UUID REFERENCES nursery_sowing_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planting_records_sowing_record
  ON planting_records(sowing_record_id);
