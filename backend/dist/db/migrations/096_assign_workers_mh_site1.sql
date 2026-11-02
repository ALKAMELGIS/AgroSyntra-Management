-- Assign all manpower workers to zone MH / Site 1 (idempotent)

DO $$
DECLARE
  target_site_id UUID;
  updated_count INT;
BEGIN
  SELECT s.id INTO target_site_id
  FROM sites s
  JOIN countries c ON c.id = s.country_id
  WHERE lower(trim(c.code)) = 'mh'
    AND lower(trim(s.name)) = 'site 1'
    AND s.deleted_at IS NULL
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF target_site_id IS NULL THEN
    SELECT id INTO target_site_id
    FROM sites
    WHERE lower(trim(name)) = 'site 1'
      AND deleted_at IS NULL
    LIMIT 1;
    RAISE NOTICE 'MH Site 1 not found; using first Site 1 in any zone (id=%)', target_site_id;
  END IF;

  IF target_site_id IS NULL THEN
    RAISE NOTICE 'No Site 1 found; skipping worker site assignment';
    RETURN;
  END IF;

  UPDATE workers SET site_id = target_site_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Assigned % workers to site_id %', updated_count, target_site_id;
END $$;
