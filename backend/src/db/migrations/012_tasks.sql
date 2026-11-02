-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    task_type VARCHAR(50) NOT NULL DEFAULT 'general',  -- irrigation, fertilization, harvesting, spraying, maintenance, inspection, general
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',     -- low, medium, high, urgent
    status VARCHAR(20) NOT NULL DEFAULT 'todo',          -- todo, in_progress, done, cancelled
    assigned_to UUID REFERENCES users(id),
    assigned_by UUID REFERENCES users(id),
    field_id UUID REFERENCES fields(id) ON DELETE SET NULL,
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Task checklists
CREATE TABLE IF NOT EXISTS task_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    item VARCHAR(500) NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMP WITH TIME ZONE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_field ON tasks(field_id);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);
CREATE INDEX idx_task_checklists_task ON task_checklists(task_id);
