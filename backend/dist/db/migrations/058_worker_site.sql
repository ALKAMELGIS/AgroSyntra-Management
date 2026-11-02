-- Add site assignment to workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS idx_workers_site ON workers(site_id);
