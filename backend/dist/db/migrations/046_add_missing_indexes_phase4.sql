-- Phase 4: Add missing indexes for frequently queried columns
-- These address query patterns found during the performance audit

-- ecph_valve_readings: FK column used in JOINs, WHERE, and bulk lookups
CREATE INDEX IF NOT EXISTS idx_ecph_valve_readings_entry_id
  ON ecph_valve_readings (ecph_entry_id);

-- alert_rules: entity_type filter combined with is_active
CREATE INDEX IF NOT EXISTS idx_alert_rules_entity_type_active
  ON alert_rules (entity_type) WHERE is_active = true;

-- inventory_transactions: item + created_at for ordered history queries
CREATE INDEX IF NOT EXISTS idx_inv_tx_item_created
  ON inventory_transactions (item_id, created_at DESC);

-- inventory_items: LOWER(name) + category for deductByName lookups
CREATE INDEX IF NOT EXISTS idx_inv_items_lower_name_cat
  ON inventory_items (LOWER(name), category) WHERE is_active = true;

-- workers: category filter used in manpower list queries
CREATE INDEX IF NOT EXISTS idx_workers_category
  ON workers (category);

-- gis_layers: ordering pattern used in list queries
CREATE INDEX IF NOT EXISTS idx_gis_layers_order
  ON gis_layers (layer_order ASC, created_at DESC);

-- shifts: composite for date-range + user/field filter queries
CREATE INDEX IF NOT EXISTS idx_shifts_user_date
  ON shifts (user_id, date);

CREATE INDEX IF NOT EXISTS idx_shifts_field_date
  ON shifts (field_id, date);
