-- Manpower cost: hourly rates, effective-dated.
-- Two kinds of row:
--   group rate    — worker_id IS NULL: rate for every Casual / Permanent worker of a site
--   personal rate — worker_id set: replaces the group rate for that worker.
--                   rate_per_hour NULL = "back on the group rate" from effective_from.
-- Work done on a day uses the row with the latest effective_from <= that day.
-- Rows are never updated: a change inserts a new row, a correction soft-deletes the old
-- one (deleted_at / deleted_by), so the table is its own history.

CREATE TABLE IF NOT EXISTS manpower_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  site_id UUID REFERENCES sites(id),
  category VARCHAR(20),
  worker_id UUID REFERENCES workers(id),
  rate_per_hour NUMERIC(10,2),
  effective_from DATE NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT manpower_rates_rate_check CHECK (rate_per_hour IS NULL OR rate_per_hour >= 0),
  CONSTRAINT manpower_rates_kind_check CHECK (
    (worker_id IS NULL AND site_id IS NOT NULL AND category IN ('Casual', 'Permanent') AND rate_per_hour IS NOT NULL)
    OR (worker_id IS NOT NULL AND site_id IS NULL AND category IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_manpower_rates_group
  ON manpower_rates (organization_id, site_id, category, effective_from)
  WHERE worker_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_manpower_rates_worker
  ON manpower_rates (worker_id, effective_from)
  WHERE worker_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manpower_rates_org
  ON manpower_rates (organization_id)
  WHERE deleted_at IS NULL;
