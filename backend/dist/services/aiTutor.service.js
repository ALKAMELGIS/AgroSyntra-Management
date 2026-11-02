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
exports.chatWithTutor = chatWithTutor;
exports.generateQuestions = generateQuestions;
exports.generateQuizFromContent = generateQuizFromContent;
exports.generateQuestionBank = generateQuestionBank;
exports.editBankQuestion = editBankQuestion;
exports.bulkEditBankQuestions = bulkEditBankQuestions;
exports.generateQuizForTeacher = generateQuizForTeacher;
exports.analyzeOutline = analyzeOutline;
exports.generateLessonsFromOutline = generateLessonsFromOutline;
exports.regenerateLesson = regenerateLesson;
exports.chatEditLesson = chatEditLesson;
const logger_1 = require("../utils/logger");
const trainingSvc = __importStar(require("./training.service"));
const settingsSvc = __importStar(require("./systemSettings.service"));
async function resolveAIConfig() {
    const provider = (await settingsSvc.get('ai_provider')) || 'anthropic';
    const model = (await settingsSvc.get('ai_model')) || 'claude-sonnet-4-20250514';
    const apiKey = (await settingsSvc.getAIKey()) || process.env.ANTHROPIC_API_KEY || '';
    return { provider, model, apiKey };
}
async function callAI(systemPrompt, messages, maxTokens = 2048, temperature) {
    const { provider, model, apiKey } = await resolveAIConfig();
    if (!apiKey)
        throw new Error('AI API key not configured. Add it in Settings > AI Brain.');
    if (provider === 'openai') {
        const body = {
            model,
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content })),
            ],
        };
        if (temperature !== undefined)
            body.temperature = temperature;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const err = await response.text();
            logger_1.logger.error({ status: response.status, err }, 'OpenAI API error');
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
    const body = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (temperature !== undefined)
        body.temperature = temperature;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const err = await response.text();
        logger_1.logger.error({ status: response.status, err }, 'Claude API error');
        throw new Error(`Claude API error: ${response.status}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
}
async function chatWithTutor(studentId, moduleId, userMessage) {
    const mod = await trainingSvc.getModule(moduleId);
    if (!mod)
        throw new Error('Module not found');
    const lessons = await trainingSvc.listLessons(moduleId);
    const lessonSummary = lessons.map(l => `- ${l.title}`).join('\n');
    const systemPrompt = `You are an expert agricultural science tutor at Elite Agro Holding's internship program.
You are helping a student learn about: "${mod.title}"

Module description: ${mod.description}

Available lessons in this module:
${lessonSummary}

Guidelines:
- Be encouraging, patient, and clear in your explanations.
- Use real-world farm examples when possible (greenhouse/nethouse environment, UAE climate).
- If the student asks something outside agriculture, politely redirect them.
- Keep answers concise but thorough. Use bullet points for lists.
- When explaining concepts, relate them to practical farm operations.
- Use analogies to make complex concepts accessible.`;
    const chat = await trainingSvc.getOrCreateChat(studentId, moduleId);
    const existingMessages = Array.isArray(chat.messages) ? chat.messages : [];
    await trainingSvc.appendChatMessage(chat.id, 'user', userMessage);
    const conversationHistory = [
        ...existingMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
    ];
    const reply = await callAI(systemPrompt, conversationHistory);
    await trainingSvc.appendChatMessage(chat.id, 'assistant', reply);
    return reply;
}
async function generateQuestions(moduleId, topic, count = 5) {
    const mod = await trainingSvc.getModule(moduleId);
    if (!mod)
        throw new Error('Module not found');
    const randomSeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const systemPrompt = `You are an expert exam writer for an agricultural training program.
Module: "${mod.title}" — ${mod.description}

Generate exactly ${count} UNIQUE multiple-choice questions about: "${topic}"

RULES:
1. Each question must test a DIFFERENT concept or fact — never repeat the same idea.
2. All questions must be MCQ with exactly 4 options (A, B, C, D).
3. Wrong options must be plausible (common misconceptions or related concepts).
4. Mix difficulty: some recall, some application, some analysis.
5. Questions must be specific and practical — relate to real farm operations.
6. Do NOT use generic filler questions. Every question should teach something.

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "questionType": "mcq",
    "questionText": "The question?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Why this is correct."
  }
]

