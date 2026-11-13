import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Grid, Card, CardContent, CardActionArea,
  Chip, LinearProgress, Button, Tabs, Tab, Paper,
} from '@mui/material';
import {
  ArrowBackOutlined as ArrowBack, MenuBookOutlined as MenuBook, QuizOutlined as Quiz, SmartToyOutlined as SmartToy,
  CheckCircleOutlineOutlined as CheckCircleOutline, PlayCircleOutlineOutlined as PlayCircleOutline,
} from '@mui/icons-material';
import { useState } from 'react';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

export default function InternshipModule() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState(0);

  const { data: moduleData, isLoading } = useQuery({
    queryKey: ['training-module', moduleId],
    queryFn: () => apiRequest(`/training/modules/${moduleId}`),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  const completedLessonIds = new Set(moduleData?.completedLessonIds || []);

  if (isLoading) return <LinearProgress />;
  if (!moduleData) return <Typography p={3}>Module not found</Typography>;

  const { lessons = [], quizzes = [], ...mod } = moduleData;

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/internship')} sx={{ mb: 2 }}>
        Back to Modules
      </Button>

      <Typography variant="h4" gutterBottom>
        {mod.title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {mod.description}
      </Typography>

      {user?.role === 'intern_student' && lessons.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" fontWeight={500}>
              Progress: {completedLessonIds.size} / {lessons.length} lessons
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round((completedLessonIds.size / lessons.length) * 100)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(completedLessonIds.size / lessons.length) * 100}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<MenuBook />} label="Lessons" iconPosition="start" />
        <Tab icon={<Quiz />} label="Quizzes" iconPosition="start" />
        <Tab icon={<SmartToy />} label="AI Tutor" iconPosition="start" />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={2}>
          {lessons.length === 0 ? (
            <Grid size={12}>
              <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
                <Typography color="text.secondary">No lessons yet. Teachers can add content.</Typography>
              </Paper>
            </Grid>
          ) : (
            lessons.map((lesson, idx) => {
              const isCompleted = completedLessonIds.has(lesson.id);
              return (
                <Grid size={12} key={lesson.id}>
                  <Card sx={{ '&:hover': { boxShadow: 4 }, transition: 'box-shadow 0.2s', borderLeft: isCompleted ? '4px solid' : 'none', borderColor: 'success.main' }}>
                    <CardActionArea onClick={() => navigate(`/internship/lesson/${lesson.id}`)}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: isCompleted ? 'success.main' : 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                          {isCompleted ? <CheckCircleOutline fontSize="small" /> : idx + 1}
                        </Box>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" fontWeight={600}>{lesson.title}</Typography>
                          {lesson.duration_minutes && (
                            <Typography variant="caption" color="text.secondary">
                              ~{lesson.duration_minutes} min
                            </Typography>
                          )}
                        </Box>
                        {isCompleted
                          ? <Chip label="Completed" size="small" color="success" variant="outlined" />
                          : <PlayCircleOutline color="action" />
                        }
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })
          )}
        </Grid>
      )}

      {tab === 1 && (
        <Grid container spacing={2}>
          {quizzes.length === 0 ? (
            <Grid size={12}>
              <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
                <Typography color="text.secondary">No quizzes available yet.</Typography>
              </Paper>
            </Grid>
          ) : (
            quizzes.map((quiz) => (
              <Grid size={{ xs: 12, sm: 6 }} key={quiz.id}>
                <Card sx={{ '&:hover': { boxShadow: 4 }, transition: 'box-shadow 0.2s' }}>
                  <CardActionArea onClick={() => navigate(`/internship/quiz/${quiz.id}`)}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                        <Quiz color="primary" />
                        <Chip
                          label={quiz.quiz_type === 'practice' ? 'Practice' : 'Graded'}
                          size="small"
                          color={quiz.quiz_type === 'practice' ? 'default' : 'primary'}
                        />
                        {(quiz.linked_lessons?.length ? quiz.linked_lessons : (quiz.lesson_title ? [{ id: 'legacy', title: quiz.lesson_title }] : [])).map((l) => (
                          <Chip key={l.id} label={l.title} size="small" variant="outlined" color="info" />
                        ))}
                      </Box>
                      <Typography variant="subtitle1" fontWeight={600}>{quiz.title}</Typography>
                      {quiz.time_limit_minutes && (
                        <Typography variant="caption" color="text.secondary">
                          Time limit: {quiz.time_limit_minutes} min
                        </Typography>
                      )}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      {tab === 2 && (
        <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <SmartToy sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>AI Tutor</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Ask questions about {mod.title} and get instant explanations.
          </Typography>
          <Button variant="contained" onClick={() => navigate(`/internship/ai-tutor/${moduleId}`)}>
            Start Chat
          </Button>
        </Paper>
      )}
    </Box>
  );
}
