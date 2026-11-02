import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Button, LinearProgress, Radio,
  RadioGroup, FormControlLabel, FormControl, Alert, Chip, Divider,
} from '@mui/material';
import { ArrowBackOutlined as ArrowBack, TimerOutlined as Timer, CheckCircleOutlined as CheckCircle, CancelOutlined as Cancel } from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import QuizReviewPanel from '../../components/QuizReviewPanel';

export default function InternshipQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [startedAt] = useState(new Date().toISOString());
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['training-quiz', quizId],
    queryFn: () => apiRequest(`/training/quizzes/${quizId}`),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  useEffect(() => {
    if (quiz?.time_limit_minutes && !result) {
      setTimeLeft(quiz.time_limit_minutes * 60);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [quiz, result]);

  const submitMutation = useMutation({
    mutationFn: () => apiRequest(`/training/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers, startedAt }),
    }),
    onSuccess: (res) => {
      const data = res?.data !== undefined ? res.data : res;
      setResult(data);
      if (timerRef.current) clearInterval(timerRef.current);
    },
  });

  useEffect(() => {
    if (timeLeft === 0 && !result) {
      submitMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, result]);

  if (isLoading) return <LinearProgress />;
  if (!quiz) return <Typography p={3}>Quiz not found</Typography>;

  const questions = quiz.questions || [];
  const progress = Object.keys(answers).length / (questions.length || 1) * 100;

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Back
      </Button>

      <Paper sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            {quiz.title}
          </Typography>
          <Chip
            label={quiz.quiz_type === 'practice' ? 'Practice' : 'Graded'}
            color={quiz.quiz_type === 'practice' ? 'default' : 'primary'}
            size="small"
          />
          {timeLeft !== null && !result && (
            <Chip
              icon={<Timer />}
              label={formatTime(timeLeft)}
              color={timeLeft < 60 ? 'error' : 'default'}
              variant="outlined"
            />
          )}
        </Box>

        {!result && <LinearProgress variant="determinate" value={progress} sx={{ mb: 3, height: 6, borderRadius: 3 }} />}

        {result ? (
          <Box>
            <Alert
              severity={result.score >= (quiz.pass_percentage || 70) ? 'success' : 'warning'}
              sx={{ mb: 3 }}
              icon={result.score >= (quiz.pass_percentage || 70) ? <CheckCircle /> : <Cancel />}
            >
              <Typography variant="h6">
                Score: {result.score}% ({result.correct_count}/{result.total_questions} correct)
              </Typography>
              {result.score >= (quiz.pass_percentage || 70)
                ? 'Congratulations! You passed!'
                : `You need ${quiz.pass_percentage || 70}% to pass. Try again!`}
            </Alert>

            <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mt: 2 }}>
              Review Your Answers
            </Typography>
            <QuizReviewPanel
              results={(result.questions || []).map((q) => {
                const userAnswer = answers[q.id] || '';
                const isCorrect = userAnswer.toLowerCase() === q.correct_answer?.toLowerCase();
                let opts = q.options || [];
                if (typeof opts === 'string') {
                  try { opts = JSON.parse(opts); } catch { opts = []; }
                }
                return {
                  ...q,
                  options: opts,
                  userAnswer,
                  isCorrect,
                };
              })}
            />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" onClick={() => navigate(-1)}>
                Back to Module
              </Button>
              <Button variant="contained" onClick={() => { setResult(null); setAnswers({}); setTimeLeft(quiz.time_limit_minutes ? quiz.time_limit_minutes * 60 : null); }}>
                Retake Quiz
              </Button>
            </Box>
          </Box>
        ) : (
          <Box>
            {questions.map((q, idx) => (
              <Box key={q.id} sx={{ mb: 4 }}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  {idx + 1}. {q.question_text}
                </Typography>
                <FormControl>
                  <RadioGroup
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  >
                    {(q.options || ['True', 'False']).map((opt, oi) => {
                      const value = q.question_type === 'mcq'
                        ? String.fromCharCode(65 + oi)
                        : opt;
                      return (
                        <FormControlLabel
                          key={oi}
                          value={value}
                          control={<Radio size="small" />}
                          label={q.question_type === 'mcq' ? `${String.fromCharCode(65 + oi)}. ${opt}` : opt}
                        />
                      );
                    })}
                  </RadioGroup>
                </FormControl>
              </Box>
            ))}

            <Divider sx={{ my: 3 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {Object.keys(answers).length} / {questions.length} answered
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isLoading}
              >
                Submit Quiz
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
