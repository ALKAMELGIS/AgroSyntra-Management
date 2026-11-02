import { dbPool } from '../db/client';

// ─── Modules ──────────────────────────────────────────────────────
export async function listModules(studentId?: string) {
  const modules = await dbPool.query(
    `SELECT m.*,
       (SELECT COUNT(*) FROM training_lessons l WHERE l.module_id = m.id) AS lesson_count,
       (SELECT COUNT(*) FROM training_quizzes q WHERE q.module_id = m.id AND q.is_active = true) AS quiz_count
     FROM training_modules m WHERE m.is_active = true ORDER BY m.sort_order`
  );

  if (studentId) {
    for (const m of modules.rows) {
      const prog = await dbPool.query(
        `SELECT COUNT(*) FROM training_progress WHERE student_id = $1 AND module_id = $2`,
        [studentId, m.id]
      );
      m.completed_lessons = Number(prog.rows[0].count);
    }
  }
  return modules.rows;
}

export async function getModule(moduleId: string) {
  const res = await dbPool.query('SELECT * FROM training_modules WHERE id = $1', [moduleId]);
  return res.rows[0] || null;
}

export async function getCompletedLessonIds(studentId: string, moduleId: string): Promise<string[]> {
  const res = await dbPool.query(
    'SELECT lesson_id FROM training_progress WHERE student_id = $1 AND module_id = $2',
    [studentId, moduleId]
  );
  return res.rows.map((r: any) => r.lesson_id);
}

// ─── Lessons ──────────────────────────────────────────────────────
export async function listLessons(moduleId: string) {
  const res = await dbPool.query(
    'SELECT * FROM training_lessons WHERE module_id = $1 ORDER BY sort_order', [moduleId]
  );
  return res.rows;
}

export async function getLesson(lessonId: string) {
  const res = await dbPool.query('SELECT * FROM training_lessons WHERE id = $1', [lessonId]);
  return res.rows[0] || null;
}

