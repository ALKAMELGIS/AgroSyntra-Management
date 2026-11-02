import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';

import { API_BASE as API_URL } from '../config/api';
const TOKEN_KEY = 'almaha_access_token';
const REFRESH_KEY = 'almaha_refresh_token';
const USER_KEY = 'almaha_user';

function MicrosoftCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (errorParam) {
        setError(errorDescription || 'Microsoft login was cancelled or failed');
        setProcessing(false);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setProcessing(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/microsoft/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (data.success) {
          // Save tokens and user
          localStorage.setItem(TOKEN_KEY, data.data.accessToken);
          localStorage.setItem(REFRESH_KEY, data.data.refreshToken);
          localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
          
          // Redirect to home
          window.location.href = '/';
        } else {
          setError(data.error?.message || 'Failed to complete Microsoft login');
          setProcessing(false);
        }
      } catch (err) {
        setError('Failed to connect to server');
        setProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  if (processing) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'var(--bg-page)',
        }}
      >
        <CircularProgress size={48} sx={{ mb: 2 }} />
        <Typography variant="h6">Completing sign in...</Typography>
        <Typography variant="body2" color="text.secondary">
          Please wait while we verify your Microsoft account
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'var(--bg-page)',
        p: 2,
      }}
    >
      <Alert severity="error" sx={{ maxWidth: 400, mb: 3 }}>
        {error}
      </Alert>
      <Button variant="contained" onClick={() => navigate('/login')}>
        Back to Login
      </Button>
    </Box>
  );
}

export default MicrosoftCallback;
