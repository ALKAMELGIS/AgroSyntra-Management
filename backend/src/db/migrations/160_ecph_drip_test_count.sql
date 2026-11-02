-- Persist crop grow-bag test drip count on the EC/pH entry (same pattern as dripper_count).
ALTER TABLE ecph_entries
  ADD COLUMN IF NOT EXISTS drip_test_count INT;

-- Old rows: only fill when dripper_count uniquely maps to one crops.drip_test_count.
UPDATE ecph_entries e
SET drip_test_count = sub.test_count
FROM (
  SELECT dripper_count, MIN(drip_test_count) AS test_count
  FROM crops
  WHERE dripper_count IS NOT NULL
    AND dripper_count > 0
    AND drip_test_count IS NOT NULL
    AND drip_test_count > 0
  GROUP BY dripper_count
  HAVING COUNT(DISTINCT drip_test_count) = 1
) sub
WHERE e.drip_test_count IS NULL
  AND e.dripper_count IS NOT NULL
  AND e.dripper_count = sub.dripper_count;
