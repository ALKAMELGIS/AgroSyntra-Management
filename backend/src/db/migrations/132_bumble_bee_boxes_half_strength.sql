-- Count of on-field boxes kept at ~50% bee strength after a visit (each still counts as 1 physical box).

ALTER TABLE bumble_bee_deployments
  ADD COLUMN IF NOT EXISTS boxes_at_half_strength INTEGER NOT NULL DEFAULT 0
  CHECK (boxes_at_half_strength >= 0);

UPDATE bumble_bee_deployments
SET boxes_at_half_strength = 0
WHERE boxes_at_half_strength IS NULL;
