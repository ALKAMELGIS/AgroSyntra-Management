-- Junction table for linking quizzes to multiple lessons
CREATE TABLE IF NOT EXISTS training_quiz_lessons (
  quiz_id UUID NOT NULL REFERENCES training_quizzes(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  PRIMARY KEY (quiz_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_training_quiz_lessons_quiz ON training_quiz_lessons(quiz_id);
CREATE INDEX IF NOT EXISTS idx_training_quiz_lessons_lesson ON training_quiz_lessons(lesson_id);

-- Migrate existing single lesson_id links
INSERT INTO training_quiz_lessons (quiz_id, lesson_id)
SELECT id, lesson_id FROM training_quizzes WHERE lesson_id IS NOT NULL
ON CONFLICT DO NOTHING;
