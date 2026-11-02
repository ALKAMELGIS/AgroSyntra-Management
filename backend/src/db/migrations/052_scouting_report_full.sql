-- Migration 052: Extend scouting reports to match paper template (EAG/AFO/IWS/RC-105)
-- Adds header / environment fields, per-pest observation rows with 5 sample counts,
-- growth stage measurements, and weekly insect trap card readings.

-- ─── 1) Extend scouting_reports with header / environment fields ──

ALTER TABLE scouting_reports
  ADD COLUMN IF NOT EXISTS report_time       TIME,
  ADD COLUMN IF NOT EXISTS crop_name         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS variety           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS area_variety      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS density_per_area  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS crop_height       NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS soil_condition    VARCHAR(20)   -- 'wet' | 'dry'
    CHECK (soil_condition IS NULL OR soil_condition IN ('wet','dry')),
  ADD COLUMN IF NOT EXISTS weather           VARCHAR(20)   -- 'sunny' | 'cloudy' | 'rainy'
    CHECK (weather IS NULL OR weather IN ('sunny','cloudy','rainy')),
  ADD COLUMN IF NOT EXISTS wind              VARCHAR(20)   -- 'none' | 'light' | 'strong'
    CHECK (wind IS NULL OR wind IN ('none','light','strong')),
  ADD COLUMN IF NOT EXISTS bed_code          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS column_code       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bay_code          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS valve_code        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS side              VARCHAR(20)   -- 'fan' | 'wet_pad'
    CHECK (side IS NULL OR side IN ('fan','wet_pad')),
  ADD COLUMN IF NOT EXISTS previous_report_id UUID REFERENCES scouting_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comments          TEXT;

-- ─── 2) Abbreviation column on pest catalog (for paper-form shorthand) ──

ALTER TABLE pest_disease_catalog
  ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(10);

-- Back-fill abbreviations for existing seed rows (match paper form EAG/AFO/IWS/RC-105)
UPDATE pest_disease_catalog SET abbreviation = 'T'  WHERE name = 'Thrips'            AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'A'  WHERE name = 'Aphids'            AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'L'  WHERE name = 'Leaf Miner'        AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'TA' WHERE name = 'Tuta Absoluta'     AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'EB' WHERE name = 'Early Blight'      AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'LB' WHERE name = 'Late Blight'       AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'DW' WHERE name = 'Downy Mildew'      AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'B'  WHERE name = 'Botrytis (Gray Mold)' AND abbreviation IS NULL;
UPDATE pest_disease_catalog SET abbreviation = 'F'  WHERE name = 'Fusarium Wilt'     AND abbreviation IS NULL;

-- Add paper-form rows that don't exist yet
INSERT INTO pest_disease_catalog (name, category, description, abbreviation, is_custom, organization_id) VALUES
  ('Mite Adult',       'pest',    'Spider mite adult stage',      'MA', false, '00000000-0000-0000-0000-000000000001'),
  ('Mite Larva',       'pest',    'Spider mite larval stage',     'ML', false, '00000000-0000-0000-0000-000000000001'),
  ('Mite Egg',         'pest',    'Spider mite eggs',             'ME', false, '00000000-0000-0000-0000-000000000001'),
  ('Whitefly Adult',   'pest',    'Bemisia tabaci adult stage',   'WA', false, '00000000-0000-0000-0000-000000000001'),
  ('Whitefly Egg',     'pest',    'Bemisia tabaci eggs',          'WE', false, '00000000-0000-0000-0000-000000000001'),
  ('Worm',             'pest',    'Caterpillar / worm larvae',    'W',  false, '00000000-0000-0000-0000-000000000001'),
  ('Anthracnose',      'disease', 'Colletotrichum spp.',          'An', false, '00000000-0000-0000-0000-000000000001'),
  ('Bacterial Blight', 'disease', 'Xanthomonas-family blight',    'BL', false, '00000000-0000-0000-0000-000000000001'),
  ('Phytium',          'disease', 'Pythium spp. root/stem rot',   'P',  false, '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ─── 3) Scouting observations (one row per pest/disease × 5 sample points) ──

CREATE TABLE IF NOT EXISTS scouting_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scouting_report_id UUID NOT NULL REFERENCES scouting_reports(id) ON DELETE CASCADE,
  pest_disease_id    UUID REFERENCES pest_disease_catalog(id),
  pest_name          VARCHAR(200) NOT NULL,
  category           VARCHAR(20)  NOT NULL CHECK (category IN ('insect','disease')),
  sampling_unit      VARCHAR(100),
  sampling_method    VARCHAR(200),
  count_1            NUMERIC(10,2),
  count_2            NUMERIC(10,2),
  count_3            NUMERIC(10,2),
  count_4            NUMERIC(10,2),
  count_5            NUMERIC(10,2),
  total              NUMERIC(10,2),
  average            NUMERIC(10,2),
  percent            NUMERIC(5,2),  -- disease % (nullable for insects)
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scouting_obs_report   ON scouting_observations (scouting_report_id);
CREATE INDEX IF NOT EXISTS idx_scouting_obs_pest     ON scouting_observations (pest_disease_id);
CREATE INDEX IF NOT EXISTS idx_scouting_obs_category ON scouting_observations (category);

-- ─── 4) Growth stage measurements (one-to-one per report) ──

CREATE TABLE IF NOT EXISTS scouting_growth_stage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scouting_report_id UUID NOT NULL UNIQUE REFERENCES scouting_reports(id) ON DELETE CASCADE,
  number_of_trusses  NUMERIC(6,2),
  number_of_stems    NUMERIC(6,2),
  stem_thickness     NUMERIC(6,2),   -- mm
  avg_fruit_weight   NUMERIC(6,2),   -- g
  fruits_per_plant   NUMERIC(6,2),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5) Insect trap cards (weekly reading, many per report) ──

CREATE TABLE IF NOT EXISTS scouting_trap_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scouting_report_id UUID NOT NULL REFERENCES scouting_reports(id) ON DELETE CASCADE,
  card_number   INTEGER NOT NULL,
  insect_type   VARCHAR(50),   -- 'whitefly' | 'thrips' | 'tuta' | other
  trap_location VARCHAR(200),
  monday        INTEGER,
  tuesday       INTEGER,
  wednesday     INTEGER,
  thursday      INTEGER,
  friday        INTEGER,
  saturday      INTEGER,
  sunday        INTEGER,
  total         INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scouting_traps_report ON scouting_trap_cards (scouting_report_id);
CREATE INDEX IF NOT EXISTS idx_scouting_traps_card   ON scouting_trap_cards (scouting_report_id, card_number);