correctAnswer must be one of: "A", "B", "C", "D".
Seed: ${randomSeed}`;
    const result = await callAI(systemPrompt, [
        { role: 'user', content: `Generate ${count} unique questions about "${topic}" for the module "${mod.title}". Each question must cover a different aspect. Be creative.` },
    ], 8192, 0.9);
    try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch)
            throw new Error('No JSON array found');
        return JSON.parse(jsonMatch[0]);
    }
    catch (err) {
        logger_1.logger.error({ err, result }, 'Failed to parse AI-generated questions');
        throw new Error('Failed to parse AI response. Please try again.');
    }
}
async function generateQuizFromContent(lessonTitle, lessonContent) {
    const plainText = (lessonContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const randomSeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const systemPrompt = `You are creating a short comprehension quiz for a student who just read a lesson. Generate exactly 4 multiple-choice questions.

RULES:
1. Each question must test a DIFFERENT key concept from the lesson.
2. Questions should verify the student actually read and understood the material.
3. Wrong options must be plausible but clearly wrong to someone who read carefully.
4. Cover different sections/paragraphs of the lesson — do NOT cluster questions around one part.
5. Ask about specific facts, procedures, or concepts mentioned in the lesson.

Return ONLY a valid JSON array (no markdown, no extra text):
[
  {
    "question": "Specific question about lesson content?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why this is correct based on the lesson."
  }
]

correctIndex is 0-based (0=first, 1=second, 2=third, 3=fourth).
Seed: ${randomSeed}`;
    const result = await callAI(systemPrompt, [
        { role: 'user', content: `Lesson: "${lessonTitle}"\n\nContent:\n${plainText.slice(0, 8000)}\n\nGenerate 4 unique questions covering different parts of this lesson.` },
    ], 4096, 0.8);
    try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch)
            throw new Error('No JSON array found');
        const questions = JSON.parse(jsonMatch[0]);
        return questions.slice(0, 4);
    }
    catch (err) {
        logger_1.logger.error({ err, result: result.substring(0, 500) }, 'Failed to parse quiz questions');
        throw new Error('Failed to generate quiz. Please try again.');
    }
}
async function generateQuestionBank(lessonTitle, lessonContent, count = 20) {
    const plainText = (lessonContent || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const batchSize = 10;
    const batches = Math.ceil(count / batchSize);
    let allQuestions = [];
    for (let batch = 0; batch < batches; batch++) {
        const remaining = count - allQuestions.length;
        const batchCount = Math.min(batchSize, remaining);
        const randomSeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const previousQs = allQuestions.map(q => q.question).join('\n- ');
        const avoidSection = previousQs
            ? `\n\nIMPORTANT: Do NOT repeat or paraphrase any of these previously generated questions:\n- ${previousQs}`
            : '';
        const systemPrompt = `You are an expert exam writer for an agricultural training program. Generate exactly ${batchCount} UNIQUE multiple-choice questions from the lesson content below.

RULES:
1. Each question must test a DIFFERENT concept from the lesson.
2. Cover various sections of the lesson — spread questions across the entire content.
3. Wrong options must be plausible but clearly wrong to someone who studied.
4. Ask about specific facts, procedures, numbers, or concepts.
5. Vary question difficulty: mix recall, application, and analysis levels.
6. Do NOT create trivial or obvious questions.
${avoidSection}

Return ONLY a valid JSON array (no markdown, no extra text):
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why this is correct."
  }
]

correctIndex is 0-based. Seed: ${randomSeed}`;
        const result = await callAI(systemPrompt, [
            { role: 'user', content: `Lesson: "${lessonTitle}"\n\nContent:\n${plainText.slice(0, 8000)}\n\nGenerate ${batchCount} unique questions.` },
        ], 4096, 0.9);
        try {
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (!jsonMatch)
                throw new Error('No JSON array found');
            const questions = JSON.parse(jsonMatch[0]);
            allQuestions = allQuestions.concat(questions.slice(0, batchCount));
        }
        catch (err) {
            logger_1.logger.error({ err, batch, result: result.substring(0, 500) }, 'Failed to parse question bank batch');
            if (allQuestions.length === 0) {
                throw new Error('Failed to generate question bank. Please try again.');
            }
            break;
        }
    }
    return allQuestions;
}
async function editBankQuestion(question, instruction) {
    const systemPrompt = `You are an expert exam question editor. You will receive a multiple-choice question and an instruction on how to modify it. Apply the instruction and return the updated question.

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "question": "Updated question text?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Why this is correct."
}

correctIndex is 0-based (0=first, 1=second, 2=third, 3=fourth).
Keep 4 options. Ensure the correctIndex still points to the correct answer after your edit.`;
    const userMsg = `Current question:
Question: ${question.questionText}
Options: ${question.options.map((o, i) => `${i}: ${o}`).join(', ')}
Correct: ${question.correctIndex}
Explanation: ${question.explanation || 'N/A'}

