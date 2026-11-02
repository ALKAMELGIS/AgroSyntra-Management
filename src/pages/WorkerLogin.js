import { useState, useMemo, useLayoutEffect, useEffect } from 'react';
import {
  Box, Paper, TextField, Button, Typography, CircularProgress, Alert,
} from '@mui/material';
import { API_BASE } from '../config/api';

const WORKER_TOKEN_KEY = 'almaha_worker_token';
const WORKER_DATA_KEY = 'almaha_worker_data';

export const WORKER_SESSION_UPDATED = 'worker-session-updated';

export function getWorkerToken() {
  return localStorage.getItem(WORKER_TOKEN_KEY);
}

export function getWorkerData() {
  try { return JSON.parse(localStorage.getItem(WORKER_DATA_KEY) || 'null'); } catch { return null; }
}

function readWorkerSession() {
  const token = getWorkerToken();
  const worker = getWorkerData();
  const workerId = worker?.id ?? null;
  return { token, worker, workerId, isAuthenticated: Boolean(token && workerId) };
}

export function workerLogout() {
  localStorage.removeItem(WORKER_TOKEN_KEY);
  localStorage.removeItem(WORKER_DATA_KEY);
  window.dispatchEvent(new CustomEvent(WORKER_SESSION_UPDATED));
}

export function saveWorkerSession(token, worker) {
  localStorage.setItem(WORKER_TOKEN_KEY, token);
  localStorage.setItem(WORKER_DATA_KEY, JSON.stringify(worker));
  window.dispatchEvent(new CustomEvent(WORKER_SESSION_UPDATED));
}

/** Stable team-leader session for effects (worker object only changes when token changes). */
export function useWorkerSession() {
  const [session, setSession] = useState(readWorkerSession);

  useLayoutEffect(() => {
    setSession(readWorkerSession());
  }, []);

  useEffect(() => {
    const sync = () => setSession(readWorkerSession());
    window.addEventListener(WORKER_SESSION_UPDATED, sync);
    return () => window.removeEventListener(WORKER_SESSION_UPDATED, sync);
  }, []);

  const { token, workerId } = session;
  const worker = useMemo(() => session.worker, [token, workerId]);
  return {
    token,
    worker,
    workerId,
    isAuthenticated: Boolean(token && workerId),
  };
}

export async function loginTeamLeader(employeeId, pin) {
  const res = await fetch(`${API_BASE}/manpower/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, pin }),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Login failed');
  }
  if (!data.data.worker?.isTeamLeader) {
    throw new Error('This account is not set up as a team leader. Contact your supervisor.');
  }
  saveWorkerSession(data.data.token, data.data.worker);
  return data.data.worker;
}

export function workerApiRequest(endpoint, options = {}) {
  const token = getWorkerToken();
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    const data = await res.json();
    if (!data.success) {
      const err = new Error(data.error?.message || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return data.data;
  });
}

export default function WorkerLogin() {
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await loginTeamLeader(employeeId, pin);
      window.location.href = '/manpower-entry';
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Paper sx={{ p: 4, width: 360, maxWidth: '90vw' }}>
        <Typography variant="h5" textAlign="center" gutterBottom>
          Team Leader Login
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
          Enter your Employee ID and PIN
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleLogin}>
          <TextField
            fullWidth label="Employee ID" value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            sx={{ mb: 2 }} autoFocus
          />
          <TextField
            fullWidth label="PIN" type="password" value={pin}
            onChange={(e) => setPin(e.target.value)}
            sx={{ mb: 3 }} inputProps={{ maxLength: 8 }}
          />
          <Button
            fullWidth variant="contained" size="large" type="submit"
            disabled={loading || !employeeId || !pin}
          >
            {loading ? <CircularProgress size={24} /> : 'Login'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
