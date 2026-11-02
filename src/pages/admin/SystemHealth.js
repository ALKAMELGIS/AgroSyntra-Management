import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, Chip, CircularProgress, Alert, Button,
  LinearProgress, Divider,
} from '@mui/material';
import {
  CheckCircle, Error as ErrorIcon, Warning, Refresh, Storage, Memory,
  Speed, Timer,
} from '@mui/icons-material';

import { API_BASE } from '../../config/api';

const API_URL = API_BASE;

function StatusChip({ status }) {
  const map = {
    healthy: { color: 'success', icon: <CheckCircle fontSize="small" />, label: 'Healthy' },
    degraded: { color: 'warning', icon: <Warning fontSize="small" />, label: 'Degraded' },
    unhealthy: { color: 'error', icon: <ErrorIcon fontSize="small" />, label: 'Unhealthy' },
    up: { color: 'success', icon: <CheckCircle fontSize="small" />, label: 'Up' },
    down: { color: 'error', icon: <ErrorIcon fontSize="small" />, label: 'Down' },
  };
  const info = map[status] || map.unhealthy;
  return <Chip icon={info.icon} label={info.label} color={info.color} size="small" />;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [healthRes, metricsRes] = await Promise.all([
        fetch(`${API_URL}/health`),
        fetch(`${API_URL}/health/metrics`),
      ]);
      const hData = await healthRes.json();
      const mData = await metricsRes.json();
      if (hData.success) setHealth(hData.data);
      if (mData.success) setMetrics(mData.data);
    } catch (err) {
      setError(err.message || 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !health) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>System Health</Typography>
        <Button startIcon={<Refresh />} onClick={fetchData} disabled={loading}>Refresh</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {health && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Overall Status</Typography>
              <StatusChip status={health.status} />
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Timer color="action" />
                  <Typography variant="body2" color="text.secondary">Uptime</Typography>
                  <Typography variant="h6" fontWeight={600}>{formatUptime(health.uptime)}</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Speed color="action" />
                  <Typography variant="body2" color="text.secondary">Version</Typography>
                  <Typography variant="h6" fontWeight={600}>{health.version}</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Memory color="action" />
                  <Typography variant="body2" color="text.secondary">Heap Used</Typography>
                  <Typography variant="h6" fontWeight={600}>{health.memory?.heapUsedMB || 0} MB</Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Memory color="action" />
                  <Typography variant="body2" color="text.secondary">RSS</Typography>
                  <Typography variant="h6" fontWeight={600}>{health.memory?.rssMB || 0} MB</Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Storage color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>Database</Typography>
                  </Box>
                  <StatusChip status={health.checks.database.status} />
                </Box>
                {health.checks.database.latency != null && (
                  <Typography variant="body2" color="text.secondary">
                    Latency: {health.checks.database.latency}ms
                  </Typography>
                )}
                {health.checks.database.pool && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2">
                      Pool: {health.checks.database.pool.total} total, {health.checks.database.pool.idle} idle, {health.checks.database.pool.waiting} waiting
                    </Typography>
                  </>
                )}
                {health.checks.database.error && (
                  <Typography variant="body2" color="error">{health.checks.database.error}</Typography>
                )}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Speed color="secondary" />
                    <Typography variant="subtitle1" fontWeight={600}>Redis Cache</Typography>
                  </Box>
                  <StatusChip status={health.checks.redis.status} />
                </Box>
                {health.checks.redis.latency != null && (
                  <Typography variant="body2" color="text.secondary">
                    Latency: {health.checks.redis.latency}ms
                  </Typography>
                )}
                {health.checks.redis.error && (
                  <Typography variant="body2" color="error">{health.checks.redis.error}</Typography>
                )}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {metrics && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Request Metrics</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Total Requests</Typography>
              <Typography variant="h5" fontWeight={600}>{metrics.requests?.total?.toLocaleString() || 0}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Errors</Typography>
              <Typography variant="h5" fontWeight={600} color="error">{metrics.requests?.errors || 0}</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Heap Total</Typography>
              <Typography variant="h5" fontWeight={600}>{metrics.memory?.heapTotal || 0} MB</Typography>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">External Memory</Typography>
              <Typography variant="h5" fontWeight={600}>{metrics.memory?.external || 0} MB</Typography>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">Heap Usage</Typography>
            <LinearProgress
              variant="determinate"
              value={metrics.memory ? Math.round((metrics.memory.heapUsed / metrics.memory.heapTotal) * 100) : 0}
              sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
            />
            <Typography variant="caption" color="text.secondary">
              {metrics.memory?.heapUsed || 0} MB / {metrics.memory?.heapTotal || 0} MB
            </Typography>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
