import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Box, Typography, Paper, IconButton, Tooltip, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Chip, Button, AppBar, Toolbar, Dialog, DialogTitle, DialogContent,
  DialogActions, Grid, Alert,
} from '@mui/material';
import { ChevronLeftOutlined as ChevronLeft, ChevronRightOutlined as ChevronRight, TodayOutlined as Today, LogoutOutlined as Logout, ArrowBackOutlined as ArrowBack } from '@mui/icons-material';
import { workerApiRequest, useWorkerSession, workerLogout } from './WorkerLogin';
import {
  buildSprayCalendarFieldRows,
  SPRAY_CALENDAR_COLORS,
  formatCalendarDate,
  sprayCalendarApiStartDate,
  dayTypeTooltip,
  bgcolorForDayType,
  formatClockTime,
  formatPhiEndDateTime,
} from '../utils/sprayCalendarPhi';

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(y, m, d) {
  return formatCalendarDate(y, m, d);
}

function formatDisplayDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function phiDaysLabel(app) {
  if (app?.phi_days != null && app.phi_days !== '') {
    return String(app.phi_days);
  }
  if (!app?.application_date || !app?.phi_end_date) return '—';
  const start = new Date(String(app.application_date).split('T')[0]);
  const end = new Date(String(app.phi_end_date).split('T')[0]);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) && diff >= 0 ? String(diff) : '—';
}

