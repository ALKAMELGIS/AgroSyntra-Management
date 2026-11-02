CREATE TABLE IF NOT EXISTS breeders (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL UNIQUE,
    country    VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE planting_records ADD COLUMN IF NOT EXISTS breeder_id UUID REFERENCES breeders(id);
