-- Link cost entries to IPM activities for traceability
ALTER TABLE cost_entries ADD COLUMN IF NOT EXISTS ipm_application_id UUID;

-- Add 'biological' category for bio control costs
ALTER TABLE cost_entries DROP CONSTRAINT IF EXISTS cost_entries_category_check;
ALTER TABLE cost_entries ADD CONSTRAINT cost_entries_category_check
  CHECK (category IN ('fertilizer', 'labor', 'water', 'equipment', 'seed', 'pesticide', 'biological', 'other'));

CREATE INDEX IF NOT EXISTS idx_cost_entries_ipm ON cost_entries (ipm_application_id);
