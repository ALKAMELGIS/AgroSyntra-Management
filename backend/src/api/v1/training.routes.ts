import { Router } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import { AppError } from '../../utils/errors';
import * as svc from '../../services/training.service';
import * as aiTutor from '../../services/aiTutor.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export const trainingRouter = Router();
trainingRouter.use(auth);

const INTERN_ROLES = ['intern_student', 'intern_teacher', 'ceo', 'farm_manager', 'operation_manager', 'agronomist'];
/** Authoring rights (lessons, quizzes, questions, question bank, AI generation, bulk, PDF upload): the teacher only. */
export const TEACHER_ROLES = ['intern_teacher'];
/** Read-only teacher views (student list, question bank) also stay visible to managers. */
const TEACHER_VIEW_ROLES = ['intern_teacher', 'ceo', 'farm_manager', 'operation_manager'];

function forbidden() {
  return new AppError('Forbidden', 'FORBIDDEN', 403);
}
function requireIntern(req: AuthRequest) {
  if (!INTERN_ROLES.includes(req.user!.role)) throw forbidden();
}
function requireTeacher(req: AuthRequest) {
  if (!TEACHER_ROLES.includes(req.user!.role)) throw forbidden();
}
function requireTeacherView(req: AuthRequest) {
  if (!TEACHER_VIEW_ROLES.includes(req.user!.role)) throw forbidden();
}

// ─── Modules ──────────────────────────────────────────────────────
trainingRouter.get('/modules', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const studentId = req.user!.role === 'intern_student' ? req.user!.userId : (req.query.student_id as string) || undefined;
    res.json({ success: true, data: await svc.listModules(studentId) });
  } catch (e) { next(e); }
});

trainingRouter.get('/modules/:id', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const mod = await svc.getModule(req.params.id);
    if (!mod) return res.status(404).json({ success: false, error: 'Not found' });
    const lessons = await svc.listLessons(req.params.id);
    const quizzes = await svc.listQuizzes(req.params.id);
    let completedLessonIds: string[] = [];
    if (req.user!.role === 'intern_student') {
      completedLessonIds = await svc.getCompletedLessonIds(req.user!.userId, req.params.id);
    }
    res.json({ success: true, data: { ...mod, lessons, quizzes, completedLessonIds } });
  } catch (e) { next(e); }
});

// ─── Lessons ──────────────────────────────────────────────────────
trainingRouter.get('/lessons/:id', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const lesson = await svc.getLesson(req.params.id);
    if (!lesson) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: lesson });
  } catch (e) { next(e); }
});

trainingRouter.post('/lessons', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      title: z.string().min(1),
      content: z.string(),
      sortOrder: z.number().optional(),
      durationMinutes: z.number().optional(),
    }).parse(req.body);
    const lesson = await svc.createLesson({ ...body, createdBy: req.user!.userId });
    res.status(201).json({ success: true, data: lesson });
  } catch (e) { next(e); }
});

trainingRouter.put('/lessons/:id', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const lesson = await svc.updateLesson(req.params.id, req.body);
    res.json({ success: true, data: lesson });
  } catch (e) { next(e); }
});

trainingRouter.delete('/lessons/:id', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    await svc.deleteLesson(req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

trainingRouter.post('/lessons/bulk', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      lessons: z.array(z.object({
        title: z.string().min(1),
        content: z.string(),
        durationMinutes: z.number().optional(),
      })),
    }).parse(req.body);
    const created = await svc.bulkCreateLessons(body.moduleId, body.lessons, req.user!.userId);
    res.status(201).json({ success: true, data: created });
  } catch (e) { next(e); }
});

trainingRouter.post('/lessons/:id/complete', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const body = z.object({
      quizScore: z.number().min(0).max(100),
      totalTimeSeconds: z.number().optional(),
    }).parse(req.body);
    if (body.quizScore < 75) {
      return res.status(400).json({ success: false, error: { message: 'Quiz score must be at least 75% to complete the lesson.' } });
    }
    await svc.markLessonComplete(req.user!.userId, req.params.id, body.quizScore, body.totalTimeSeconds);
    res.json({ success: true });
  } catch (e) { next(e); }
});

