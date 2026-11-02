-- Inventory Management: items and transaction ledger

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('fertilizer', 'pesticide', 'biological', 'seed', 'packaging', 'other')),
  unit VARCHAR(30) NOT NULL DEFAULT 'kg',
  min_stock_level NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'AED',
  supplier VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'usage', 'adjustment', 'return')),
  quantity NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_inventory_items_low_stock ON inventory_items(current_stock, min_stock_level) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON inventory_transactions(date);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_ref ON inventory_transactions(reference_type, reference_id);
