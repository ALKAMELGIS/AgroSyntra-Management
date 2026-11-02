-- Enhanced Role Hierarchy System
-- CEO > Farm Manager > Operation Manager > Agronomist/Worker

-- Update users table to support new roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));

-- Update existing roles: admin -> ceo, manager -> farm_manager
UPDATE users SET role = 'ceo' WHERE role = 'admin';
UPDATE users SET role = 'farm_manager' WHERE role = 'manager';

-- User-Site assignments (Farm Manager and Operation Manager level)
CREATE TABLE IF NOT EXISTS user_site_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, site_id)
);

-- User-Farm Area assignments (for more granular control)
CREATE TABLE IF NOT EXISTS user_farm_area_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_area_id UUID NOT NULL REFERENCES farm_areas(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, farm_area_id)
);

-- User-Field assignments (Worker/Agronomist level)
CREATE TABLE IF NOT EXISTS user_field_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, field_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_site_assignments_user ON user_site_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_site_assignments_site ON user_site_assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_user_farm_area_assignments_user ON user_farm_area_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_farm_area_assignments_farm_area ON user_farm_area_assignments(farm_area_id);
CREATE INDEX IF NOT EXISTS idx_user_field_assignments_user ON user_field_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_field_assignments_field ON user_field_assignments(field_id);

-- View to get user's accessible sites (including through hierarchy)
CREATE OR REPLACE VIEW user_accessible_sites AS
SELECT DISTINCT
    u.id as user_id,
    s.id as site_id,
    s.name as site_name,
    CASE 
        WHEN u.role = 'ceo' THEN 'full'
        WHEN usa.id IS NOT NULL THEN 'assigned'
        ELSE 'none'
    END as access_type
FROM users u
CROSS JOIN sites s
LEFT JOIN user_site_assignments usa ON usa.user_id = u.id AND usa.site_id = s.id
WHERE u.role = 'ceo' OR usa.id IS NOT NULL;

-- View to get user's accessible farm areas
CREATE OR REPLACE VIEW user_accessible_farm_areas AS
SELECT DISTINCT
    u.id as user_id,
    fa.id as farm_area_id,
    fa.name as farm_area_name,
    fa.site_id,
    CASE 
        WHEN u.role = 'ceo' THEN 'full'
        WHEN u.role IN ('farm_manager', 'operation_manager') AND usa.id IS NOT NULL THEN 'site_access'
        WHEN ufa.id IS NOT NULL THEN 'assigned'
        ELSE 'none'
    END as access_type
FROM users u
CROSS JOIN farm_areas fa
LEFT JOIN user_site_assignments usa ON usa.user_id = u.id AND usa.site_id = fa.site_id
LEFT JOIN user_farm_area_assignments ufa ON ufa.user_id = u.id AND ufa.farm_area_id = fa.id
WHERE u.role = 'ceo' 
   OR usa.id IS NOT NULL 
   OR ufa.id IS NOT NULL;

-- View to get user's accessible fields
CREATE OR REPLACE VIEW user_accessible_fields AS
SELECT DISTINCT
    u.id as user_id,
    f.id as field_id,
    f.name as field_name,
    f.farm_area_id,
    fa.site_id,
    CASE 
        WHEN u.role = 'ceo' THEN 'full'
        WHEN u.role IN ('farm_manager', 'operation_manager') AND usa.id IS NOT NULL THEN 'site_access'
        WHEN ufa.id IS NOT NULL THEN 'farm_area_access'
        WHEN uff.id IS NOT NULL THEN 'assigned'
        ELSE 'none'
    END as access_type
FROM users u
CROSS JOIN fields f
JOIN farm_areas fa ON f.farm_area_id = fa.id
LEFT JOIN user_site_assignments usa ON usa.user_id = u.id AND usa.site_id = fa.site_id
LEFT JOIN user_farm_area_assignments ufa ON ufa.user_id = u.id AND ufa.farm_area_id = f.farm_area_id
LEFT JOIN user_field_assignments uff ON uff.user_id = u.id AND uff.field_id = f.id
WHERE u.role = 'ceo' 
   OR usa.id IS NOT NULL 
   OR ufa.id IS NOT NULL 
   OR uff.id IS NOT NULL;
