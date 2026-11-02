-- Granular per-user module permissions
-- Allows managers to grant specific users access beyond their role defaults
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
  granted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_module ON user_permissions(module);
