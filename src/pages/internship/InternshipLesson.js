import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, LinearProgress, Divider, Chip,
  RadioGroup, FormControlLabel, Radio, Alert, CircularProgress,
} from '@mui/material';
import { ArrowBack, CheckCircle, Timer, NavigateNext, Replay, Quiz } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import QuizReviewPanel from '../../components/QuizReviewPanel';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function decodeHtmlEntities(html) {
  if (!html) return '';
  if (!html.includes('&lt;') && !html.includes('&gt;')) return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

export default function InternshipLesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState('reading');
  const [elapsed, setElapsed] = useState(0);
  const [visitId, setVisitId] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResult, setQuizResult] = useState(null);
  const [noBankMsg, setNoBankMsg] = useState(false);
  const timerRef = useRef(null);
  const visitEndedRef = useRef(false);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ['training-lesson', lessonId],
    queryFn: () => apiRequest(`/training/lessons/${lessonId}`),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  const { data: moduleData } = useQuery({
    queryKey: ['training-module', lesson?.module_id],
    queryFn: () => apiRequest(`/training/modules/${lesson.module_id}`),
    select: (res) => res?.data !== undefined ? res.data : res,
    enabled: !!lesson?.module_id,
  });

  const isCompleted = moduleData?.completedLessonIds?.includes(lessonId);
  const isStudent = user?.role === 'intern_student';

  useEffect(() => {
    setPhase('reading');
    setElapsed(0);
    setVisitId(null);
    setQuizQuestions([]);
    setAnswers({});
    setQuizLoading(false);
    setQuizResult(null);
    setNoBankMsg(false);
    visitEndedRef.current = false;
  }, [lessonId]);

  // Start timer and visit tracking
  useEffect(() => {
    if (!isStudent || !lessonId) return;
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    apiRequest(`/training/lessons/${lessonId}/visit`, { method: 'POST' })
      .then(res => { const data = res?.data !== undefined ? res.data : res; setVisitId(data?.visitId); })
      .catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lessonId, isStudent]);

  const endVisit = useCallback(() => {
    if (visitId && !visitEndedRef.current) {
      visitEndedRef.current = true;
      apiRequest(`/training/lessons/visit/${visitId}/end`, {
        method: 'PUT', body: JSON.stringify({ durationSeconds: elapsed }),
      }).catch(() => {});
    }
  }, [visitId, elapsed]);

  useEffect(() => {
    return () => endVisit();
  }, [endVisit]);

  const handleStartQuiz = async () => {
    setQuizLoading(true);
    try {
      const res = await apiRequest(`/training/lessons/${lessonId}/quiz`, { method: 'POST' });
      const data = res?.data !== undefined ? res.data : res;
      const questions = Array.isArray(data) ? data : [];
      setQuizQuestions(questions);
      setAnswers({});
      setQuizResult(null);
      if (questions.length > 0) {
        setPhase('quiz');
      } else {
        setNoBankMsg(true);
      }
    } catch { setQuizQuestions([]); }
    setQuizLoading(false);
  };

  const handleSubmitQuiz = async () => {
    let correct = 0;
    const results = quizQuestions.map((q, i) => {
      const isCorrect = answers[i] === q.correctIndex;
      if (isCorrect) correct++;
      return { ...q, userAnswer: answers[i], isCorrect };
    });
    const score = Math.round((correct / quizQuestions.length) * 100);
    const passed = score >= 75;

    setQuizResult({ score, correct, total: quizQuestions.length, passed, results });

    if (passed) {
      setPhase('passed');
      endVisit();
      if (!isCompleted) {
        try {
          await apiRequest(`/training/lessons/${lessonId}/complete`, {
            method: 'POST', body: JSON.stringify({ quizScore: score, totalTimeSeconds: elapsed }),
          });
          queryClient.invalidateQueries(['training-modules']);
          queryClient.invalidateQueries(['training-module']);
        } catch {}
      }
    } else {
      setPhase('failed');
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setQuizResult(null);
    setPhase('reading');
    handleStartQuiz();
  };

  const getNextLesson = () => {
    if (!moduleData?.lessons) return null;
    const lessons = moduleData.lessons;
    const currentIdx = lessons.findIndex(l => l.id === lessonId);
    if (currentIdx >= 0 && currentIdx < lessons.length - 1) return lessons[currentIdx + 1];
    return null;
  };

  if (isLoading) return <LinearProgress />;
  if (!lesson) return <Typography p={3}>Lesson not found</Typography>;

  const nextLesson = getNextLesson();

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={() => lesson.module_id ? navigate(`/internship/module/${lesson.module_id}`) : navigate('/internship')}>
          Back to Module
        </Button>
        {isStudent && (
          <Chip icon={<Timer />} label={formatTime(elapsed)} size="small" variant="outlined" sx={{ ml: 'auto' }} />
        )}
      </Box>

      {isCompleted && (
        <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
          You have already completed this lesson. You&apos;re revisiting it.
        </Alert>
      )}

      {/* Reading Phase */}
      {phase === 'reading' && (
        <Paper sx={{ p: 4, mb: 3 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>{lesson.title}</Typography>
          <Divider sx={{ mb: 3 }} />
          <Box
            sx={{ '& h1,& h2,& h3': { mt: 3, mb: 1 }, '& p': { mb: 2, lineHeight: 1.8 }, '& ul,& ol': { pl: 3, mb: 2 }, '& li': { mb: 0.5 } }}
            dangerouslySetInnerHTML={{ __html: decodeHtmlEntities(lesson.content) || '<p>No content yet.</p>' }}
          />
        </Paper>
      )}

      {/* Take Quiz Button */}
      {phase === 'reading' && isStudent && (
        <Box sx={{ textAlign: 'center' }}>
          {noBankMsg ? (
            <Alert severity="info" sx={{ justifyContent: 'center' }}>Quiz not available yet. Your teacher has not generated questions for this lesson.</Alert>
          ) : (
            <Button
              variant="contained" size="large" startIcon={quizLoading ? <CircularProgress size={18} color="inherit" /> : <Quiz />}
              onClick={handleStartQuiz} disabled={quizLoading}
            >
              {quizLoading ? 'Loading Quiz...' : isCompleted ? 'Practice Quiz' : 'Take Quiz to Complete'}
            </Button>
          )}
        </Box>
      )}

      {/* Quiz Phase */}
      {phase === 'quiz' && quizQuestions.length > 0 && (
        <Paper sx={{ p: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>Pop Quiz ({quizQuestions.length} questions)</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Answer at least 3 out of 4 correctly to complete this lesson.
          </Typography>

          {quizQuestions.map((q, i) => (
            <Box key={i} sx={{ mb: 3 }}>
              <Typography fontWeight={500} sx={{ mb: 1 }}>{i + 1}. {q.question}</Typography>
              <RadioGroup value={answers[i] ?? ''} onChange={(e) => setAnswers(prev => ({ ...prev, [i]: parseInt(e.target.value) }))}>
                {(q.options || []).map((opt, oi) => (
                  <FormControlLabel key={oi} value={oi} control={<Radio size="small" />} label={opt} />
                ))}
              </RadioGroup>
            </Box>
          ))}

          <Button
            variant="contained" size="large" fullWidth
            onClick={handleSubmitQuiz}
            disabled={Object.keys(answers).length < quizQuestions.length}
          >
            Submit Answers
          </Button>
        </Paper>
      )}

      {/* Failed Phase */}
      {phase === 'failed' && quizResult && (
        <Paper sx={{ p: 4 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            You scored {quizResult.correct}/{quizResult.total} ({quizResult.score}%). You need at least 75% to pass.
          </Alert>

          <QuizReviewPanel results={quizResult.results} />

          <Button variant="contained" size="large" fullWidth startIcon={<Replay />} onClick={handleRetry} sx={{ mt: 2 }}>
            Try Again (New Questions)
          </Button>
        </Paper>
      )}

      {/* Passed Phase */}
      {phase === 'passed' && quizResult && (
        <Paper sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" fontWeight={700} gutterBottom>Lesson Completed!</Typography>
            <Typography variant="body1" color="text.secondary">
              Score: {quizResult.correct}/{quizResult.total} ({quizResult.score}%) | Time spent: {formatTime(elapsed)}
            </Typography>
          </Box>

          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Review Your Answers</Typography>
          <QuizReviewPanel results={quizResult.results} />

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 3 }}>
            {nextLesson ? (
              <Button variant="contained" size="large" endIcon={<NavigateNext />} onClick={() => navigate(`/internship/lesson/${nextLesson.id}`)}>
                Next Lesson: {nextLesson.title}
              </Button>
            ) : (
              <Button variant="contained" size="large" onClick={() => navigate(lesson.module_id ? `/internship/module/${lesson.module_id}` : '/internship')}>
                Back to Module (All Done!)
              </Button>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
