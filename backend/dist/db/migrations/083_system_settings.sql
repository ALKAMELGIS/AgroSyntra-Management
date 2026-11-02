-- Migration 083: System settings table for admin-configurable keys (AI providers, etc.)

CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO system_settings (key, value) VALUES
  ('ai_provider', 'anthropic'),
  ('ai_model', 'claude-sonnet-4-20250514')
ON CONFLICT (key) DO NOTHING;