trainingRouter.post('/lessons/:id/visit', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const visitId = await svc.startLessonVisit(req.user!.userId, req.params.id);
    res.json({ success: true, data: { visitId } });
  } catch (e) { next(e); }
});

trainingRouter.put('/lessons/visit/:visitId/end', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const body = z.object({ durationSeconds: z.number().min(0) }).parse(req.body);
    await svc.endLessonVisit(req.params.visitId, body.durationSeconds);
    res.json({ success: true });
  } catch (e) { next(e); }
});

trainingRouter.post('/lessons/:id/quiz', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const lessonId = req.params.id;
    const studentId = req.user!.userId;
    const lesson = await svc.getLesson(lessonId);
    if (!lesson) return res.status(404).json({ success: false, error: { message: 'Lesson not found' } });

    let questions = await svc.getUnseenBankQuestions(studentId, lessonId, 4);

    if (questions.length < 4) {
      await svc.resetSeenQuestions(studentId, lessonId);
      questions = await svc.getUnseenBankQuestions(studentId, lessonId, 4);
    }

    if (questions.length === 0) {
      return res.json({ success: true, data: [] });
    }

    await svc.markQuestionsSeen(studentId, questions.map((q: any) => q.id));

    const mapped = questions.map((q: any) => ({
      question: q.question_text,
      options: q.options,
      correctIndex: q.correct_index,
      explanation: q.explanation,
    }));
    res.json({ success: true, data: mapped });
  } catch (e) { next(e); }
});

// ─── Question Bank (Teacher) ─────────────────────────────────────
trainingRouter.post('/lessons/:id/generate-bank', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const lesson = await svc.getLesson(req.params.id);
    if (!lesson) return res.status(404).json({ success: false, error: { message: 'Lesson not found' } });

    const count = req.body.count || 20;
    const questions = await aiTutor.generateQuestionBank(lesson.title, lesson.content, count);
    await svc.insertBankQuestions(req.params.id, questions);

    const bank = await svc.getBankQuestions(req.params.id);
    res.json({ success: true, data: bank });
  } catch (e) { next(e); }
});

trainingRouter.get('/lessons/:id/question-bank', async (req: AuthRequest, res, next) => {
  try {
    requireTeacherView(req);
    const bank = await svc.getBankQuestions(req.params.id);
    res.json({ success: true, data: bank });
  } catch (e) { next(e); }
});

trainingRouter.put('/questions/bank/:questionId', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      questionText: z.string().min(1),
      options: z.array(z.string()).length(4),
      correctIndex: z.number().min(0).max(3),
      explanation: z.string().optional(),
    }).parse(req.body);
    await svc.updateBankQuestion(req.params.questionId, body);
    res.json({ success: true });
  } catch (e) { next(e); }
});

trainingRouter.delete('/questions/bank/:questionId', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    await svc.deleteBankQuestion(req.params.questionId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

trainingRouter.post('/questions/bank/:questionId/ai-edit', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      instruction: z.string().min(1),
      questionText: z.string().min(1),
      options: z.array(z.string()).length(4),
      correctIndex: z.number().min(0).max(3),
      explanation: z.string().optional(),
    }).parse(req.body);
    const { instruction, ...currentQuestion } = body;
    const edited = await aiTutor.editBankQuestion(currentQuestion, instruction);
    res.json({ success: true, data: edited });
  } catch (e) { next(e); }
});

trainingRouter.post('/lessons/:id/question-bank/ai-edit', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      instruction: z.string().min(1),
      questions: z.array(z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        correctIndex: z.number(),
        explanation: z.string().optional(),
      })),
    }).parse(req.body);
    const edited = await aiTutor.bulkEditBankQuestions(body.questions, body.instruction);
    await svc.bulkUpdateBankQuestions(edited);
    const bank = await svc.getBankQuestions(req.params.id);
    res.json({ success: true, data: bank });
  } catch (e) { next(e); }
});