Instruction: ${instruction}`;
    const result = await callAI(systemPrompt, [{ role: 'user', content: userMsg }], 1024, 0.7);
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON object found');
        return JSON.parse(jsonMatch[0]);
    }
    catch (err) {
        logger_1.logger.error({ err, result: result.substring(0, 500) }, 'Failed to parse AI-edited question');
        throw new Error('Failed to edit question with AI. Please try again.');
    }
}
async function bulkEditBankQuestions(questions, instruction) {
    const numbered = questions.map((q, i) => `${i + 1}. ${q.question}\n   Options: ${q.options.join(' | ')}\n   Correct: ${q.correctIndex}\n   Explanation: ${q.explanation || 'N/A'}`).join('\n\n');
    const systemPrompt = `You are an expert exam question editor. You will receive a numbered list of multiple-choice questions and a teacher's instruction on how to modify them.

Apply the instruction to the relevant questions. If the instruction says "all", edit all of them. If it references specific numbers (e.g. "3, 5, 7"), only edit those. Leave other questions UNCHANGED.

Return ONLY a valid JSON array (no markdown, no extra text) with ALL questions (modified and unmodified):
[
  {
    "id": "original-uuid-here",
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why this is correct."
  }
]

IMPORTANT:
- Keep the same "id" for each question so we can match them back.
- correctIndex is 0-based.
- Always return ALL ${questions.length} questions in the same order.`;
    const result = await callAI(systemPrompt, [
        { role: 'user', content: `Questions:\n\n${numbered}\n\nInstruction: ${instruction}` },
    ], 4096, 0.7);
    try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch)
            throw new Error('No JSON array found');
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((q, i) => ({
            id: questions[i]?.id || q.id,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation || '',
        }));
    }
    catch (err) {
        logger_1.logger.error({ err, result: result.substring(0, 500) }, 'Failed to parse bulk AI edit');
        throw new Error('Failed to edit questions with AI. Please try again.');
    }
}
async function generateQuizForTeacher(options) {
    const { topic, count } = options;
    const lessonList = options.lessons?.length
        ? options.lessons
        : (options.lessonContent ? [{ title: options.lessonTitle || topic, content: options.lessonContent }] : []);
    let contentSection = '';
    if (lessonList.length > 0) {
        const perLesson = Math.floor(7000 / lessonList.length);
        contentSection = lessonList.map((l) => {
            const plainText = (l.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return `\n--- LESSON: "${l.title}" ---\n${plainText.slice(0, perLesson)}\n--- END ---`;
        }).join('\n');
        contentSection = `\n\n--- LESSON CONTENT (use as primary source; draw questions from ALL lessons below) ---${contentSection}\n--- END ALL LESSON CONTENT ---`;
    }
    const randomSeed = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const systemPrompt = `You are an expert exam question writer for agricultural training programs. Your job is to create high-quality assessment questions that test real understanding.

RULES:
1. Generate exactly ${count} UNIQUE multiple-choice questions (4 options each).
2. Each question MUST test a DIFFERENT concept, fact, or skill from the content.
3. Questions should test comprehension and application, NOT just memorization of exact phrases.
4. Wrong options (distractors) must be plausible — things a student who didn't study might believe.
5. Vary difficulty: include some straightforward recall, some that require connecting ideas, and some that test application to real scenarios.
6. NEVER repeat the same concept across questions. Cover as many different parts of the content as possible.
7. Write questions a real agricultural teacher would be proud to use in an exam.
${contentSection ? `8. ALL questions must be derived from specific facts or concepts in the lesson content provided below.${lessonList.length > 1 ? ' Spread questions evenly across ALL linked lessons.' : ''}` : ''}

Return ONLY a valid JSON array (no markdown fences, no explanation outside the array):
[
  {
    "questionType": "mcq",
    "questionText": "Clear, specific question?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "A",
    "explanation": "Concise explanation referencing the source material."
  }
]

correctAnswer must be exactly one of: "A", "B", "C", "D".
Randomization seed: ${randomSeed}`;
    const result = await callAI(systemPrompt, [
        { role: 'user', content: `Generate ${count} unique, high-quality quiz questions about "${topic}".${contentSection}\n\nRemember: each question must cover a different aspect. Be creative and varied.` },
    ], 8192, 0.9);
    try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch)
            throw new Error('No JSON array found');
        const questions = JSON.parse(jsonMatch[0]);
        return questions.slice(0, count);
    }
    catch (err) {
        logger_1.logger.error({ err, result: result.substring(0, 500) }, 'Failed to parse teacher quiz questions');
        throw new Error('Failed to generate questions. Please try again.');
    }
}
function buildCurriculumContext(mod, allModules, existingLessons) {
    const otherModules = allModules
        .filter(m => m.id !== mod.id)
        .map(m => `- ${m.title}: ${m.description}`)
        .join('\n');
    const existing = existingLessons.length > 0
        ? existingLessons.map(l => `- ${l.title}`).join('\n')
        : '(none yet)';
    return `You are an expert agricultural curriculum designer at Elite Agro Holding (Al Maha Farm).
