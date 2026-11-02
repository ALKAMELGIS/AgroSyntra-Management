-- Generic entity comments table
CREATE TABLE IF NOT EXISTS entity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- 'harvest', 'field', 'fertigation', 'ecph'
  entity_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_comments_entity ON entity_comments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_comments_user ON entity_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_entity_comments_created ON entity_comments (created_at DESC);
