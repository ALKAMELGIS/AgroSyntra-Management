-- Migration 077: Internship Training Platform
-- Adds intern_student and intern_teacher roles, and all training LMS tables.

-- 1. Extend user roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'worker', 'intern_student', 'intern_teacher'));

-- 2. Training modules (seeded below)
CREATE TABLE IF NOT EXISTS training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  icon VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Lessons within modules
CREATE TABLE IF NOT EXISTS training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  duration_minutes INT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_lessons_module ON training_lessons(module_id);

-- 4. Quizzes (practice or graded)
CREATE TABLE IF NOT EXISTS training_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  quiz_type VARCHAR(20) NOT NULL CHECK (quiz_type IN ('practice', 'graded')),
  time_limit_minutes INT,
  pass_percentage INT NOT NULL DEFAULT 70,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_quizzes_module ON training_quizzes(module_id);

-- 5. Questions within quizzes
CREATE TABLE IF NOT EXISTS training_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES training_quizzes(id) ON DELETE CASCADE,
  question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('mcq', 'true_false')),
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_questions_quiz ON training_questions(quiz_id);

-- 6. Student quiz attempts
CREATE TABLE IF NOT EXISTS training_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES training_quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),
  answers JSONB NOT NULL DEFAULT '{}',
  score INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_training_attempts_student ON training_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_training_attempts_quiz ON training_attempts(quiz_id);

-- 7. Lesson progress tracking
CREATE TABLE IF NOT EXISTS training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  lesson_id UUID REFERENCES training_lessons(id) ON DELETE CASCADE,
  module_id UUID REFERENCES training_modules(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_training_progress_student ON training_progress(student_id);

-- 8. AI Tutor chat history
CREATE TABLE IF NOT EXISTS training_ai_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  module_id UUID REFERENCES training_modules(id),
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_ai_chats_student ON training_ai_chats(student_id);

-- 9. Seed the 6 training modules
INSERT INTO training_modules (title, description, sort_order, icon) VALUES
  ('Fertigation Management',
   'Fertiliser calculation for fertigation programmes, acid dosing, pH correction, chemical compatibility, safety precautions, and correct mixing sequences.',
   1, 'Science'),
  ('Harvest Operations',
   'Harvest techniques per crop type, post-harvest handling from field to packhouse, PHI compliance, optimum timing indicators, and grading standards.',
   2, 'Agriculture'),
  ('Integrated Pest Management (IPM)',
   'Safety and PPE, pest and disease biology, application procedures, global audit standards, trapping methods, biological control agents, bumblebee pollination, and systematic scouting.',
   3, 'BugReport'),
  ('EC & pH Monitoring',
   'Measurement techniques for EC and pH in irrigation water and substrate, drainage percentage calculation, diagnosing crop problems, corrective actions, and crop-specific target ranges.',
   4, 'Opacity'),
  ('Packhouse Operations',
   'Sanitation protocols, food safety rules, packaging procedures (grading, weighing, labelling), Brix testing, logistics flow, cold chain management, and temperature/humidity requirements.',
   5, 'Inventory2'),
  ('Farm Maintenance',
   'Identifying and repairing irrigation leaks, nozzle and dripper maintenance, maintaining clean work areas, tool storage, and equipment sanitation procedures.',
   6, 'Build')
ON CONFLICT DO NOTHING;
