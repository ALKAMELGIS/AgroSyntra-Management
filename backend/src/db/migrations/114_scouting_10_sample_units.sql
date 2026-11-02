-- Migration 114: Extend scouting observations from 5 to 10 sample points per row

ALTER TABLE scouting_observations
  ADD COLUMN IF NOT EXISTS count_6  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS count_7  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS count_8  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS count_9  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS count_10 NUMERIC(10,2);
