-- Optional RC-111 Week Number on harvest rows (separate from shift_number).
ALTER TABLE harvests
  ADD COLUMN IF NOT EXISTS week_number VARCHAR(20);
