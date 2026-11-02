-- Bio products catalog (master list imported from Excel "products" sheet)
CREATE TABLE IF NOT EXISTS bio_products_catalog (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_code       VARCHAR(50) NOT NULL,
    item_name       TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, item_code)
);
CREATE INDEX IF NOT EXISTS idx_bio_products_catalog_org ON bio_products_catalog(organization_id);
CREATE INDEX IF NOT EXISTS idx_bio_products_catalog_code ON bio_products_catalog(item_code);
CREATE INDEX IF NOT EXISTS idx_bio_products_catalog_name ON bio_products_catalog USING gin(to_tsvector('simple', item_name));

-- Per-field header metadata for a crop+year biological control record
CREATE TABLE IF NOT EXISTS bio_record_field_setup (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id  UUID REFERENCES organizations(id),
    field_id         UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    crop_id          UUID NOT NULL REFERENCES crops(id),
    year             INT NOT NULL,
    surface_m2       NUMERIC,
    plants_per_m2    NUMERIC,
    number_of_plants INT,
    start_week       INT DEFAULT 1,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(field_id, crop_id, year)
);
CREATE INDEX IF NOT EXISTS idx_bio_record_field_setup_org ON bio_record_field_setup(organization_id);
CREATE INDEX IF NOT EXISTS idx_bio_record_field_setup_crop ON bio_record_field_setup(crop_id, year);

-- Products assigned as columns to a specific field setup
CREATE TABLE IF NOT EXISTS bio_record_field_products (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_setup_id     UUID NOT NULL REFERENCES bio_record_field_setup(id) ON DELETE CASCADE,
    product_catalog_id UUID REFERENCES bio_products_catalog(id),
    item_code          VARCHAR(50),
    product_name       TEXT NOT NULL,
    per_package        INT,
    price_per_package  NUMERIC,
    sort_order         INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bio_record_field_products_setup ON bio_record_field_products(field_setup_id);

-- Weekly entry data (one row per field+week+product)
CREATE TABLE IF NOT EXISTS bio_record_entries (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_setup_id    UUID NOT NULL REFERENCES bio_record_field_setup(id) ON DELETE CASCADE,
    product_column_id UUID NOT NULL REFERENCES bio_record_field_products(id) ON DELETE CASCADE,
    week_number       INT NOT NULL CHECK (week_number >= 1 AND week_number <= 53),
    per_m2            NUMERIC,
    units             NUMERIC,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(field_setup_id, product_column_id, week_number)
);
CREATE INDEX IF NOT EXISTS idx_bio_record_entries_setup ON bio_record_entries(field_setup_id);
CREATE INDEX IF NOT EXISTS idx_bio_record_entries_product ON bio_record_entries(product_column_id);