// ─── Quizzes ──────────────────────────────────────────────────────
trainingRouter.get('/quizzes', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const moduleId = req.query.module_id as string;
    if (!moduleId) return res.status(400).json({ success: false, error: 'module_id required' });
    res.json({ success: true, data: await svc.listQuizzes(moduleId) });
  } catch (e) { next(e); }
});

trainingRouter.get('/quizzes/:id', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const quiz = await svc.getQuizWithQuestions(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, error: 'Not found' });
    if (req.user!.role === 'intern_student') {
      quiz.questions = quiz.questions.map((q: any) => ({
        id: q.id, question_type: q.question_type, question_text: q.question_text, options: q.options, sort_order: q.sort_order,
      }));
    }
    res.json({ success: true, data: quiz });
  } catch (e) { next(e); }
});

trainingRouter.post('/quizzes', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      title: z.string().min(1),
      quizType: z.enum(['practice', 'graded']),
      timeLimitMinutes: z.number().optional(),
      passPercentage: z.number().optional(),
      lessonIds: z.array(z.string().uuid()).optional(),
    }).parse(req.body);
    const quiz = await svc.createQuiz({ ...body, createdBy: req.user!.userId });
    res.status(201).json({ success: true, data: quiz });
  } catch (e) { next(e); }
});

trainingRouter.put('/quizzes/:id', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      title: z.string().min(1).optional(),
      quizType: z.enum(['practice', 'graded']).optional(),
      timeLimitMinutes: z.number().nullable().optional(),
      passPercentage: z.number().optional(),
      lessonIds: z.array(z.string().uuid()).optional(),
    }).parse(req.body);
    const quiz = await svc.updateQuiz(req.params.id, body);
    res.json({ success: true, data: quiz });
  } catch (e) { next(e); }
});

trainingRouter.delete('/quizzes/:id', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    await svc.deleteQuiz(req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── Questions ────────────────────────────────────────────────────
trainingRouter.post('/questions', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      quizId: z.string().uuid(),
      questionType: z.enum(['mcq', 'true_false']),
      questionText: z.string().min(1),
      options: z.array(z.string()).optional(),
      correctAnswer: z.string().min(1),
      explanation: z.string().optional(),
      sortOrder: z.number().optional(),
    }).parse(req.body);
    const q = await svc.addQuestion(body);
    res.status(201).json({ success: true, data: q });
  } catch (e) { next(e); }
});

trainingRouter.delete('/questions/:id', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    await svc.deleteQuestion(req.params.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── Attempts ─────────────────────────────────────────────────────
trainingRouter.post('/quizzes/:id/submit', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const body = z.object({
      answers: z.record(z.string(), z.string()),
      startedAt: z.string(),
    }).parse(req.body);
    const result = await svc.submitAttempt({ quizId: req.params.id, studentId: req.user!.userId, ...body });
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
});

trainingRouter.get('/grades', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    if (req.user!.role === 'intern_student') {
      res.json({ success: true, data: await svc.getStudentProgress(req.user!.userId) });
    } else {
      res.json({ success: true, data: await svc.getAllStudentsProgress() });
    }
  } catch (e) { next(e); }
});

trainingRouter.get('/attempts', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const studentId = req.user!.role === 'intern_student' ? req.user!.userId : (req.query.student_id as string) || undefined;
    const quizId = req.query.quiz_id as string | undefined;
    res.json({ success: true, data: await svc.getAttempts({ studentId, quizId }) });
  } catch (e) { next(e); }
});

// ─── My Progress (students) ──────────────────────────────────────
trainingRouter.get('/my-progress', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    res.json({ success: true, data: await svc.getMyProgress(req.user!.userId) });
  } catch (e) { next(e); }
});

