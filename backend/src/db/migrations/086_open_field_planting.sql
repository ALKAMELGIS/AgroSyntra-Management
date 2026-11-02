-- Add breeder link to varieties (one breeder -> many varieties)
ALTER TABLE crop_varieties ADD COLUMN IF NOT EXISTS breeder_id UUID REFERENCES breeders(id);

-- Open field planting table (12 columns from Excel)
CREATE TABLE IF NOT EXISTS open_field_planting (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id  UUID REFERENCES organizations(id),
    seeding_date     DATE NOT NULL,
    field_id         UUID REFERENCES fields(id),
    segment          TEXT,
    total_area       TEXT,
    crop_id          UUID REFERENCES crops(id),
    variety_id       UUID REFERENCES crop_varieties(id),
    crop_type        VARCHAR(100) DEFAULT 'Annual',
    breeder_id       UUID REFERENCES breeders(id),
    lot_batch_no     VARCHAR(255),
    quantity         DECIMAL(12,2),
    uom              VARCHAR(50),
    authorized_by    VARCHAR(255),
    crop_history_id  UUID REFERENCES crop_history(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ofp_field ON open_field_planting(field_id);
CREATE INDEX IF NOT EXISTS idx_ofp_org ON open_field_planting(organization_id);
CREATE INDEX IF NOT EXISTS idx_ofp_dates ON open_field_planting(seeding_date);
