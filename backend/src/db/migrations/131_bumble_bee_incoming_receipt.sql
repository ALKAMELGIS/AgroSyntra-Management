-- Incoming order receipt snapshots and explicit order date

ALTER TABLE bumble_bee_incoming_orders
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS quantity_received INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_on_hand_before INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_on_hand_after INTEGER;

UPDATE bumble_bee_incoming_orders
SET order_date = COALESCE(order_date, (created_at AT TIME ZONE 'UTC')::date)
WHERE order_date IS NULL;

UPDATE bumble_bee_incoming_orders
SET quantity_received = quantity_expected
WHERE status = 'received' AND quantity_received IS NULL;

ALTER TABLE bumble_bee_incoming_orders
  ALTER COLUMN order_date SET DEFAULT CURRENT_DATE;

UPDATE bumble_bee_incoming_orders SET order_date = CURRENT_DATE WHERE order_date IS NULL;
