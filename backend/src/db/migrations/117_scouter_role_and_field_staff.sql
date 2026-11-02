-- Migration 117: Scouter role + field staff (PIN login, worker-user link)

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist',
    'scouter', 'worker', 'operator', 'intern_student', 'intern_teacher', 'auditor'
  ));

ALTER TABLE workers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_user_id ON workers(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(200);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