// ─── Students list (for teachers) ────────────────────────────────
trainingRouter.get('/students', async (req: AuthRequest, res, next) => {
  try {
    requireTeacherView(req);
    res.json({ success: true, data: await svc.getAllStudentsProgress() });
  } catch (e) { next(e); }
});

// ─── AI Chat ──────────────────────────────────────────────────────
trainingRouter.get('/ai/chat/:moduleId', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const chat = await svc.getOrCreateChat(req.user!.userId, req.params.moduleId);
    res.json({ success: true, data: chat });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/chat', async (req: AuthRequest, res, next) => {
  try {
    requireIntern(req);
    const body = z.object({ moduleId: z.string().uuid(), message: z.string().min(1) }).parse(req.body);
    const reply = await aiTutor.chatWithTutor(req.user!.userId, body.moduleId, body.message);
    res.json({ success: true, data: { reply } });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/generate-questions', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      topic: z.string().min(1),
      count: z.number().min(1).max(20).optional(),
    }).parse(req.body);
    const questions = await aiTutor.generateQuestions(body.moduleId, body.topic, body.count || 5);
    res.json({ success: true, data: questions });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/generate-quiz-questions', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      topic: z.string().min(1),
      count: z.number().min(1).max(20),
      lessonIds: z.array(z.string().uuid()).optional(),
      lessonId: z.string().uuid().optional(),
    }).parse(req.body);

    const ids = body.lessonIds?.length ? body.lessonIds : (body.lessonId ? [body.lessonId] : []);
    const lessons: Array<{ title: string; content: string }> = [];
    for (const id of ids) {
      const lesson = await svc.getLesson(id);
      if (lesson) lessons.push({ title: lesson.title, content: lesson.content });
    }

    const questions = await aiTutor.generateQuizForTeacher({
      topic: body.topic,
      count: body.count,
      lessons,
    });
    res.json({ success: true, data: questions });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/analyze-outline', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      outline: z.string().min(1),
      referenceText: z.string().optional(),
    }).parse(req.body);
    const analysis = await aiTutor.analyzeOutline(body.moduleId, body.outline, body.referenceText);
    res.json({ success: true, data: analysis });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/generate-lessons', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      outline: z.string().min(1),
      referenceText: z.string().optional(),
      lessonPlan: z.array(z.object({
        title: z.string(),
        questions: z.array(z.string()),
      })),
    }).parse(req.body);
    const lessons = await aiTutor.generateLessonsFromOutline(body.moduleId, body.outline, body.lessonPlan, body.referenceText);
    res.json({ success: true, data: lessons });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/regenerate-lesson', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      moduleId: z.string().uuid(),
      title: z.string().min(1),
      questions: z.array(z.object({
        question: z.string(),
        answer: z.string(),
      })),
    }).parse(req.body);
    const lesson = await aiTutor.regenerateLesson(body.moduleId, body.title, body.questions);
    res.json({ success: true, data: lesson });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/upload-pdf', uploadSingle, async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    if (!req.file) throw Object.assign(new Error('No file uploaded'), { status: 400 });
    if (req.file.mimetype !== 'application/pdf') throw Object.assign(new Error('Only PDF files are accepted'), { status: 400 });
    const parsed = await pdfParse(req.file.buffer);
    const text = (parsed.text || '').slice(0, 30000);
    res.json({ success: true, data: { text, pages: parsed.numpages } });
  } catch (e) { next(e); }
});

trainingRouter.post('/ai/chat-edit', async (req: AuthRequest, res, next) => {
  try {
    requireTeacher(req);
    const body = z.object({
      lessonTitle: z.string().min(1),
      currentContent: z.string(),
      message: z.string().min(1),
      history: z.array(z.object({ role: z.string(), content: z.string() })).default([]),
    }).parse(req.body);
    const result = await aiTutor.chatEditLesson(body.lessonTitle, body.currentContent, body.message, body.history);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});
