-- Migration 087: Question Bank for lessons
-- Pre-generated pool of quiz questions per lesson, with tracking of seen questions per student.

CREATE TABLE IF NOT EXISTS lesson_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_question_bank_lesson ON lesson_question_bank(lesson_id);

CREATE TABLE IF NOT EXISTS student_seen_questions (
  student_id UUID NOT NULL REFERENCES users(id),
  question_id UUID NOT NULL REFERENCES lesson_question_bank(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, question_id)
);
