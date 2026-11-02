-- Scouting reports: labeled multi-segment variety strings can exceed 100 chars.
ALTER TABLE scouting_reports
  ALTER COLUMN variety TYPE VARCHAR(500);
