-- Add optional weather condition and irrigation status to EC/PH entries
ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS weather_condition VARCHAR(100);
ALTER TABLE ecph_entries ADD COLUMN IF NOT EXISTS irrigation_status VARCHAR(255);
