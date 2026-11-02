"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainingRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const svc = __importStar(require("../../services/training.service"));
const aiTutor = __importStar(require("../../services/aiTutor.service"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
exports.trainingRouter = (0, express_1.Router)();
exports.trainingRouter.use(auth_1.auth);
const INTERN_ROLES = ['intern_student', 'intern_teacher', 'ceo', 'farm_manager', 'operation_manager', 'agronomist'];
const TEACHER_ROLES = ['intern_teacher', 'ceo', 'farm_manager', 'operation_manager'];
function requireIntern(req) {
    if (!INTERN_ROLES.includes(req.user.role))
        throw Object.assign(new Error('Forbidden'), { status: 403 });
}
function requireTeacher(req) {
    if (!TEACHER_ROLES.includes(req.user.role))
        throw Object.assign(new Error('Forbidden'), { status: 403 });
}
// ─── Modules ──────────────────────────────────────────────────────
exports.trainingRouter.get('/modules', async (req, res, next) => {
    try {
        requireIntern(req);
        const studentId = req.user.role === 'intern_student' ? req.user.userId : req.query.student_id || undefined;
        res.json({ success: true, data: await svc.listModules(studentId) });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.get('/modules/:id', async (req, res, next) => {
    try {
        requireIntern(req);
        const mod = await svc.getModule(req.params.id);
        if (!mod)
            return res.status(404).json({ success: false, error: 'Not found' });
        const lessons = await svc.listLessons(req.params.id);
        const quizzes = await svc.listQuizzes(req.params.id);
        let completedLessonIds = [];
        if (req.user.role === 'intern_student') {
            completedLessonIds = await svc.getCompletedLessonIds(req.user.userId, req.params.id);
        }
        res.json({ success: true, data: { ...mod, lessons, quizzes, completedLessonIds } });
    }
    catch (e) {
        next(e);
    }
});
// ─── Lessons ──────────────────────────────────────────────────────
exports.trainingRouter.get('/lessons/:id', async (req, res, next) => {
    try {
        requireIntern(req);
        const lesson = await svc.getLesson(req.params.id);
        if (!lesson)
            return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: lesson });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/lessons', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            title: zod_1.z.string().min(1),
            content: zod_1.z.string(),
            sortOrder: zod_1.z.number().optional(),
            durationMinutes: zod_1.z.number().optional(),
        }).parse(req.body);
        const lesson = await svc.createLesson({ ...body, createdBy: req.user.userId });
        res.status(201).json({ success: true, data: lesson });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.put('/lessons/:id', async (req, res, next) => {
    try {
        requireTeacher(req);
        const lesson = await svc.updateLesson(req.params.id, req.body);
        res.json({ success: true, data: lesson });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.delete('/lessons/:id', async (req, res, next) => {
    try {
        requireTeacher(req);
        await svc.deleteLesson(req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/lessons/bulk', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            lessons: zod_1.z.array(zod_1.z.object({
                title: zod_1.z.string().min(1),
                content: zod_1.z.string(),
                durationMinutes: zod_1.z.number().optional(),
            })),
        }).parse(req.body);
        const created = await svc.bulkCreateLessons(body.moduleId, body.lessons, req.user.userId);
        res.status(201).json({ success: true, data: created });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/lessons/:id/complete', async (req, res, next) => {
    try {
        requireIntern(req);
        const body = zod_1.z.object({
            quizScore: zod_1.z.number().min(0).max(100),
            totalTimeSeconds: zod_1.z.number().optional(),
        }).parse(req.body);
        if (body.quizScore < 75) {
            return res.status(400).json({ success: false, error: { message: 'Quiz score must be at least 75% to complete the lesson.' } });
        }
        await svc.markLessonComplete(req.user.userId, req.params.id, body.quizScore, body.totalTimeSeconds);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/lessons/:id/visit', async (req, res, next) => {
    try {
        requireIntern(req);
        const visitId = await svc.startLessonVisit(req.user.userId, req.params.id);
        res.json({ success: true, data: { visitId } });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.put('/lessons/visit/:visitId/end', async (req, res, next) => {
    try {
        requireIntern(req);
        const body = zod_1.z.object({ durationSeconds: zod_1.z.number().min(0) }).parse(req.body);
        await svc.endLessonVisit(req.params.visitId, body.durationSeconds);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/lessons/:id/quiz', async (req, res, next) => {
    try {
        requireIntern(req);
        const lessonId = req.params.id;
        const studentId = req.user.userId;
        const lesson = await svc.getLesson(lessonId);
        if (!lesson)
            return res.status(404).json({ success: false, error: { message: 'Lesson not found' } });
        let questions = await svc.getUnseenBankQuestions(studentId, lessonId, 4);
        if (questions.length < 4) {
            await svc.resetSeenQuestions(studentId, lessonId);
            questions = await svc.getUnseenBankQuestions(studentId, lessonId, 4);
        }
        if (questions.length === 0) {
            return res.json({ success: true, data: [] });
        }
        await svc.markQuestionsSeen(studentId, questions.map((q) => q.id));
        const mapped = questions.map((q) => ({
            question: q.question_text,
            options: q.options,
            correctIndex: q.correct_index,
            explanation: q.explanation,
        }));
        res.json({ success: true, data: mapped });
    }
    catch (e) {
        next(e);
    }
});
// ─── Question Bank (Teacher) ─────────────────────────────────────
exports.trainingRouter.post('/lessons/:id/generate-bank', async (req, res, next) => {
    try {
        requireTeacher(req);
        const lesson = await svc.getLesson(req.params.id);
        if (!lesson)
            return res.status(404).json({ success: false, error: { message: 'Lesson not found' } });
        const count = req.body.count || 20;
        const questions = await aiTutor.generateQuestionBank(lesson.title, lesson.content, count);
        await svc.insertBankQuestions(req.params.id, questions);
        const bank = await svc.getBankQuestions(req.params.id);
        res.json({ success: true, data: bank });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.get('/lessons/:id/question-bank', async (req, res, next) => {
    try {
        requireTeacher(req);
        const bank = await svc.getBankQuestions(req.params.id);
        res.json({ success: true, data: bank });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.put('/questions/bank/:questionId', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            questionText: zod_1.z.string().min(1),
            options: zod_1.z.array(zod_1.z.string()).length(4),
            correctIndex: zod_1.z.number().min(0).max(3),
            explanation: zod_1.z.string().optional(),
        }).parse(req.body);
        await svc.updateBankQuestion(req.params.questionId, body);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.delete('/questions/bank/:questionId', async (req, res, next) => {
    try {
        requireTeacher(req);
        await svc.deleteBankQuestion(req.params.questionId);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/questions/bank/:questionId/ai-edit', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            instruction: zod_1.z.string().min(1),
            questionText: zod_1.z.string().min(1),
            options: zod_1.z.array(zod_1.z.string()).length(4),
            correctIndex: zod_1.z.number().min(0).max(3),
            explanation: zod_1.z.string().optional(),
        }).parse(req.body);
        const { instruction, ...currentQuestion } = body;
        const edited = await aiTutor.editBankQuestion(currentQuestion, instruction);
        res.json({ success: true, data: edited });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/lessons/:id/question-bank/ai-edit', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            instruction: zod_1.z.string().min(1),
            questions: zod_1.z.array(zod_1.z.object({
                id: zod_1.z.string(),
                question: zod_1.z.string(),
                options: zod_1.z.array(zod_1.z.string()),
                correctIndex: zod_1.z.number(),
                explanation: zod_1.z.string().optional(),
            })),
        }).parse(req.body);
        const edited = await aiTutor.bulkEditBankQuestions(body.questions, body.instruction);
        await svc.bulkUpdateBankQuestions(edited);
        const bank = await svc.getBankQuestions(req.params.id);
        res.json({ success: true, data: bank });
    }
    catch (e) {
        next(e);
    }
});
// ─── Quizzes ──────────────────────────────────────────────────────
exports.trainingRouter.get('/quizzes', async (req, res, next) => {
    try {
        requireIntern(req);
        const moduleId = req.query.module_id;
        if (!moduleId)
            return res.status(400).json({ success: false, error: 'module_id required' });
        res.json({ success: true, data: await svc.listQuizzes(moduleId) });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.get('/quizzes/:id', async (req, res, next) => {
    try {
        requireIntern(req);
        const quiz = await svc.getQuizWithQuestions(req.params.id);
        if (!quiz)
            return res.status(404).json({ success: false, error: 'Not found' });
        if (req.user.role === 'intern_student') {
            quiz.questions = quiz.questions.map((q) => ({
                id: q.id, question_type: q.question_type, question_text: q.question_text, options: q.options, sort_order: q.sort_order,
            }));
        }
        res.json({ success: true, data: quiz });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/quizzes', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            title: zod_1.z.string().min(1),
            quizType: zod_1.z.enum(['practice', 'graded']),
            timeLimitMinutes: zod_1.z.number().optional(),
            passPercentage: zod_1.z.number().optional(),
            lessonIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
        }).parse(req.body);
        const quiz = await svc.createQuiz({ ...body, createdBy: req.user.userId });
        res.status(201).json({ success: true, data: quiz });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.put('/quizzes/:id', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            title: zod_1.z.string().min(1).optional(),
            quizType: zod_1.z.enum(['practice', 'graded']).optional(),
            timeLimitMinutes: zod_1.z.number().nullable().optional(),
            passPercentage: zod_1.z.number().optional(),
            lessonIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
        }).parse(req.body);
        const quiz = await svc.updateQuiz(req.params.id, body);
        res.json({ success: true, data: quiz });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.delete('/quizzes/:id', async (req, res, next) => {
    try {
        requireTeacher(req);
        await svc.deleteQuiz(req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
// ─── Questions ────────────────────────────────────────────────────
exports.trainingRouter.post('/questions', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            quizId: zod_1.z.string().uuid(),
            questionType: zod_1.z.enum(['mcq', 'true_false']),
            questionText: zod_1.z.string().min(1),
            options: zod_1.z.array(zod_1.z.string()).optional(),
            correctAnswer: zod_1.z.string().min(1),
            explanation: zod_1.z.string().optional(),
            sortOrder: zod_1.z.number().optional(),
        }).parse(req.body);
        const q = await svc.addQuestion(body);
        res.status(201).json({ success: true, data: q });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.delete('/questions/:id', async (req, res, next) => {
    try {
        requireTeacher(req);
        await svc.deleteQuestion(req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        next(e);
    }
});
// ─── Attempts ─────────────────────────────────────────────────────
exports.trainingRouter.post('/quizzes/:id/submit', async (req, res, next) => {
    try {
        requireIntern(req);
        const body = zod_1.z.object({
            answers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()),
            startedAt: zod_1.z.string(),
        }).parse(req.body);
        const result = await svc.submitAttempt({ quizId: req.params.id, studentId: req.user.userId, ...body });
        res.status(201).json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.get('/grades', async (req, res, next) => {
    try {
        requireIntern(req);
        if (req.user.role === 'intern_student') {
            res.json({ success: true, data: await svc.getStudentProgress(req.user.userId) });
        }
        else {
            res.json({ success: true, data: await svc.getAllStudentsProgress() });
        }
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.get('/attempts', async (req, res, next) => {
    try {
        requireIntern(req);
        const studentId = req.user.role === 'intern_student' ? req.user.userId : req.query.student_id || undefined;
        const quizId = req.query.quiz_id;
        res.json({ success: true, data: await svc.getAttempts({ studentId, quizId }) });
    }
    catch (e) {
        next(e);
    }
});
// ─── My Progress (students) ──────────────────────────────────────
exports.trainingRouter.get('/my-progress', async (req, res, next) => {
    try {
        requireIntern(req);
        res.json({ success: true, data: await svc.getMyProgress(req.user.userId) });
    }
    catch (e) {
        next(e);
    }
});
// ─── Students list (for teachers) ────────────────────────────────
exports.trainingRouter.get('/students', async (req, res, next) => {
    try {
        requireTeacher(req);
        res.json({ success: true, data: await svc.getAllStudentsProgress() });
    }
    catch (e) {
        next(e);
    }
});
// ─── AI Chat ──────────────────────────────────────────────────────
exports.trainingRouter.get('/ai/chat/:moduleId', async (req, res, next) => {
    try {
        requireIntern(req);
        const chat = await svc.getOrCreateChat(req.user.userId, req.params.moduleId);
        res.json({ success: true, data: chat });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/chat', async (req, res, next) => {
    try {
        requireIntern(req);
        const body = zod_1.z.object({ moduleId: zod_1.z.string().uuid(), message: zod_1.z.string().min(1) }).parse(req.body);
        const reply = await aiTutor.chatWithTutor(req.user.userId, body.moduleId, body.message);
        res.json({ success: true, data: { reply } });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/generate-questions', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            topic: zod_1.z.string().min(1),
            count: zod_1.z.number().min(1).max(20).optional(),
        }).parse(req.body);
        const questions = await aiTutor.generateQuestions(body.moduleId, body.topic, body.count || 5);
        res.json({ success: true, data: questions });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/generate-quiz-questions', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            topic: zod_1.z.string().min(1),
            count: zod_1.z.number().min(1).max(20),
            lessonIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
            lessonId: zod_1.z.string().uuid().optional(),
        }).parse(req.body);
        const ids = body.lessonIds?.length ? body.lessonIds : (body.lessonId ? [body.lessonId] : []);
        const lessons = [];
        for (const id of ids) {
            const lesson = await svc.getLesson(id);
            if (lesson)
                lessons.push({ title: lesson.title, content: lesson.content });
        }
        const questions = await aiTutor.generateQuizForTeacher({
            topic: body.topic,
            count: body.count,
            lessons,
        });
        res.json({ success: true, data: questions });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/analyze-outline', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            outline: zod_1.z.string().min(1),
            referenceText: zod_1.z.string().optional(),
        }).parse(req.body);
        const analysis = await aiTutor.analyzeOutline(body.moduleId, body.outline, body.referenceText);
        res.json({ success: true, data: analysis });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/generate-lessons', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            outline: zod_1.z.string().min(1),
            referenceText: zod_1.z.string().optional(),
            lessonPlan: zod_1.z.array(zod_1.z.object({
                title: zod_1.z.string(),
                questions: zod_1.z.array(zod_1.z.string()),
            })),
        }).parse(req.body);
        const lessons = await aiTutor.generateLessonsFromOutline(body.moduleId, body.outline, body.lessonPlan, body.referenceText);
        res.json({ success: true, data: lessons });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/regenerate-lesson', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            moduleId: zod_1.z.string().uuid(),
            title: zod_1.z.string().min(1),
            questions: zod_1.z.array(zod_1.z.object({
                question: zod_1.z.string(),
                answer: zod_1.z.string(),
            })),
        }).parse(req.body);
        const lesson = await aiTutor.regenerateLesson(body.moduleId, body.title, body.questions);
        res.json({ success: true, data: lesson });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/upload-pdf', upload_1.uploadSingle, async (req, res, next) => {
    try {
        requireTeacher(req);
        if (!req.file)
            throw Object.assign(new Error('No file uploaded'), { status: 400 });
        if (req.file.mimetype !== 'application/pdf')
            throw Object.assign(new Error('Only PDF files are accepted'), { status: 400 });
        const parsed = await pdfParse(req.file.buffer);
        const text = (parsed.text || '').slice(0, 30000);
        res.json({ success: true, data: { text, pages: parsed.numpages } });
    }
    catch (e) {
        next(e);
    }
});
exports.trainingRouter.post('/ai/chat-edit', async (req, res, next) => {
    try {
        requireTeacher(req);
        const body = zod_1.z.object({
            lessonTitle: zod_1.z.string().min(1),
            currentContent: zod_1.z.string(),
            message: zod_1.z.string().min(1),
            history: zod_1.z.array(zod_1.z.object({ role: zod_1.z.string(), content: zod_1.z.string() })).default([]),
        }).parse(req.body);
        const result = await aiTutor.chatEditLesson(body.lessonTitle, body.currentContent, body.message, body.history);
        res.json({ success: true, data: result });
    }
    catch (e) {
        next(e);
    }
});
