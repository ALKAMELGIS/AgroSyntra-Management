-- Summary & Contents page (manager meeting / prototype overview)

CREATE TABLE IF NOT EXISTS app_summary_content (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  intro_text TEXT NOT NULL,
  closing_text TEXT NOT NULL,
  summary_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  contents_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
