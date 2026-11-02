-- Migration 170: zone assignments for farm managers.
--
-- The CEO assigns a farm manager to one or more zones (the `countries` table).
-- A farm manager can reach every site inside an assigned zone, plus any site
-- assigned to them directly in user_site_assignments.

CREATE TABLE IF NOT EXISTS user_zone_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, country_id)
);

CREATE INDEX IF NOT EXISTS idx_user_zone_assignments_user
    ON user_zone_assignments (user_id);
