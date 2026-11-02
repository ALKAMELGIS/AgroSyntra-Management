-- Plantation Opening / Closing workbook (RC-001)

INSERT INTO form_templates (slug, name, category, description, icon, route_path, is_system, columns_config)
SELECT 'plantation-opening-closing', 'Plantation Opening / Closing', 'planting',
       'RC-001 opening request (all crops) and per-crop closing sheets', 'Yard',
       '/admin/crop-history?tab=plantation-workbook', TRUE,
       '{"workbook":"plantation-rc001"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM form_templates WHERE slug = 'plantation-opening-closing');

CREATE TABLE IF NOT EXISTS plantation_closing_sheets (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id  UUID REFERENCES organizations(id),
    site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    crop_id          UUID NOT NULL REFERENCES crops(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (site_id, crop_id)
);

CREATE INDEX IF NOT EXISTS idx_plantation_closing_sheets_site ON plantation_closing_sheets(site_id);

CREATE TABLE IF NOT EXISTS plantation_opening_records (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id      UUID REFERENCES organizations(id),
    site_id              UUID REFERENCES sites(id),
    requested_date       DATE,
    site_code            TEXT,
    fiscal_year          INT,
    structure_type       TEXT,
    farm_name            TEXT,
    field_id             UUID REFERENCES fields(id),
    section              TEXT,
    crop_id              UUID REFERENCES crops(id),
    variety_id           UUID REFERENCES crop_varieties(id),
    plants_or_kg         DECIMAL(14,2),
    surface_unit         TEXT,
    surface_area         DECIMAL(14,4),
    budgeted             TEXT,
    remarks              TEXT,
    requestor_role       TEXT,
    requestor_endorsed   TEXT,
    farm_manager_name    TEXT,
    farm_manager_date    DATE,
    plantation_code      TEXT,
    crop_history_id      UUID REFERENCES crop_history(id),
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plantation_opening_site ON plantation_opening_records(site_id);
CREATE INDEX IF NOT EXISTS idx_plantation_opening_crop ON plantation_opening_records(crop_id);

CREATE TABLE IF NOT EXISTS plantation_closing_records (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id          UUID REFERENCES organizations(id),
    closing_sheet_id         UUID NOT NULL REFERENCES plantation_closing_sheets(id) ON DELETE CASCADE,
    requested_date           DATE,
    site_code                TEXT,
    fiscal_year              INT,
    structure_type           TEXT,
    farm_name                TEXT,
    field_id                 UUID REFERENCES fields(id),
    section                  TEXT,
    crop_id                  UUID REFERENCES crops(id),
    variety_id               UUID REFERENCES crop_varieties(id),
    plants_or_kg             DECIMAL(14,2),
    surface_unit             TEXT,
    surface_area             DECIMAL(14,4),
    budgeted                 TEXT,
    remarks                  TEXT,
    requestor_role           TEXT,
    requestor_endorsed       TEXT,
    finance_endorsed         TEXT,
    finance_name             TEXT,
    finance_added_date       DATE,
    sage_created_date        DATE,
    sage_created_by          TEXT,
    plantation_code          TEXT,
    plantation_description   TEXT,
    closure_request_date     DATE,
    closure_request_by       TEXT,
    closure_fm_endorsed      TEXT,
    closure_fm_name          TEXT,
    closure_hoo_endorsed     TEXT,
    closure_hoo_name         TEXT,
    closure_finance_endorsed TEXT,
    closure_finance_name     TEXT,
    closed_date              DATE,
    sage_closed_by           TEXT,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plantation_closing_records_sheet ON plantation_closing_records(closing_sheet_id);
