import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Grid, Card, CardContent, CardActionArea,
  LinearProgress, Chip, Button, Paper,
} from '@mui/material';
import {
  ScienceOutlined, AgricultureOutlined, BugReportOutlined,
  OpacityOutlined, Inventory2Outlined, BuildOutlined, SchoolOutlined,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const MODULE_ICONS = {
  Science: ScienceOutlined,
  Agriculture: AgricultureOutlined,
  BugReport: BugReportOutlined,
  Opacity: OpacityOutlined,
  Inventory2: Inventory2Outlined,
  Build: BuildOutlined,
};

export default function InternshipModules() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeacher = ['intern_teacher', 'ceo', 'farm_manager', 'operation_manager'].includes(user?.role);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['training-modules'],
    queryFn: () => apiRequest('/training/modules'),
    select: (res) => Array.isArray(res) ? res : (res?.data || []),
  });

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Internship Training
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Complete all 6 modules to finish your internship program
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {user?.role === 'intern_student' && (
            <Button variant="outlined" onClick={() => navigate('/internship/progress')}>
              My Progress
            </Button>
          )}
          {isTeacher && (
            <Button variant="contained" onClick={() => navigate('/internship/teacher')}>
              Teacher Panel
            </Button>
          )}
        </Box>
      </Box>

      {isLoading ? (
        <LinearProgress />
      ) : (
        <Grid container spacing={3}>
          {modules.map((mod) => {
            const IconComp = MODULE_ICONS[mod.icon] || SchoolOutlined;
            const progress = mod.lesson_count > 0
              ? Math.round((mod.completed_lessons || 0) / mod.lesson_count * 100)
              : 0;

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={mod.id}>
                <Card sx={{ height: '100%', position: 'relative', '&:hover': { boxShadow: 6 }, transition: 'box-shadow 0.2s' }}>
                  <CardActionArea onClick={() => navigate(`/internship/module/${mod.id}`)} sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.selected', color: 'primary.main' }}>
                          <IconComp fontSize="large" />
                        </Box>
                        <Chip label={`Module ${mod.sort_order}`} size="small" variant="outlined" />
                      </Box>
                      <Typography variant="h6" fontWeight={600} gutterBottom>
                        {mod.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, flexGrow: 1 }}>
                        {mod.description}
                      </Typography>
                      <Box sx={{ mt: 'auto' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {mod.completed_lessons || 0} / {mod.lesson_count} lessons
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {mod.quiz_count} quiz{mod.quiz_count !== 1 ? 'zes' : ''}
                          </Typography>
                        </Box>
                        {user?.role === 'intern_student' && (
                          <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        )}
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
