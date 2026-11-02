-- GIS auto-link used to insert countries, sites, and fields without
-- organization_id. The fields list filters on that column, so those rows
-- vanished even though farm_areas (scoped via sites) still showed up.
-- Stamp leftover NULLs so existing greenhouses appear.

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Al Maha Farm', 'al-maha-farm')
ON CONFLICT (slug) DO NOTHING;

-- Countries: copy from a site that already has an org, else GIS layer, else default org.
UPDATE countries c
SET organization_id = src.organization_id
FROM (
  SELECT DISTINCT ON (s.country_id) s.country_id, s.organization_id
    FROM sites s
   WHERE s.organization_id IS NOT NULL
   ORDER BY s.country_id, s.updated_at DESC NULLS LAST
) src
WHERE c.id = src.country_id
  AND c.organization_id IS NULL;

UPDATE countries
SET organization_id = (
  SELECT gl.organization_id FROM gis_layers gl
   WHERE gl.organization_id IS NOT NULL
   ORDER BY gl.created_at ASC
   LIMIT 1
)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM gis_layers WHERE organization_id IS NOT NULL);

UPDATE countries
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Sites: inherit from country, else default org.
UPDATE sites s
SET organization_id = c.organization_id
FROM countries c
WHERE s.country_id = c.id
  AND s.organization_id IS NULL
  AND c.organization_id IS NOT NULL;

UPDATE sites
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- Fields: inherit from the site that owns their farm area.
UPDATE fields f
SET organization_id = s.organization_id
FROM farm_areas fa
JOIN sites s ON s.id = fa.site_id
WHERE f.farm_area_id = fa.id
  AND f.organization_id IS NULL
  AND s.organization_id IS NOT NULL;

UPDATE fields
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;
