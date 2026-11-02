import { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  CircularProgress,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Spa as EcoIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { getFriendlyError } from '../utils/errorMessages';
import { API_BASE as API_URL } from '../config/api';
import { loginTeamLeader } from './WorkerLogin';

const MicrosoftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" style={{ marginRight: 8 }}>
    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
  </svg>
);

function Login() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'team-leader'
    ? 'team-leader'
    : searchParams.get('mode') === 'field-staff'
      ? 'field-staff'
      : 'staff';
  const [loginMode, setLoginMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [error, setError] = useState('');
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const { login, pinLogin } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTeamLeaderMode = loginMode === 'team-leader';
  const isFieldStaffMode = loginMode === 'field-staff';

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'team-leader') setLoginMode('team-leader');
    if (mode === 'field-staff') setLoginMode('field-staff');
  }, [searchParams]);

  const handleFieldStaffSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await pinLogin(employeeId, pin);
      navigate('/');
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkMicrosoft = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/microsoft/status`);
        const data = await response.json();
        if (data.success && data.data?.enabled) {
          setMicrosoftEnabled(true);
        }
      } catch {
        // Microsoft auth not available
      }
    };
    checkMicrosoft();
  }, []);

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTeamLeaderSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await loginTeamLeader(employeeId, pin);
      navigate('/manpower-entry');
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setError('');
    setMicrosoftLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/microsoft/login`);
      const data = await response.json();

      if (data.success && data.data?.authUrl) {
        window.location.href = data.data.authUrl;
      } else {
        setError(getFriendlyError(data.error?.message || 'Failed to start Microsoft login'));
        setMicrosoftLoading(false);
      }
    } catch (err) {
      setError(getFriendlyError(err));
      setMicrosoftLoading(false);
    }
  };

  const handleModeChange = (_, nextMode) => {
    if (!nextMode) return;
    setLoginMode(nextMode);
    setError('');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      {/* Left branded panel */}
      {!isMobile && (
        <Box
          sx={{
            width: '50%',
            background: 'linear-gradient(160deg, #2d6a3f 0%, #3d7c4f 50%, #5a9e6b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 8,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: 0.06,
              backgroundImage: `radial-gradient(circle at 25% 25%, #fff 1px, transparent 1px),
                                radial-gradient(circle at 75% 75%, #fff 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />
          <Box sx={{ position: 'relative', textAlign: 'center', maxWidth: 400 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 4,
              }}
            >
              <EcoIcon sx={{ fontSize: 36, color: '#fff' }} />
            </Box>
            <Typography sx={{ fontSize: '2rem', fontWeight: 700, color: '#fff', mb: 2, lineHeight: 1.2 }}>
              Elite Agro Cloud
            </Typography>
            <Typography sx={{ fontSize: '1.125rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, mb: 4 }}>
              {isTeamLeaderMode
                ? 'Record daily worker activities for your team.'
                : isFieldStaffMode
                  ? 'Scouters and operators sign in with Employee ID + PIN.'
                  : 'Manage your farm operations, from field to forecast.'}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
              {(isTeamLeaderMode
                ? ['Workers', 'Activities', 'Submit']
                : isFieldStaffMode
                  ? ['Scouting', 'IPM', 'Field work']
                  : ['Data Entry', 'Analytics', 'Reports']).map((label) => (
                <Box
                  key={label}
                  sx={{
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  <Typography sx={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {/* Right form panel */}
      <Box
        sx={{
          width: isMobile ? '100%' : '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#faf8f5',
          p: 4,
        }}
      >
        <Box sx={{ maxWidth: 400, width: '100%' }}>
          {isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 6 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <EcoIcon sx={{ fontSize: 20, color: '#fff' }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: 'text.primary' }}>
                Elite Agro Cloud
              </Typography>
            </Box>
          )}

          <ToggleButtonGroup
            value={loginMode}
            exclusive
            onChange={handleModeChange}
            fullWidth
            size="small"
            sx={{ mb: 4 }}
          >
            <ToggleButton value="staff" sx={{ textTransform: 'none', flex: 1 }}>
              Staff login
            </ToggleButton>
            <ToggleButton value="field-staff" sx={{ textTransform: 'none', flex: 1 }}>
              Field staff
            </ToggleButton>
            <ToggleButton value="team-leader" sx={{ textTransform: 'none', flex: 1 }}>
              Team leader
            </ToggleButton>
          </ToggleButtonGroup>

          <Typography sx={{ fontWeight: 700, fontSize: '1.5rem', color: 'text.primary', mb: 1 }}>
            {isTeamLeaderMode ? 'Team leader sign in' : isFieldStaffMode ? 'Field staff sign in' : 'Welcome back'}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 4 }}>
            {isTeamLeaderMode
              ? 'Enter your Employee ID and PIN to open the Daily Activity Sheet'
              : isFieldStaffMode
                ? 'Scouters and operators: Employee ID + PIN for the main app'
                : 'Sign in to your account to continue'}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 4 }}>
              {error}
            </Alert>
          )}

          {isTeamLeaderMode ? (
            <form onSubmit={handleTeamLeaderSubmit}>
              <TextField
                fullWidth
                label="Employee ID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                sx={{ mb: 4 }}
                autoComplete="username"
                autoFocus
              />
              <TextField
                fullWidth
                label="PIN"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                sx={{ mb: 4 }}
                inputProps={{ maxLength: 8 }}
                autoComplete="current-password"
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading || !employeeId || !pin}
                sx={{ py: 2.5 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Open Daily Activity Sheet'}
              </Button>
            </form>
          ) : isFieldStaffMode ? (
            <form onSubmit={handleFieldStaffSubmit}>
              <TextField
                fullWidth
                label="Employee ID"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                sx={{ mb: 4 }}
                autoFocus
              />
              <TextField
                fullWidth
                label="PIN"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                sx={{ mb: 4 }}
                inputProps={{ maxLength: 8 }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading || !employeeId || !pin}
                sx={{ py: 2.5 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Sign In'}
              </Button>
            </form>
          ) : (
            <>
              {microsoftEnabled && (
                <>
                  <Button
                    variant="outlined"
                    fullWidth
                    size="large"
                    onClick={handleMicrosoftLogin}
                    disabled={microsoftLoading}
                    sx={{ mb: 4, borderColor: '#d6d3ce', color: '#1a1a1a' }}
                  >
                    {microsoftLoading ? (
                      <CircularProgress size={24} />
                    ) : (
                      <>
                        <MicrosoftIcon />
                        Sign in with Microsoft
                      </>
                    )}
                  </Button>

                  <Divider sx={{ my: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      or
                    </Typography>
                  </Divider>
                </>
              )}

              <form onSubmit={handleStaffSubmit}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  sx={{ mb: 4 }}
                  autoComplete="email"
                />
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  sx={{ mb: 3 }}
                  autoComplete="current-password"
                />

                <Box sx={{ textAlign: 'right', mb: 4 }}>
                  <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ color: 'primary.main' }}>
                    Forgot password?
                  </Link>
                </Box>

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  disabled={loading}
                  sx={{ mb: 4, py: 2.5 }}
                >
                  {loading ? <CircularProgress size={24} /> : 'Sign In'}
                </Button>
              </form>

              <Typography variant="body2" align="center" sx={{ color: 'text.secondary' }}>
                Don&apos;t have an account?{' '}
                <Link component={RouterLink} to="/register" sx={{ color: 'primary.main', fontWeight: 500 }}>
                  Sign up
                </Link>
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default Login;
