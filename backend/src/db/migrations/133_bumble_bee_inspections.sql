-- Scouter box-strength inspections (separate from deployment visit log).

ALTER TABLE bumble_bee_deployments
  DROP COLUMN IF EXISTS boxes_at_half_strength;

CREATE TABLE IF NOT EXISTS bumble_bee_box_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  inspection_date DATE NOT NULL,
  boxes_100 INTEGER NOT NULL DEFAULT 0 CHECK (boxes_100 >= 0),
  boxes_80 INTEGER NOT NULL DEFAULT 0 CHECK (boxes_80 >= 0),
  boxes_60 INTEGER NOT NULL DEFAULT 0 CHECK (boxes_60 >= 0),
  boxes_40 INTEGER NOT NULL DEFAULT 0 CHECK (boxes_40 >= 0),
  boxes_20 INTEGER NOT NULL DEFAULT 0 CHECK (boxes_20 >= 0),
  boxes_0 INTEGER NOT NULL DEFAULT 0 CHECK (boxes_0 >= 0),
  total_boxes INTEGER NOT NULL CHECK (total_boxes >= 0),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bumble_bee_box_inspections_field_date
  ON bumble_bee_box_inspections(field_id, inspection_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bumble_bee_box_inspections_org
  ON bumble_bee_box_inspections(organization_id);
