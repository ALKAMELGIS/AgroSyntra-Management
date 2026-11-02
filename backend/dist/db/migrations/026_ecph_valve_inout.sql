-- Add EC In and pH In columns to valve readings (previously only stored EC Out / pH Out)
ALTER TABLE ecph_valve_readings ADD COLUMN IF NOT EXISTS ec_in DECIMAL(6, 2);
ALTER TABLE ecph_valve_readings ADD COLUMN IF NOT EXISTS ph_in DECIMAL(4, 2);

-- Add drip test count per crop (number of emitters sampled per grow bag test)
-- e.g., Tomato=12, Capsicum=15, Sweet Corn=5
ALTER TABLE crops ADD COLUMN IF NOT EXISTS drip_test_count INT;
