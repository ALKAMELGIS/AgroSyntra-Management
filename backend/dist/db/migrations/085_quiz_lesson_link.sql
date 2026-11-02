ALTER TABLE training_quizzes ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES training_lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_training_quizzes_lesson ON training_quizzes(lesson_id);
