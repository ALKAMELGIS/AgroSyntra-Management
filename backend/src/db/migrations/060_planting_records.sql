-- Mark fields that serve as nursery homes
ALTER TABLE fields ADD COLUMN IF NOT EXISTS is_nursery BOOLEAN DEFAULT FALSE;

-- Planting & transplant records (mirrors the Seeding / Transplanting Report Excel)
CREATE TABLE IF NOT EXISTS planting_records (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id  UUID REFERENCES organizations(id),
    seeding_date     DATE NOT NULL,
    field_id         UUID REFERENCES fields(id),
    segment          TEXT,
    total_area       TEXT,
    crop_id          UUID REFERENCES crops(id),
    variety_id       UUID REFERENCES crop_varieties(id),
    crop_sub_class   VARCHAR(100),
    crop_type        VARCHAR(100) DEFAULT 'Annual',
    breeder          VARCHAR(255),
    lot_batch_no     VARCHAR(255),
    pm_quantity      DECIMAL(12,2),
    uom              VARCHAR(50),
    trays_per_hec    VARCHAR(50),
    rate_per_hec     VARCHAR(50),
    transplant_date  DATE,
    authorized_by    VARCHAR(255),
    crop_history_id  UUID REFERENCES crop_history(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planting_records_field ON planting_records(field_id);
CREATE INDEX IF NOT EXISTS idx_planting_records_org   ON planting_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_planting_records_dates ON planting_records(seeding_date, transplant_date);
