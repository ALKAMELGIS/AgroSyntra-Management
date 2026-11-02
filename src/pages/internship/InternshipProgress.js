import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Grid, LinearProgress, Chip, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import {
  ArrowBack, AccessTime, CheckCircle, Quiz, TrendingUp,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';

function formatTime(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function InternshipProgress() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['my-progress'],
    queryFn: () => apiRequest('/training/my-progress'),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  if (isLoading) return <LinearProgress />;
  if (!data) return <Typography p={3}>Unable to load progress.</Typography>;

  const { modules = [], attempts = [], completedLessons = [], stats = {} } = data;
  const totalLessons = modules.reduce((sum, m) => sum + Number(m.lesson_count || 0), 0);

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/internship')} sx={{ mb: 2 }}>
        Back to Modules
      </Button>

      <Typography variant="h4" fontWeight={700} gutterBottom>My Progress</Typography>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <CheckCircle color="success" sx={{ fontSize: 32, mb: 0.5 }} />
            <Typography variant="h5" fontWeight={700}>{stats.totalLessonsCompleted || 0}</Typography>
            <Typography variant="caption" color="text.secondary">Lessons Completed</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <AccessTime color="primary" sx={{ fontSize: 32, mb: 0.5 }} />
            <Typography variant="h5" fontWeight={700}>{formatTime(stats.totalTimeSeconds)}</Typography>
            <Typography variant="caption" color="text.secondary">Total Time</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Quiz color="secondary" sx={{ fontSize: 32, mb: 0.5 }} />
            <Typography variant="h5" fontWeight={700}>{attempts.length}</Typography>
            <Typography variant="caption" color="text.secondary">Quizzes Taken</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <TrendingUp color="info" sx={{ fontSize: 32, mb: 0.5 }} />
            <Typography variant="h5" fontWeight={700}>{stats.avgQuizScore || 0}%</Typography>
            <Typography variant="caption" color="text.secondary">Avg Quiz Score</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Overall Progress */}
      {totalLessons > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Overall Completion</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2">{stats.totalLessonsCompleted || 0} / {totalLessons} lessons</Typography>
            <Typography variant="body2">{Math.round(((stats.totalLessonsCompleted || 0) / totalLessons) * 100)}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={((stats.totalLessonsCompleted || 0) / totalLessons) * 100} sx={{ height: 10, borderRadius: 5 }} />
        </Paper>
      )}

      {/* Module Breakdown */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Module Progress</Typography>
        {modules.map((m) => {
          const pct = m.lesson_count > 0 ? Math.round(((m.completed_lessons || 0) / m.lesson_count) * 100) : 0;
          return (
            <Box key={m.id} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="body2" fontWeight={500}>{m.title}</Typography>
                <Chip size="small" label={`${m.completed_lessons || 0}/${m.lesson_count}`} color={pct === 100 ? 'success' : 'default'} variant="outlined" />
              </Box>
              <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          );
        })}
      </Paper>

      {/* Completed Lessons */}
      {completedLessons.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Completed Lessons</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Lesson</TableCell>
                <TableCell align="center">Time Spent</TableCell>
                <TableCell align="center">Completed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {completedLessons.map((l) => (
                <TableRow key={l.lesson_id}>
                  <TableCell>{l.lesson_title}</TableCell>
                  <TableCell align="center">{formatTime(l.total_time_seconds)}</TableCell>
                  <TableCell align="center">{new Date(l.completed_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Quiz History */}
      {attempts.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Quiz History</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Quiz</TableCell>
                <TableCell align="center">Score</TableCell>
                <TableCell align="center">Result</TableCell>
                <TableCell align="center">Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attempts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.quiz_title}</TableCell>
                  <TableCell align="center">{a.score}%</TableCell>
                  <TableCell align="center">
                    <Chip size="small" label={a.score >= 70 ? 'Pass' : 'Fail'} color={a.score >= 70 ? 'success' : 'error'} variant="outlined" />
                  </TableCell>
                  <TableCell align="center">{a.completed_at ? new Date(a.completed_at).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