You are building training content for the internship program.

CONTEXT:
- Farm environment: Greenhouses and nethouses in UAE desert climate
- Audience: New interns with limited agricultural experience
- Tone: Practical, farm-focused, with real-world examples. NOT academic textbook style.
- Every lesson should connect theory to what interns will actually do on the farm.

CURRENT MODULE: "${mod.title}"
Module description: ${mod.description}

OTHER MODULES IN THE PROGRAM (avoid overlapping content):
${otherModules || '(none)'}

EXISTING LESSONS IN THIS MODULE (avoid duplicating):
${existing}`;
}
async function analyzeOutline(moduleId, outline, referenceText) {
    const mod = await trainingSvc.getModule(moduleId);
    if (!mod)
        throw new Error('Module not found');
    const allModules = await trainingSvc.listModules();
    const existingLessons = await trainingSvc.listLessons(moduleId);
    const context = buildCurriculumContext(mod, allModules, existingLessons);
    const refSection = referenceText
        ? `\n\nREFERENCE MATERIAL (provided by teacher as PDF):\n---\n${referenceText.slice(0, 15000)}\n---\nUse this reference material to enrich your suggestions and ensure accuracy.\n`
        : '';
    const systemPrompt = `${context}${refSection}

The teacher has pasted an outline where each bullet is a LESSON TITLE followed by QUESTIONS that the lesson must answer.
Format: "* Lesson Title: question1? question2? question3?"

Your job is to:
1. Parse each bullet into a lesson title and its questions
2. Suggest improvements: missing questions, better ordering, questions to add/remove/split/merge
3. Propose the final lesson plan with questions for each

Return ONLY a JSON object with this exact format (no markdown, no explanation):
{
  "suggestions": [
    { "type": "add", "text": "Consider adding to 'EC Basics': what units is EC measured in?" },
    { "type": "reorder", "text": "Move 'corrective actions' lesson after 'diagnosing problems'" },
    { "type": "split", "text": "Split 'EC measurement' into two lessons: irrigation water and substrate" },
    { "type": "remove", "text": "Crop rotation is covered in another module, remove to avoid overlap" }
  ],
  "proposedLessons": [
    {
      "title": "Lesson title",
      "questions": ["question 1?", "question 2?", "question 3?"],
      "estimatedMinutes": 15
    }
  ]
}

Keep suggestions practical and concise. Propose 3-8 lessons depending on content scope.`;
    const result = await callAI(systemPrompt, [
        { role: 'user', content: `Here is my outline for the "${mod.title}" module:\n\n${outline}` },
    ], 4096);
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON found');
        return JSON.parse(jsonMatch[0]);
    }
    catch (err) {
        logger_1.logger.error({ err, result }, 'Failed to parse outline analysis');
        throw new Error('Failed to parse AI response. Please try again.');
    }
}
async function generateLessonsFromOutline(moduleId, outline, lessonPlan, referenceText) {
    const mod = await trainingSvc.getModule(moduleId);
    if (!mod)
        throw new Error('Module not found');
    const allModules = await trainingSvc.listModules();
    const existingLessons = await trainingSvc.listLessons(moduleId);
    const context = buildCurriculumContext(mod, allModules, existingLessons);
    const BATCH_SIZE = 2;
    const batches = [];
    for (let i = 0; i < lessonPlan.length; i += BATCH_SIZE) {
        batches.push(lessonPlan.slice(i, i + BATCH_SIZE));
    }
    const allLessons = [];
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        const batchList = batch.map((l, i) => {
            const qs = l.questions.map((q, qi) => `   Q${qi + 1}: ${q}`).join('\n');
            return `${i + 1}. "${l.title}"\n${qs}`;
        }).join('\n\n');
        const refSection = referenceText
            ? `\n\nREFERENCE MATERIAL (provided by teacher as PDF):\n---\n${referenceText.slice(0, 15000)}\n---\nUse this reference material to ensure accuracy and enrich lesson content.\n`
            : '';
        const systemPrompt = `${context}${refSection}

Generate full lesson content for the lessons below. Each lesson has QUESTIONS it must answer.

For each lesson:
1. Create well-structured HTML content that answers ALL the listed questions. The lesson must fully address every question with practical, farm-relevant explanations.
2. Provide a concise plain-text answer for each question (for teacher review).

