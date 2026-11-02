-- Cost entries table
CREATE TABLE IF NOT EXISTS cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES fields(id),
  category VARCHAR(50) NOT NULL CHECK (category IN ('fertilizer', 'labor', 'water', 'equipment', 'seed', 'pesticide', 'other')),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'AED',
  description TEXT,
  date DATE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost targets / budgets
CREATE TABLE IF NOT EXISTS cost_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES fields(id),
  crop_id UUID REFERENCES crops(id),
  season VARCHAR(20), -- e.g., '2025-Q1'
  target_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'AED',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_field ON cost_entries (field_id);
CREATE INDEX IF NOT EXISTS idx_cost_entries_category ON cost_entries (category);
CREATE INDEX IF NOT EXISTS idx_cost_entries_date ON cost_entries (date);
CREATE INDEX IF NOT EXISTS idx_cost_targets_field ON cost_targets (field_id);
