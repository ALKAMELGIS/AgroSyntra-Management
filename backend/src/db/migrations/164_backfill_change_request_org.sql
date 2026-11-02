-- Migration 164: give every change request an organization.
-- Legacy rows were saved without organization_id, so they showed in the review list but not
-- in the badge, and multi-row pesticide deletes could not be approved. The list and the
-- review now filter on organization_id, so fill it from the best source available.

-- 1. The snapshot of the record taken when the request was made.
UPDATE ipm_change_requests
SET organization_id = (snapshot_before->>'organization_id')::uuid
WHERE organization_id IS NULL
  AND snapshot_before->>'organization_id' ~* '^[0-9a-f-]{36}$';

-- 2. The live record (pesticide application, or its field).
UPDATE ipm_change_requests cr
SET organization_id = COALESCE(pa.organization_id, f.organization_id)
FROM pesticide_applications pa
LEFT JOIN fields f ON f.id = pa.field_id
WHERE cr.organization_id IS NULL
  AND cr.entity_type = 'pesticide_application'
  AND pa.id = cr.entity_id
  AND COALESCE(pa.organization_id, f.organization_id) IS NOT NULL;

UPDATE ipm_change_requests cr
SET organization_id = bi.organization_id
FROM bumble_bee_box_inspections bi
WHERE cr.organization_id IS NULL
  AND cr.entity_type = 'bumble_bee_box_inspection'
  AND bi.id = cr.entity_id;

-- 3. The organization of the user who asked.
UPDATE ipm_change_requests cr
SET organization_id = u.organization_id
FROM users u
WHERE cr.organization_id IS NULL
  AND u.id = cr.requested_by
  AND u.organization_id IS NOT NULL;

-- 4. Anything left is legacy Al Maha data (same fallback as migration 112).
UPDATE ipm_change_requests
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001');

CREATE INDEX IF NOT EXISTS idx_ipm_change_requests_org_status
  ON ipm_change_requests(organization_id, status);
