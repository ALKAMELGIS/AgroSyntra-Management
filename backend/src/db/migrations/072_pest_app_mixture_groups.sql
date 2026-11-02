-- Add mixture group support to pesticide_applications

ALTER TABLE pesticide_applications
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS is_mixture_child BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pest_apps_group ON pesticide_applications(group_id);
