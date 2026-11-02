CREATE TABLE IF NOT EXISTS training_lesson_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT
);
CREATE INDEX IF NOT EXISTS idx_lesson_visits_student ON training_lesson_visits(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_visits_lesson ON training_lesson_visits(lesson_id);

ALTER TABLE training_progress ADD COLUMN IF NOT EXISTS total_time_seconds INT DEFAULT 0;
ALTER TABLE training_progress ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 1;
