-- Persist which Reference inner sheet a row belongs to (built-in id or custom name).

ALTER TABLE manpower_activity_references
  ADD COLUMN IF NOT EXISTS sheet VARCHAR(80);
