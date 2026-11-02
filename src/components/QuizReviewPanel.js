import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { CheckCircle, Cancel } from '@mui/icons-material';

/**
 * Shared post-submit quiz review panel.
 * Supports two question shapes:
 * - Lesson pop quiz: { question, options, correctIndex, userAnswer, isCorrect, explanation }
 * - Standalone quiz: { question_text, options, correct_answer, userAnswer, isCorrect, explanation, question_type }
 */
export default function QuizReviewPanel({ results }) {
  if (!results?.length) return null;

  return (
    <Box sx={{ mt: 2 }}>
      {results.map((r, i) => {
        const isCorrect = r.isCorrect ?? false;
        const questionText = r.question || r.question_text || '';
        const options = r.options || [];
        const explanation = r.explanation;

        let userAnswerText = '';
        let correctAnswerText = '';

        if (typeof r.userAnswer === 'number' && options.length) {
          userAnswerText = options[r.userAnswer] ?? '(no answer)';
          correctAnswerText = options[r.correctIndex] ?? '';
        } else if (r.userAnswer != null && r.userAnswer !== '') {
          userAnswerText = String(r.userAnswer);
          if (r.question_type === 'mcq' && options.length && /^[A-D]$/i.test(r.correct_answer)) {
            const idx = r.correct_answer.toUpperCase().charCodeAt(0) - 65;
            correctAnswerText = `${r.correct_answer}. ${options[idx] || ''}`.trim();
            const userIdx = userAnswerText.toUpperCase().charCodeAt(0) - 65;
            if (options[userIdx]) userAnswerText = `${userAnswerText}. ${options[userIdx]}`;
          } else {
            correctAnswerText = r.correct_answer || '';
          }
        } else {
          userAnswerText = '(no answer)';
          if (r.question_type === 'mcq' && options.length && /^[A-D]$/i.test(r.correct_answer)) {
            const idx = r.correct_answer.toUpperCase().charCodeAt(0) - 65;
            correctAnswerText = `${r.correct_answer}. ${options[idx] || ''}`.trim();
          } else {
            correctAnswerText = r.correct_answer || (typeof r.correctIndex === 'number' ? options[r.correctIndex] : '') || '';
          }
        }

        return (
          <Paper
            key={r.id || i}
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderColor: isCorrect ? 'success.main' : 'error.main',
              bgcolor: isCorrect ? 'success.50' : 'error.50',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
              {isCorrect ? (
                <CheckCircle color="success" fontSize="small" sx={{ mt: 0.3 }} />
              ) : (
                <Cancel color="error" fontSize="small" sx={{ mt: 0.3 }} />
              )}
              <Typography variant="subtitle2" fontWeight={600}>
                Q{i + 1}: {questionText}
              </Typography>
            </Box>

            <Typography variant="body2" sx={{ ml: 3.5, color: isCorrect ? 'success.dark' : 'error.dark' }}>
              Your answer: <strong>{userAnswerText}</strong>
            </Typography>
            <Typography variant="body2" sx={{ ml: 3.5, mt: 0.5 }}>
              Correct answer: <strong>{correctAnswerText}</strong>
            </Typography>

            {explanation && (
              <Box sx={{ ml: 3.5, mt: 1.5, p: 1.5, bgcolor: 'info.50', borderRadius: 1, border: '1px solid', borderColor: 'info.200' }}>
                <Typography variant="caption" fontWeight={700} color="info.dark" display="block" gutterBottom>
                  Explanation
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {explanation}
                </Typography>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}
