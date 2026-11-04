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
import { SpaOutlined as EcoIcon, LanguageOutlined as LanguageIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
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

const LOGIN_AR = {
  "Record daily worker activities for your team.": "سجّل الأنشطة اليومية لفريقك.",
  "Scouters and operators sign in with Employee ID + PIN.": "يدخل الكشّافون والمشغّلون برقم الموظف والرمز السري.",
  "Manage your farm operations, from field to forecast.": "أدِر عمليات مزرعتك، من الحقل إلى التوقعات.",
  "Workers": "العمال",
  "Activities": "الأنشطة",
  "Submit": "الإرسال",
  "Scouting": "الكشف",
  "IPM": "المكافحة المتكاملة",
  "Field work": "العمل الميداني",
  "Data Entry": "إدخال البيانات",
  "Analytics": "التحليلات",
  "Reports": "التقارير",
  "Elite Agro Cloud": "إيليت أجرو كلاود",
  "Every field,": "كل حقل،",
  "calmly in view.": "بهدوء أمام عينيك.",
  "Staff login": "دخول الموظفين",
  "Field staff": "العاملون الميدانيون",
  "Team leader": "قائد الفريق",
  "Team leader sign in": "دخول قائد الفريق",
  "Field staff sign in": "دخول العاملين الميدانيين",
  "Welcome back": "أهلاً بعودتك",
  "Enter your Employee ID and PIN to open the Daily Activity Sheet": "أدخل رقم الموظف والرمز السري لفتح ورقة النشاط اليومي",
  "Scouters and operators: Employee ID + PIN for the main app": "الكشّافون والمشغّلون: رقم الموظف والرمز السري للدخول إلى التطبيق",
  "Sign in to your account to continue": "سجّل الدخول إلى حسابك للمتابعة",
  "Employee ID": "رقم الموظف",
  "PIN": "الرمز السري",
  "Open Daily Activity Sheet": "فتح ورقة النشاط اليومي",
  "Sign In": "تسجيل الدخول",
  "Sign in with Microsoft": "الدخول باستخدام Microsoft",
  "or": "أو",
  "Email": "البريد الإلكتروني",
  "Password": "كلمة المرور",
  "Forgot password?": "نسيت كلمة المرور؟",
  "Don't have an account?": "ليس لديك حساب؟",
  "Sign up": "إنشاء حساب",
  "Sign-in type": "نوع الدخول"
};

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
  const { i18n } = useTranslation();
  const isAr = (i18n.language || '').startsWith('ar');
  const tr = (en) => (isAr && LOGIN_AR[en]) || en;
  const switchLanguage = () => {
    const code = isAr ? 'en' : 'ar';
    i18n.changeLanguage(code);
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
  };

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

  const panelCopy = isTeamLeaderMode
    ? tr('Record daily worker activities for your team.')
    : isFieldStaffMode
      ? tr('Scouters and operators sign in with Employee ID + PIN.')
      : tr('Manage your farm operations, from field to forecast.');
  const panelTags = isTeamLeaderMode
    ? ['Workers', 'Activities', 'Submit'].map(tr)
    : isFieldStaffMode
      ? ['Scouting', 'IPM', 'Field work'].map(tr)
      : ['Data Entry', 'Analytics', 'Reports'].map(tr);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', bgcolor: 'background.default' }}>
      {/* Left branded panel — calm field horizon */}
      {!isMobile && (
        <Box
          component="aside"
          sx={{
            width: { md: '46%', lg: '50%' },
            m: 3,
            borderRadius: 6,
            background: 'radial-gradient(120% 90% at 80% 0%, #2a6b4a 0%, #15402c 46%, #0b2418 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            p: { md: 10, lg: 14 },
            position: 'relative',
            overflow: 'hidden',
            color: '#fff',
          }}
        >
          {/* rolling field horizon */}
          <Box
            aria-hidden="true"
            component="svg"
            viewBox="0 0 800 240"
            preserveAspectRatio="none"
            sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '34%', opacity: 0.9 }}
          >
            <path d="M0 150 C 160 110, 320 120, 460 140 S 700 170, 800 130 L800 240 L0 240 Z" fill="rgba(255,255,255,0.04)" />
            <path d="M0 190 C 180 150, 360 170, 520 180 S 720 200, 800 170 L800 240 L0 240 Z" fill="rgba(255,255,255,0.05)" />
            <g stroke="rgba(255,255,255,0.07)" strokeWidth="1" fill="none">
              <path d="M0 210 Q 400 160 800 205" />
              <path d="M0 222 Q 400 180 800 218" />
              <path d="M0 232 Q 400 200 800 230" />
            </g>
          </Box>

          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2.5,
                bgcolor: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <EcoIcon sx={{ fontSize: 22, color: '#fff' }} />
            </Box>
            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: '#fff', letterSpacing: '-0.01em' }}>
              {tr('Elite Agro Cloud')}
            </Typography>
          </Box>

          <Box sx={{ position: 'relative', maxWidth: 540, mb: { md: 20, lg: 24 } }}>
            <Typography
              component="h2"
              sx={{ fontSize: { md: '2.25rem', lg: '2.875rem' }, fontWeight: 600, color: '#fff', lineHeight: 1.08, letterSpacing: '-0.035em', mb: 4 }}
            >
              {tr('Every field,')}<br />{tr('calmly in view.')}
            </Typography>
            <Typography sx={{ fontSize: '1.0625rem', color: 'rgba(255,255,255,0.74)', lineHeight: 1.6, mb: 6 }}>
              {panelCopy}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {panelTags.map((label) => (
                <Box
                  key={label}
                  sx={{
                    px: 3.5,
                    py: 1.5,
                    borderRadius: 999,
                    bgcolor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    fontSize: '0.8125rem',
                    color: 'rgba(255,255,255,0.88)',
                    fontWeight: 500,
                  }}
                >
                  {label}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {/* Right form panel */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          px: { xs: 5, sm: 8 },
          py: { xs: 10, sm: 12 },
        }}
      >
        <Button
          onClick={switchLanguage}
          size="small"
          startIcon={<LanguageIcon sx={{ fontSize: 18 }} />}
          lang={isAr ? 'en' : 'ar'}
          sx={{ position: 'absolute', top: 16, insetInlineEnd: 16, zIndex: 2 }}
        >
          {isAr ? 'English' : 'العربية'}
        </Button>
        <Box sx={{ maxWidth: 400, width: '100%', position: 'relative', zIndex: 1 }}>
          {isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 10 }}>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: 2.5,
                  backgroundImage: (t) => `linear-gradient(145deg, ${t.palette.primary.light}, ${t.palette.primary.dark})`,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <EcoIcon sx={{ fontSize: 20, color: '#fff' }} />
              </Box>
              <Typography sx={{ fontWeight: 600, fontSize: '1.0625rem', color: 'text.primary', letterSpacing: '-0.01em' }}>
                {tr('Elite Agro Cloud')}
              </Typography>
            </Box>
          )}

          <ToggleButtonGroup
            value={loginMode}
            exclusive
            onChange={handleModeChange}
            fullWidth
            size="small"
            sx={{ mb: 8 }}
            aria-label={tr('Sign-in type')}
          >
            <ToggleButton value="staff" sx={{ textTransform: 'none', flex: 1 }}>
              {tr('Staff login')}
            </ToggleButton>
            <ToggleButton value="field-staff" sx={{ textTransform: 'none', flex: 1 }}>
              {tr('Field staff')}
            </ToggleButton>
            <ToggleButton value="team-leader" sx={{ textTransform: 'none', flex: 1 }}>
              {tr('Team leader')}
            </ToggleButton>
          </ToggleButtonGroup>

          <Typography component="h1" sx={{ fontWeight: 600, fontSize: { xs: '1.75rem', sm: '2rem' }, letterSpacing: '-0.03em', lineHeight: 1.15, color: 'text.primary', mb: 2 }}>
            {tr(isTeamLeaderMode ? 'Team leader sign in' : isFieldStaffMode ? 'Field staff sign in' : 'Welcome back')}
          </Typography>
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', mb: 7 }}>
            {isTeamLeaderMode
              ? tr('Enter your Employee ID and PIN to open the Daily Activity Sheet')
              : isFieldStaffMode
                ? tr('Scouters and operators: Employee ID + PIN for the main app')
                : tr('Sign in to your account to continue')}
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
                label={tr('Employee ID')}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                sx={{ mb: 4 }}
                autoComplete="username"
                autoFocus
              />
              <TextField
                fullWidth
                label={tr('PIN')}
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
                {loading ? <CircularProgress size={22} color="inherit" /> : tr('Open Daily Activity Sheet')}
              </Button>
            </form>
          ) : isFieldStaffMode ? (
            <form onSubmit={handleFieldStaffSubmit}>
              <TextField
                fullWidth
                label={tr('Employee ID')}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                sx={{ mb: 4 }}
                autoFocus
              />
              <TextField
                fullWidth
                label={tr('PIN')}
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
                {loading ? <CircularProgress size={22} color="inherit" /> : tr('Sign In')}
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
                    sx={{ mb: 4 }}
                  >
                    {microsoftLoading ? (
                      <CircularProgress size={24} />
                    ) : (
                      <>
                        <MicrosoftIcon />
                        {tr('Sign in with Microsoft')}
                      </>
                    )}
                  </Button>

                  <Divider sx={{ my: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {tr('or')}
                    </Typography>
                  </Divider>
                </>
              )}

              <form onSubmit={handleStaffSubmit}>
                <TextField
                  fullWidth
                  label={tr('Email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  sx={{ mb: 4 }}
                  autoComplete="email"
                />
                <TextField
                  fullWidth
                  label={tr('Password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  sx={{ mb: 3 }}
                  autoComplete="current-password"
                />

                <Box sx={{ textAlign: 'end', mb: 5 }}>
                  <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ color: 'primary.main' }}>
                    {tr('Forgot password?')}
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
                  {loading ? <CircularProgress size={22} color="inherit" /> : tr('Sign In')}
                </Button>
              </form>

              <Typography variant="body2" align="center" sx={{ color: 'text.secondary' }}>
                {tr("Don't have an account?")}{' '}
                <Link component={RouterLink} to="/register" sx={{ color: 'primary.main', fontWeight: 500 }}>
                  {tr('Sign up')}
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
