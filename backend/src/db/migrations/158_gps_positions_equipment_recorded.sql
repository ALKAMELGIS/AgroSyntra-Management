-- Day trails and last-position lookups need equipment + time together.
CREATE INDEX IF NOT EXISTS idx_gps_positions_equipment_recorded
  ON gps_positions (equipment_id, recorded_at DESC);
