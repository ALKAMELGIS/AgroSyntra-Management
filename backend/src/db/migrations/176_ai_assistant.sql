-- 176: AI assistant conversations.
-- The assistant reads the system's own database through server-side tools that
-- apply the user's organisation and site access. Only the conversation itself
-- is stored here; no business data is copied.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL DEFAULT 'New chat',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL DEFAULT '',
  artifacts       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- tables / charts shown with the answer
  sources         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- forms (FORM_ID) the answer was read from
  tool_calls      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- which tools ran, with their inputs (audit)
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id, created_at);
