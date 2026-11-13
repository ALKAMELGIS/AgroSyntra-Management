import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Paper, LinearProgress, Table, TableHead,
  TableRow, TableCell, TableBody, Chip, Tabs, Tab,
} from '@mui/material';
import { ArrowBackOutlined as ArrowBack } from '@mui/icons-material';
import { useState } from 'react';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import PageTitle from '../../components/PageTitle';

export default function InternshipGrades() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeacher = ['intern_teacher', 'ceo', 'farm_manager', 'operation_manager'].includes(user?.role);
  const [tab, setTab] = useState(0);

  const { data: grades, isLoading } = useQuery({
    queryKey: ['training-grades'],
    queryFn: () => apiRequest('/training/grades'),
    select: (res) => res?.data !== undefined ? res.data : res,
  });

  if (isLoading) return <LinearProgress />;

  if (isTeacher && Array.isArray(grades)) {
    return (
      <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
        <PageTitle sx={{ mb: 1 }}>Grade Book</PageTitle>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          All student progress and quiz scores
        </Typography>

        {grades.map((student) => (
          <Paper key={student.id} sx={{ p: { xs: 3, sm: 4 }, mb: 3 }}>
            <Typography variant="h6" fontWeight={600}>{student.name}</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>{student.email}</Typography>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', my: 2 }}>
              {student.progress?.modules?.map((mod) => (
                <Chip
                  key={mod.id}
                  label={`${mod.title}: ${mod.completed_lessons || 0}/${mod.lesson_count} lessons`}
                  variant="outlined"
                  size="small"
                />
              ))}
            </Box>

            {student.progress?.attempts?.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Quiz</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="center">Score</TableCell>
                    <TableCell align="center">Result</TableCell>
                    <TableCell>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {student.progress.attempts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{a.quiz_title}</TableCell>
                      <TableCell><Chip label={a.quiz_type} size="small" /></TableCell>
                      <TableCell align="center">{a.score}%</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={a.score >= 70 ? 'Pass' : 'Fail'}
                          size="small"
                          color={a.score >= 70 ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>{new Date(a.completed_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        ))}
        {grades.length === 0 && (
          <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
            <Typography color="text.secondary">No students enrolled yet.</Typography>
          </Paper>
        )}
      </Box>
    );
  }

  const studentData = grades || { modules: [], attempts: [] };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>My Grades</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Progress" />
        <Tab label="Quiz Results" />
      </Tabs>

      {tab === 0 && (
        <Box>
          {studentData.modules?.map((mod) => {
            const pct = mod.lesson_count > 0 ? Math.round((mod.completed_lessons || 0) / mod.lesson_count * 100) : 0;
            return (
              <Paper key={mod.id} sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography fontWeight={600}>{mod.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{pct}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
              </Paper>
            );
          })}
        </Box>
      )}

      {tab === 1 && (
        <Paper>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Quiz</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="center">Score</TableCell>
                <TableCell align="center">Correct</TableCell>
                <TableCell align="center">Result</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {studentData.attempts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">No quiz attempts yet</TableCell>
                </TableRow>
              ) : (
                studentData.attempts?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.quiz_title}</TableCell>
                    <TableCell><Chip label={a.quiz_type} size="small" /></TableCell>
                    <TableCell align="center">{a.score}%</TableCell>
                    <TableCell align="center">{a.correct_count}/{a.total_questions}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={a.score >= 70 ? 'Pass' : 'Fail'}
                        size="small"
                        color={a.score >= 70 ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell>{new Date(a.completed_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