export async function createLesson(data: { moduleId: string; title: string; content: string; sortOrder?: number; durationMinutes?: number; createdBy?: string }) {
  const res = await dbPool.query(
    `INSERT INTO training_lessons (module_id, title, content, sort_order, duration_minutes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.moduleId, data.title, data.content, data.sortOrder || 0, data.durationMinutes || null, data.createdBy || null]
  );
  return res.rows[0];
}

export async function updateLesson(lessonId: string, data: { title?: string; content?: string; sortOrder?: number; durationMinutes?: number }) {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
  if (data.content !== undefined) { sets.push(`content = $${idx++}`); params.push(data.content); }
  if (data.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(data.sortOrder); }
  if (data.durationMinutes !== undefined) { sets.push(`duration_minutes = $${idx++}`); params.push(data.durationMinutes); }
  sets.push(`updated_at = NOW()`);
  params.push(lessonId);
  const res = await dbPool.query(`UPDATE training_lessons SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  return res.rows[0];
}

export async function deleteLesson(lessonId: string) {
  await dbPool.query('DELETE FROM training_lessons WHERE id = $1', [lessonId]);
}

export async function bulkCreateLessons(moduleId: string, lessons: Array<{ title: string; content: string; durationMinutes?: number }>, createdBy?: string) {
  const existing = await listLessons(moduleId);
  let sortOrder = existing.length;
  const created = [];
  for (const l of lessons) {
    const res = await dbPool.query(
      `INSERT INTO training_lessons (module_id, title, content, sort_order, duration_minutes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [moduleId, l.title, l.content, sortOrder++, l.durationMinutes || null, createdBy || null]
    );
    created.push(res.rows[0]);
  }
  return created;
}

export async function markLessonComplete(studentId: string, lessonId: string, quizScore?: number, totalTimeSeconds?: number) {
  const lesson = await getLesson(lessonId);
  if (!lesson) throw new Error('Lesson not found');
  await dbPool.query(
    `INSERT INTO training_progress (student_id, lesson_id, module_id, total_time_seconds)
     VALUES ($1, $2, $3, $4) ON CONFLICT (student_id, lesson_id) DO UPDATE SET total_time_seconds = COALESCE(EXCLUDED.total_time_seconds, training_progress.total_time_seconds)`,
    [studentId, lessonId, lesson.module_id, totalTimeSeconds || 0]
  );
}

// ─── Lesson Visits ────────────────────────────────────────────────
export async function startLessonVisit(studentId: string, lessonId: string): Promise<string> {
  const res = await dbPool.query(
    `INSERT INTO training_lesson_visits (student_id, lesson_id) VALUES ($1, $2) RETURNING id`,
    [studentId, lessonId]
  );
  return res.rows[0].id;
}

export async function endLessonVisit(visitId: string, durationSeconds: number) {
  await dbPool.query(
    `UPDATE training_lesson_visits SET ended_at = NOW(), duration_seconds = $1 WHERE id = $2`,
    [durationSeconds, visitId]
  );
}

// ─── Quizzes ──────────────────────────────────────────────────────
async function getQuizLinkedLessons(quizId: string) {
  const res = await dbPool.query(
    `SELECT l.id, l.title FROM training_quiz_lessons ql
     JOIN training_lessons l ON l.id = ql.lesson_id
     WHERE ql.quiz_id = $1 ORDER BY l.sort_order`,
    [quizId]
  );
  return res.rows;
}

async function syncQuizLessons(quizId: string, lessonIds: string[]) {
  await dbPool.query('DELETE FROM training_quiz_lessons WHERE quiz_id = $1', [quizId]);
  for (const lessonId of lessonIds) {
    await dbPool.query(
      'INSERT INTO training_quiz_lessons (quiz_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [quizId, lessonId]
    );
  }
}

export async function listQuizzes(moduleId: string) {
  const res = await dbPool.query(
    `SELECT q.*,
       COALESCE(
         (SELECT JSON_AGG(JSON_BUILD_OBJECT('id', l.id, 'title', l.title) ORDER BY l.sort_order)
          FROM training_quiz_lessons ql
          JOIN training_lessons l ON l.id = ql.lesson_id
          WHERE ql.quiz_id = q.id),
         '[]'::json
       ) AS linked_lessons
     FROM training_quizzes q
     WHERE q.module_id = $1 AND q.is_active = true ORDER BY q.created_at`, [moduleId]
  );
  return res.rows.map((row: any) => ({
    ...row,
    linked_lessons: row.linked_lessons || [],
    lesson_title: row.linked_lessons?.[0]?.title || null,
  }));
}

export async function getQuizWithQuestions(quizId: string) {
  const quiz = await dbPool.query('SELECT * FROM training_quizzes WHERE id = $1', [quizId]);
  if (!quiz.rows[0]) return null;
  const questions = await dbPool.query(
    'SELECT * FROM training_questions WHERE quiz_id = $1 ORDER BY sort_order', [quizId]
  );
  const linkedLessons = await getQuizLinkedLessons(quizId);
  return { ...quiz.rows[0], questions: questions.rows, linked_lessons: linkedLessons };
}

export async function createQuiz(data: { moduleId: string; title: string; quizType: string; timeLimitMinutes?: number; passPercentage?: number; createdBy?: string; lessonIds?: string[] }) {
  const res = await dbPool.query(
    `INSERT INTO training_quizzes (module_id, title, quiz_type, time_limit_minutes, pass_percentage, created_by, lesson_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.moduleId, data.title, data.quizType, data.timeLimitMinutes || null, data.passPercentage || 70, data.createdBy || null, data.lessonIds?.[0] || null]
  );
  const quiz = res.rows[0];
  if (data.lessonIds?.length) {
    await syncQuizLessons(quiz.id, data.lessonIds);
  }
  return { ...quiz, linked_lessons: await getQuizLinkedLessons(quiz.id) };
}

export async function updateQuiz(quizId: string, data: { title?: string; quizType?: string; timeLimitMinutes?: number | null; passPercentage?: number; lessonIds?: string[] }) {
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
  if (data.quizType !== undefined) { sets.push(`quiz_type = $${idx++}`); params.push(data.quizType); }
  if (data.timeLimitMinutes !== undefined) { sets.push(`time_limit_minutes = $${idx++}`); params.push(data.timeLimitMinutes || null); }
  if (data.passPercentage !== undefined) { sets.push(`pass_percentage = $${idx++}`); params.push(data.passPercentage); }
  if (data.lessonIds !== undefined) {
    sets.push(`lesson_id = $${idx++}`);
    params.push(data.lessonIds[0] || null);
  }
  if (sets.length > 0) {
    params.push(quizId);
    await dbPool.query(`UPDATE training_quizzes SET ${sets.join(', ')} WHERE id = $${idx}`, params);
  }
  if (data.lessonIds !== undefined) {
    await syncQuizLessons(quizId, data.lessonIds);
  }
  const quiz = await dbPool.query('SELECT * FROM training_quizzes WHERE id = $1', [quizId]);
  return quiz.rows[0] ? { ...quiz.rows[0], linked_lessons: await getQuizLinkedLessons(quizId) } : null;
}

export async function addQuestion(data: { quizId: string; questionType: string; questionText: string; options?: any; correctAnswer: string; explanation?: string; sortOrder?: number }) {
  const res = await dbPool.query(
    `INSERT INTO training_questions (quiz_id, question_type, question_text, options, correct_answer, explanation, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.quizId, data.questionType, data.questionText, data.options ? JSON.stringify(data.options) : null, data.correctAnswer, data.explanation || null, data.sortOrder || 0]
  );
  return res.rows[0];
}

export async function deleteQuestion(questionId: string) {
  await dbPool.query('DELETE FROM training_questions WHERE id = $1', [questionId]);
}

export async function deleteQuiz(quizId: string) {
  await dbPool.query('DELETE FROM training_quizzes WHERE id = $1', [quizId]);
}

// ─── Attempts / Grading ──────────────────────────────────────────
export async function submitAttempt(data: { quizId: string; studentId: string; answers: Record<string, string>; startedAt: string }) {
  const questions = await dbPool.query('SELECT * FROM training_questions WHERE quiz_id = $1', [data.quizId]);
  let correct = 0;
  for (const q of questions.rows) {
    if (data.answers[q.id]?.toLowerCase() === q.correct_answer?.toLowerCase()) correct++;
  }
  const total = questions.rows.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;

  const res = await dbPool.query(
    `INSERT INTO training_attempts (quiz_id, student_id, answers, score, total_questions, correct_count, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
    [data.quizId, data.studentId, JSON.stringify(data.answers), score, total, correct, data.startedAt]
  );
  return { ...res.rows[0], questions: questions.rows };
}

export async function getAttempts(filters: { studentId?: string; quizId?: string }) {
  const conds: string[] = [];
  const params: any[] = [];
  if (filters.studentId) { params.push(filters.studentId); conds.push(`a.student_id = $${params.length}`); }
  if (filters.quizId) { params.push(filters.quizId); conds.push(`a.quiz_id = $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const res = await dbPool.query(
    `SELECT a.*, q.title AS quiz_title, q.quiz_type, q.module_id, u.name AS student_name
     FROM training_attempts a
     JOIN training_quizzes q ON q.id = a.quiz_id
     JOIN users u ON u.id = a.student_id
     ${where} ORDER BY a.completed_at DESC`,
    params
  );
  return res.rows;
}

// ─── Student progress summary ────────────────────────────────────
export async function getStudentProgress(studentId: string) {
  const modules = await listModules(studentId);
  const attempts = await getAttempts({ studentId });
  return { modules, attempts };
}

export async function getDetailedStudentProgress(studentId: string) {
  const modules = await listModules(studentId);
  const attempts = await getAttempts({ studentId });

  const lessonsRes = await dbPool.query(
    `SELECT p.lesson_id, p.module_id, p.completed_at, p.total_time_seconds,
            l.title AS lesson_title
     FROM training_progress p
     JOIN training_lessons l ON l.id = p.lesson_id
     WHERE p.student_id = $1 ORDER BY p.completed_at DESC`,
    [studentId]
  );

  const totalTime = lessonsRes.rows.reduce((sum: number, r: any) => sum + (r.total_time_seconds || 0), 0);
  const avgQuizScore = attempts.length > 0
    ? Math.round(attempts.reduce((sum: number, a: any) => sum + a.score, 0) / attempts.length)
    : 0;

  const lastActivity = lessonsRes.rows[0]?.completed_at || attempts[0]?.completed_at || null;

  return {
    modules,
    attempts,
    completedLessons: lessonsRes.rows,
    stats: {
      totalLessonsCompleted: lessonsRes.rows.length,
      totalTimeSeconds: totalTime,
      avgQuizScore,
      lastActivity,
    },
  };
}

export async function getAllStudentsProgress() {
  const students = await dbPool.query(
    `SELECT id, name, email FROM users WHERE role = 'intern_student' AND is_active = true ORDER BY name`
  );
  const result = [];
  for (const s of students.rows) {
    const progress = await getDetailedStudentProgress(s.id);
    result.push({ ...s, progress });
  }
  return result;
}

export async function getMyProgress(studentId: string) {
  return getDetailedStudentProgress(studentId);
}

// ─── AI Chat persistence ─────────────────────────────────────────
export async function getOrCreateChat(studentId: string, moduleId: string) {
  let chat = await dbPool.query(
    'SELECT * FROM training_ai_chats WHERE student_id = $1 AND module_id = $2 ORDER BY updated_at DESC LIMIT 1',
    [studentId, moduleId]
  );
  if (chat.rows[0]) return chat.rows[0];
  const res = await dbPool.query(
    'INSERT INTO training_ai_chats (student_id, module_id, messages) VALUES ($1, $2, $3) RETURNING *',
    [studentId, moduleId, '[]']
  );
  return res.rows[0];
}

export async function appendChatMessage(chatId: string, role: string, content: string) {
  await dbPool.query(
    `UPDATE training_ai_chats SET messages = messages || $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify([{ role, content, timestamp: new Date().toISOString() }]), chatId]
  );
}

// ─── Question Bank ───────────────────────────────────────────────
export async function getBankQuestions(lessonId: string) {
  const res = await dbPool.query(
    'SELECT * FROM lesson_question_bank WHERE lesson_id = $1 ORDER BY created_at',
    [lessonId]
  );
  return res.rows;
}

export async function insertBankQuestions(lessonId: string, questions: any[]) {
  for (const q of questions) {
    await dbPool.query(
      `INSERT INTO lesson_question_bank (lesson_id, question_text, options, correct_index, explanation)
       VALUES ($1, $2, $3, $4, $5)`,
      [lessonId, q.question, JSON.stringify(q.options), q.correctIndex, q.explanation || null]
    );
  }
}

export async function updateBankQuestion(questionId: string, data: { questionText: string; options: string[]; correctIndex: number; explanation?: string }) {
  await dbPool.query(
    `UPDATE lesson_question_bank SET question_text = $1, options = $2, correct_index = $3, explanation = $4 WHERE id = $5`,
    [data.questionText, JSON.stringify(data.options), data.correctIndex, data.explanation || null, questionId]
  );
}

export async function deleteBankQuestion(questionId: string) {
  await dbPool.query('DELETE FROM lesson_question_bank WHERE id = $1', [questionId]);
}

export async function getUnseenBankQuestions(studentId: string, lessonId: string, count: number) {
  const res = await dbPool.query(
    `SELECT qb.* FROM lesson_question_bank qb
     WHERE qb.lesson_id = $1
       AND qb.id NOT IN (SELECT question_id FROM student_seen_questions WHERE student_id = $2)
     ORDER BY RANDOM()
     LIMIT $3`,
    [lessonId, studentId, count]
  );
  return res.rows;
}

export async function resetSeenQuestions(studentId: string, lessonId: string) {
  await dbPool.query(
    `DELETE FROM student_seen_questions WHERE student_id = $1 AND question_id IN (
       SELECT id FROM lesson_question_bank WHERE lesson_id = $2
     )`,
    [studentId, lessonId]
  );
}

export async function markQuestionsSeen(studentId: string, questionIds: string[]) {
  for (const qId of questionIds) {
    await dbPool.query(
      `INSERT INTO student_seen_questions (student_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [studentId, qId]
    );
  }
}

export async function bulkUpdateBankQuestions(questions: Array<{ id: string; question: string; options: string[]; correctIndex: number; explanation?: string }>) {
  for (const q of questions) {
    await dbPool.query(
      `UPDATE lesson_question_bank SET question_text = $1, options = $2, correct_index = $3, explanation = $4 WHERE id = $5`,
      [q.question, JSON.stringify(q.options), q.correctIndex, q.explanation || null, q.id]
    );
  }
}