Use these HTML tags: <h2> for section headings, <p> for paragraphs, <ul>/<li> for lists, <strong> for emphasis, <em> for terms.
Do NOT use <h1> (the lesson title is shown separately).

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "title": "Lesson title",
    "durationMinutes": 20,
    "questions": [
      { "question": "What is EC?", "answer": "EC (Electrical Conductivity) measures the concentration of dissolved salts..." }
    ],
    "content": "<h2>Introduction</h2><p>...</p>..."
  }
]

IMPORTANT:
- The "answer" field should be a clear, concise 1-3 sentence answer the teacher can review and correct.
- The "content" field is the full lesson HTML that covers everything in depth.
- Generate ALL ${batch.length} lessons in this batch.`;
        const result = await callAI(systemPrompt, [
            { role: 'user', content: `Original teacher outline:\n${outline}\n\nLessons to generate (batch ${batchIdx + 1} of ${batches.length}):\n${batchList}` },
        ], 16000);
        try {
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (!jsonMatch)
                throw new Error('No JSON array found in batch response');
            const parsed = JSON.parse(jsonMatch[0]);
            allLessons.push(...parsed);
        }
        catch (err) {
            logger_1.logger.error({ err, result: result.substring(0, 500), batchIdx }, 'Failed to parse generated lessons batch');
            throw new Error(`Failed to generate lessons (batch ${batchIdx + 1}). Please try again.`);
        }
    }
    return allLessons;
}
async function regenerateLesson(moduleId, title, questions) {
    const mod = await trainingSvc.getModule(moduleId);
    if (!mod)
        throw new Error('Module not found');
    const allModules = await trainingSvc.listModules();
    const existingLessons = await trainingSvc.listLessons(moduleId);
    const context = buildCurriculumContext(mod, allModules, existingLessons);
    const qaList = questions.map((qa, i) => `Q${i + 1}: ${qa.question}\nCorrect Answer: ${qa.answer}`).join('\n\n');
    const systemPrompt = `${context}

Regenerate the HTML content for a single lesson based on teacher-corrected answers below.

The teacher has reviewed and corrected the answers. Your job is to write the full lesson HTML that:
- Incorporates the teacher's corrected answers as the definitive truth
- Structures the content clearly with practical farm examples
- Answers every question thoroughly in the lesson body

Use these HTML tags: <h2> for section headings, <p> for paragraphs, <ul>/<li> for lists, <strong> for emphasis, <em> for terms.
Do NOT use <h1>.

Return ONLY a JSON object (no markdown, no explanation):
{
  "title": "Lesson title",
  "content": "<h2>Introduction</h2><p>...</p>...",
  "durationMinutes": 20
}`;
    const result = await callAI(systemPrompt, [
        { role: 'user', content: `Lesson: "${title}"\n\nTeacher-corrected Q&A:\n${qaList}` },
    ], 8192);
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON found');
        return JSON.parse(jsonMatch[0]);
    }
    catch (err) {
        logger_1.logger.error({ err, result: result.substring(0, 500) }, 'Failed to parse regenerated lesson');
        throw new Error('Failed to regenerate lesson. Please try again.');
    }
}
async function chatEditLesson(lessonTitle, currentContent, message, history) {
    const systemPrompt = `You are a lesson content editor for agricultural training. The teacher is editing a lesson titled "${lessonTitle}".

Current lesson HTML content:
---
${currentContent}
---

The teacher will ask you to make changes to this content. You must:
1. Apply the requested changes to the HTML content
2. Provide a brief conversational reply explaining what you changed

Return ONLY a JSON object (no markdown, no explanation outside JSON):
{
  "reply": "Brief explanation of what you changed",
  "updatedContent": "<full updated HTML content here>"
}

Rules:
- Preserve the existing HTML structure (h2, p, ul, li, strong, em)
- Do NOT use <h1>
- Keep changes focused on what the teacher asked
- If the teacher asks a question (not a change request), still return the current content unchanged in updatedContent and answer in reply`;
    const messages = [
        ...history.slice(-10),
        { role: 'user', content: message },
    ];
    const result = await callAI(systemPrompt, messages, 8192);
    try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON found');
        const parsed = JSON.parse(jsonMatch[0]);
        return { reply: parsed.reply || 'Done.', updatedContent: parsed.updatedContent || currentContent };
    }
    catch (err) {
        logger_1.logger.error({ err, result: result.substring(0, 500) }, 'Failed to parse chat-edit response');
        return { reply: 'Sorry, I had trouble processing that. Please try again.', updatedContent: currentContent };
    }
}
