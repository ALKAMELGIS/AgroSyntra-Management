-- Move qty_of_water, cycle, total_water_qty to per-valve level
ALTER TABLE ecph_valve_readings ADD COLUMN IF NOT EXISTS qty_of_water DECIMAL(10, 3);
ALTER TABLE ecph_valve_readings ADD COLUMN IF NOT EXISTS cycle INT;
ALTER TABLE ecph_valve_readings ADD COLUMN IF NOT EXISTS total_water_qty DECIMAL(10, 3);
