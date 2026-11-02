-- Migration 053: widen bed/column/bay/valve columns so scouting reports
-- can hold multiple codes per report (stored as comma-separated strings).

ALTER TABLE scouting_reports
  ALTER COLUMN bed_code    TYPE VARCHAR(255),
  ALTER COLUMN column_code TYPE VARCHAR(255),
  ALTER COLUMN bay_code    TYPE VARCHAR(255),
  ALTER COLUMN valve_code  TYPE VARCHAR(255);
