-- Add soft delete support for manpower_records and recipes
ALTER TABLE manpower_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_manpower_records_deleted ON manpower_records(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_deleted ON recipes(deleted_at) WHERE deleted_at IS NULL;
