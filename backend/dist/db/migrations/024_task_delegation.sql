-- Task delegation: parent/child tasks for hierarchical task assignment
-- Operation Manager -> Team Leader -> Workers

-- Add parent task reference and delegation fields
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegated_by UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegated_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_leader_id UUID REFERENCES users(id);

-- Index for querying sub-tasks
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team_leader ON tasks (team_leader_id);
CREATE INDEX IF NOT EXISTS idx_tasks_delegated_by ON tasks (delegated_by);

-- Team leader assignments table (which workers belong to which team leader)
CREATE TABLE IF NOT EXISTS team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_leader_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_leader_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_team_assignments_leader ON team_assignments (team_leader_id);
CREATE INDEX IF NOT EXISTS idx_team_assignments_worker ON team_assignments (worker_id);
CREATE INDEX IF NOT EXISTS idx_team_assignments_org ON team_assignments (organization_id);
