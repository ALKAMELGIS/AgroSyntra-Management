-- File attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity VARCHAR(50) NOT NULL,          -- e.g. 'harvest', 'fertigation', 'ecph', 'field'
    entity_id UUID NOT NULL,
    filename VARCHAR(500) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    url TEXT NOT NULL,                     -- S3 URL or local path
    storage_key TEXT NOT NULL,             -- S3 key or local filename
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_attachments_entity ON attachments(entity, entity_id);
CREATE INDEX idx_attachments_uploaded_by ON attachments(uploaded_by);
CREATE INDEX idx_attachments_created_at ON attachments(created_at DESC);