export default function TeamLeaderSprayCalendar() {
  const { token, worker, workerId, isAuthenticated } = useWorkerSession();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [applications, setApplications] = useState([]);
  const [fields, setFields] = useState([]);
  const [filterField, setFilterField] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [detailDialog, setDetailDialog] = useState({ open: false, app: null });

  const daysInMonth = getDaysInMonth(year, month);
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayStr = today.toISOString().split('T')[0];

  useEffect(() => {
    if (!token || !workerId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        setLoadError('');
        const endDate = formatDate(year, month, daysInMonth);
        const phiStartDate = sprayCalendarApiStartDate(year, month);
        const [appsResult, fieldsResult] = await Promise.allSettled([
          workerApiRequest(`/manpower/spray-calendar/applications?start_date=${phiStartDate}&end_date=${endDate}`),
          workerApiRequest('/manpower/spray-calendar/fields'),
        ]);
        if (appsResult.status === 'fulfilled') {
          setApplications(appsResult.value || []);
        } else {
          setApplications([]);
          setLoadError(appsResult.reason?.message || 'Failed to load spray applications.');
        }
        if (fieldsResult.status === 'fulfilled') {
          setFields(fieldsResult.value || []);
        } else {
          setFields([]);
        }
      } catch (err) {
        console.error(err);
        setLoadError(err.message || 'Failed to load spray calendar.');
        setApplications([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [year, month, daysInMonth, token, workerId]);

  const calendarData = useMemo(
    () => buildSprayCalendarFieldRows({
      applications,
      fields,
      year,
      month,
      daysInMonth,
      filterField,
    }),
    [applications, fields, year, month, daysInMonth, filterField],
  );

  const navigateMonth = (delta) => {
    const d = new Date(year, month + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  if (!isAuthenticated) {
    return <Navigate to="/login?mode=team-leader" replace />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" href="/manpower-entry"><ArrowBack /></IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Spray Calendar (View Only)</Typography>
          <Button color="inherit" startIcon={<Logout />} onClick={() => { workerLogout(); window.location.href = '/login?mode=team-leader'; }}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Read-only spray schedule for {worker?.name || 'team leader'}.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Chip size="small" label="Spray Day" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.spray, color: '#fff' }} />
          <Chip size="small" label="PHI Active (No Harvest)" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.phiActive, color: '#fff' }} />
          <Chip size="small" label="PHI Ending Soon" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.phiEnding, color: '#fff' }} />
          <Chip size="small" label="Clear" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.clear }} />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <IconButton onClick={() => navigateMonth(-1)}><ChevronLeft /></IconButton>
          <Typography variant="h6" sx={{ minWidth: 180, textAlign: 'center' }}>{monthName}</Typography>
          <IconButton onClick={() => navigateMonth(1)}><ChevronRight /></IconButton>
          <Tooltip title="Today">
            <IconButton onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}><Today /></IconButton>
          </Tooltip>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Field</InputLabel>
            <Select label="Field" value={filterField} onChange={(e) => setFilterField(e.target.value)}>
              <MenuItem value="">All fields</MenuItem>
              {fields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {loadError ? (
          <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>
        ) : null}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <Paper sx={{ overflow: 'auto' }}>
            <Box sx={{ minWidth: daysInMonth * 36 + 160 }}>
              <Box sx={{ display: 'flex', borderBottom: '2px solid', borderColor: 'divider' }}>
                <Box sx={{
                  width: 160, minWidth: 160, p: 1, fontWeight: 700, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'action.hover',
                }}
                >
                  <Typography variant="subtitle2">Field</Typography>
                </Box>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = i + 1;
                  const dateStr = formatDate(year, month, d);
                  const isToday = dateStr === todayStr;
                  const dayName = new Date(year, month, d).toLocaleString('default', { weekday: 'narrow' });
                  return (
                    <Box
                      key={d}
                      sx={{
                        width: 36, minWidth: 36, textAlign: 'center', p: 0.5,
                        borderRight: '1px solid', borderColor: 'divider',
                        bgcolor: isToday ? 'primary.light' : 'action.hover',
                        color: isToday ? 'primary.contrastText' : 'text.secondary',
                      }}
                    >
                      <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>{dayName}</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>{d}</Typography>
                    </Box>
                  );
                })}
              </Box>

              {calendarData.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    {loadError
                      ? 'Spray calendar could not be loaded.'
                      : applications.length === 0
                        ? 'No approved spray applications for this period on your site.'
                        : 'No approved applications match the selected field.'}
                  </Typography>
                </Box>
              ) : (
                calendarData.map(([fieldId, fieldData]) => (
                  <Box key={fieldId} sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{
                      width: 160, minWidth: 160, p: 1, borderRight: '1px solid', borderColor: 'divider',
                      display: 'flex', alignItems: 'center',
                    }}
                    >
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{fieldData.name}</Typography>
                    </Box>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = i + 1;
                      const dateStr = formatDate(year, month, d);
                      const dayInfo = fieldData.days[dateStr] || { type: 'clear', apps: [] };
                      const isToday = dateStr === todayStr;
                      const bgcolor = bgcolorForDayType(dayInfo.type);

                      return (
                        <Tooltip key={d} title={dayTypeTooltip(dayInfo)}>
                          <Box
                            onClick={() => dayInfo.apps.length > 0 && setDetailDialog({ open: true, app: dayInfo.apps[0] })}
                            sx={{
                              width: 36, minWidth: 36, height: 36,
                              bgcolor, cursor: dayInfo.apps.length > 0 ? 'pointer' : 'default',
                              borderRight: '1px solid', borderColor: 'divider',
                              outline: isToday ? '2px solid' : 'none',
                              outlineColor: 'primary.main',
                              '&:hover': dayInfo.apps.length > 0 ? { opacity: 0.8 } : {},
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))
              )}
            </Box>
          </Paper>
        )}
      </Box>

      <Dialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, app: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Spray Application Details</DialogTitle>
        <DialogContent>
          {detailDialog.app && (
            <Grid container spacing={2} sx={{ mt: 0 }}>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Product</Typography>
                <Typography>{detailDialog.app.product_name || '—'}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Field</Typography>
                <Typography>{detailDialog.app.field_name || '—'}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Application Date</Typography>
                <Typography>{formatDisplayDate(detailDialog.app.application_date)}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Start Time</Typography>
                <Typography>{formatClockTime(detailDialog.app.application_start_time)}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">End Time</Typography>
                <Typography>{formatClockTime(detailDialog.app.application_end_time)}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">PHI End</Typography>
                <Typography>{formatPhiEndDateTime(detailDialog.app.phi_end_date, detailDialog.app.application_end_time)}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">PHI Days</Typography>
                <Typography>{phiDaysLabel(detailDialog.app)}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Dosage</Typography>
                <Typography>
                  {detailDialog.app.dosage
                    ? `${detailDialog.app.dosage} ${detailDialog.app.dosage_unit || ''}`.trim()
                    : '—'}
                </Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Method</Typography>
                <Typography sx={{ textTransform: 'capitalize' }}>{detailDialog.app.application_method || '—'}</Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog({ open: false, app: null })}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
