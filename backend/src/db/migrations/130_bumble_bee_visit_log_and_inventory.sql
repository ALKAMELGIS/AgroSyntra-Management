-- Bumble bee visit log columns + per-site inventory and incoming orders

ALTER TABLE bumble_bee_deployments
  ADD COLUMN IF NOT EXISTS boxes_before INTEGER,
  ADD COLUMN IF NOT EXISTS boxes_removed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boxes_added INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_count_total INTEGER;

UPDATE bumble_bee_deployments
SET
  boxes_added = COALESCE(box_count, 0),
  boxes_before = COALESCE(boxes_before, 0),
  boxes_removed = COALESCE(boxes_removed, 0),
  box_count_total = COALESCE(box_count_total, box_count, 0)
WHERE box_count_total IS NULL;

ALTER TABLE bumble_bee_deployments
  ALTER COLUMN box_count_total SET DEFAULT 0;

UPDATE bumble_bee_deployments SET box_count_total = 0 WHERE box_count_total IS NULL;

CREATE TABLE IF NOT EXISTS bumble_bee_site_inventory (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bumble_bee_site_inventory_org ON bumble_bee_site_inventory(organization_id);

CREATE TABLE IF NOT EXISTS bumble_bee_incoming_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  quantity_expected INTEGER NOT NULL CHECK (quantity_expected > 0),
  expected_delivery_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'received', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bumble_bee_incoming_site_status ON bumble_bee_incoming_orders(site_id, status);

CREATE TABLE IF NOT EXISTS bumble_bee_inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  delta INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  reference_id UUID,
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bumble_bee_inv_adj_site ON bumble_bee_inventory_adjustments(site_id, created_at DESC);
