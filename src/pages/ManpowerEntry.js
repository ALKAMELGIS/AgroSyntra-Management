import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Box, Typography, Button, CircularProgress, Chip, Alert,
  AppBar, Toolbar, IconButton, Tooltip,
} from '@mui/material';
import { Logout } from '@mui/icons-material';
import { useWorkerSession, workerLogout, workerApiRequest } from './WorkerLogin';
import DailyActivitySheet from '../components/manpower/DailyActivitySheet';

export default function ManpowerEntry() {
  const { token, worker, workerId, isAuthenticated } = useWorkerSession();

  const [activities, setActivities] = useState([]);
  const [references, setReferences] = useState([]);
  const [fields, setFields] = useState([]);
  const [allWorkers, setAllWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workerId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      workerApiRequest('/manpower/activities'),
      workerApiRequest('/manpower/fields-with-variety'),
      workerApiRequest('/manpower/entry/activity-references').catch(() => []),
    ]).then(([acts, flds, refs]) => {
      setActivities(acts || []);
      setFields(flds || []);
      setReferences(refs || []);
    }).catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, workerId]);

  useEffect(() => {
    if (!workerId || !token) return;
    workerApiRequest('/manpower/workers/search?q=').then(setAllWorkers).catch(() => {});
  }, [token, workerId]);

  const handleSubmit = async (records) => {
    setSubmitting(true);
    try {
      await workerApiRequest('/manpower/records/bulk', {
        method: 'POST',
        body: JSON.stringify({ records }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const checkOverlaps = async (date, workerIds) => {
    if (!workerIds.length) return [];
    return workerApiRequest(`/manpower/records/overlaps?date=${encodeURIComponent(date)}&worker_ids=${workerIds.join(',')}`);
  };

  if (!isAuthenticated || !worker) {
    return <Navigate to="/login?mode=team-leader" replace />;
  }

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }} fontWeight={700}>
            Daily Activity Sheet
          </Typography>
          <Button color="inherit" href="/team-leader/spray-calendar" sx={{ mr: 1 }}>
            Spray Calendar
          </Button>
          <Chip label={worker.name} color="default" sx={{ mr: 1, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} />
          <Tooltip title="Logout">
            <IconButton color="inherit" onClick={() => { workerLogout(); window.location.href = '/login?mode=team-leader'; }}>
              <Logout />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
        )}
        <DailyActivitySheet
          activities={activities}
          references={references}
          fields={fields}
          workers={allWorkers}
          onSubmit={handleSubmit}
          checkOverlaps={checkOverlaps}
          submitting={submitting}
        />
      </Box>
    </Box>
  );
}
