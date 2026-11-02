-- Soft delete support for user accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Allow re-registration after soft delete
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS idx_users_email_active;
CREATE UNIQUE INDEX idx_users_email_active ON users (LOWER(email)) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NULL;
