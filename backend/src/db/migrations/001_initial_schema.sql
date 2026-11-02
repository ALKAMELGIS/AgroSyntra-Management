-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS is optional - skip if not available
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- Countries
CREATE TABLE IF NOT EXISTS countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Sites
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id UUID NOT NULL REFERENCES countries(id),
    name VARCHAR(255) NOT NULL,
    location TEXT,
    total_area DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(country_id, name)
);

-- Farm Areas
CREATE TABLE IF NOT EXISTS farm_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id),
    name VARCHAR(255) NOT NULL,
    size DECIMAL(10, 2),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(site_id, name)
);

-- Crops
CREATE TABLE IF NOT EXISTS crops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    dripper_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Field Types
CREATE TABLE IF NOT EXISTS field_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    naming_pattern VARCHAR(50),
    default_valve_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fields
CREATE TABLE IF NOT EXISTS fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_area_id UUID NOT NULL REFERENCES farm_areas(id),
    field_type_id UUID REFERENCES field_types(id),
    name VARCHAR(100) NOT NULL,
    current_crop_id UUID REFERENCES crops(id),
    valve_count INT DEFAULT 0,
    area DECIMAL(10, 2),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    polygon JSONB, -- GeoJSON polygon (PostGIS not required)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(farm_area_id, name)
);

-- Crop History (tracks rotation)
CREATE TABLE IF NOT EXISTS crop_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    crop_id UUID NOT NULL REFERENCES crops(id),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Valves
CREATE TABLE IF NOT EXISTS valves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    number INT NOT NULL,
    name VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(field_id, number)
);

-- Farm Area Crops (many-to-many)
CREATE TABLE IF NOT EXISTS farm_area_crops (
    farm_area_id UUID NOT NULL REFERENCES farm_areas(id),
    crop_id UUID NOT NULL REFERENCES crops(id),
    PRIMARY KEY (farm_area_id, crop_id)
);

-- Recipes
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    tank_volume DECIMAL(10, 2),
    cycles INT,
    element_ppm JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe Fertilizers
CREATE TABLE IF NOT EXISTS recipe_fertilizers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    dose DECIMAL(10, 4),
    kg_per_liter DECIMAL(10, 4),
    element VARCHAR(10),
    concentration DECIMAL(5, 2)
);

-- Harvests
CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    date DATE NOT NULL,
    total_quantity DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Harvest Varieties
CREATE TABLE IF NOT EXISTS harvest_varieties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    variety VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    grade VARCHAR(10)
);

-- Fertigation Entries
CREATE TABLE IF NOT EXISTS fertigation_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    recipe_id UUID REFERENCES recipes(id),
    date DATE NOT NULL,
    week_number INT,
    flow_rate DECIMAL(10, 2),
    frequency INT,
    valves_count INT,
    daily_water DECIMAL(10, 2),
    fertilizers JSONB,
    total_fertilizer DECIMAL(10, 2),
    cumulative JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EC/PH Entries
CREATE TABLE IF NOT EXISTS ecph_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id),
    date DATE NOT NULL,
    time TIME,
    qty_of_water DECIMAL(10, 2),
    cycle INT,
    total_water_qty DECIMAL(10, 2),
    field_total_water_based_on_drip DECIMAL(10, 2),
    dripper_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EC/PH Valve Readings
CREATE TABLE IF NOT EXISTS ecph_valve_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ecph_entry_id UUID NOT NULL REFERENCES ecph_entries(id) ON DELETE CASCADE,
    valve_number INT NOT NULL,
    drip_volume DECIMAL(10, 4),
    ec DECIMAL(6, 2),
    ph DECIMAL(4, 2),
    drain DECIMAL(10, 2),
    percent_drain DECIMAL(5, 2),
    total_water_based_on_drip DECIMAL(10, 2)
);

-- Weather Cache (stores fetched weather data)
CREATE TABLE IF NOT EXISTS weather_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    date DATE NOT NULL,
    data JSONB NOT NULL,
    source VARCHAR(50) NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(latitude, longitude, date, source)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fields_farm_area ON fields(farm_area_id) WHERE deleted_at IS NULL;
-- PostGIS index not needed with JSONB polygon
-- CREATE INDEX IF NOT EXISTS idx_fields_polygon ON fields USING GIST(polygon);
CREATE INDEX IF NOT EXISTS idx_harvests_field_date ON harvests(field_id, date);
CREATE INDEX IF NOT EXISTS idx_fertigation_field_date ON fertigation_entries(field_id, date);
CREATE INDEX IF NOT EXISTS idx_ecph_field_date ON ecph_entries(field_id, date);
CREATE INDEX IF NOT EXISTS idx_weather_cache_location ON weather_cache(latitude, longitude, date);
