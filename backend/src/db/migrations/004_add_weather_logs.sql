CREATE TABLE IF NOT EXISTS weather_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_id UUID REFERENCES countries(id),
    site_id UUID NOT NULL REFERENCES sites(id),
    field_id UUID REFERENCES fields(id),
    date DATE NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    max_temp DECIMAL(5, 2),
    min_temp DECIMAL(5, 2),
    avg_temp DECIMAL(5, 2),
    feels_like DECIMAL(5, 2),
    avg_rh DECIMAL(5, 2),
    rainfall DECIMAL(7, 2),
    pressure DECIMAL(7, 2),
    wind_speed DECIMAL(7, 2),
    wind_direction DECIMAL(7, 2),
    clouds DECIMAL(5, 2),
    description TEXT,
    source VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_logs_site_date ON weather_logs(site_id, date);
CREATE INDEX IF NOT EXISTS idx_weather_logs_field_date ON weather_logs(field_id, date);
