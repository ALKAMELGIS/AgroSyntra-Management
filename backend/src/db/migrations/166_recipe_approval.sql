-- Fertigation recipes need approval by the operations manager before use.
-- New recipes start as 'draft'. Every recipe that already exists is backfilled
-- to 'approved' so current fertigation entries, groups and imports keep working.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_status_check'
  ) THEN
    ALTER TABLE recipes
      ADD CONSTRAINT recipes_status_check CHECK (status IN ('draft', 'approved'));
  END IF;
END $$;

-- Backfill: everything that existed before this migration counts as approved.
UPDATE recipes
SET status = 'approved',
    approved_at = COALESCE(approved_at, NOW())
WHERE status <> 'approved';

CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
