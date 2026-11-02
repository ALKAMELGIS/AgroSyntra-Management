-- Pivot/forage harvest fields: cut number, baling date, bales, dispatch tracking
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}'::jsonb;
