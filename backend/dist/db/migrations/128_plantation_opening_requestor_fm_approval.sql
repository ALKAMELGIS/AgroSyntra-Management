-- Plantation opening: requestor name + farm manager approval

ALTER TABLE plantation_opening_records
  ADD COLUMN IF NOT EXISTS requestor_name TEXT,
  ADD COLUMN IF NOT EXISTS farm_manager_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS farm_manager_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS farm_manager_approved_by UUID REFERENCES users(id);

ALTER TABLE plantation_closing_records
  ADD COLUMN IF NOT EXISTS requestor_name TEXT;
