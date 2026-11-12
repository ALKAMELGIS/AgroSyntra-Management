import { useState, useEffect, useMemo } from 'react';
import {
  buildSprayCalendarFieldRows,
  SPRAY_CALENDAR_COLORS,
  formatCalendarDate,
  sprayCalendarApiStartDate,
  dayTypeTooltip,
  bgcolorForDayType,
  formatClockTime,
  formatPhiEndDateTime,
} from '../../utils/sprayCalendarPhi';
import {
  Box, Typography, Paper, IconButton, Tooltip, CircularProgress, FormControl, InputLabel,
  Select, MenuItem, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, Grid,
} from '@mui/material';
import { ChevronLeftOutlined as ChevronLeft, ChevronRightOutlined as ChevronRight, TodayOutlined as Today } from '@mui/icons-material';
import api from '../../utils/api';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import PageTitle from '../../components/PageTitle';

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(y, m, d) {
  return formatCalendarDate(y, m, d);
}

export default function SprayCalendar() {
  const { activeSiteId } = useActiveSite();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [applications, setApplications] = useState([]);
  const [fields, setFields] = useState([]);
  const [filterField, setFilterField] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailDialog, setDetailDialog] = useState({ open: false, app: null });

  const daysInMonth = getDaysInMonth(year, month);
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => { loadData(); }, [year, month, activeSiteId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const startDate = formatDate(year, month, 1);
      const endDate = formatDate(year, month, daysInMonth);
      const phiStartDate = sprayCalendarApiStartDate(year, month);
      const siteParam = activeSiteId ? `&site_id=${activeSiteId}` : '';

      const [appsRes, fieldsRes] = await Promise.all([
        api.get(`/ipm/pesticide-applications?start_date=${phiStartDate}&end_date=${endDate}&limit=200${siteParam}`),
        api.get(`/fields?limit=10000${siteParam}`),
      ]);
      setApplications(appsRes.data.data || []);
      setFields(fieldsRes.data.data || []);
    } catch (err) {
      console.error('Failed to load spray calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateMonth = (delta) => {
    const d = new Date(year, month + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

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

  const todayStr = today.toISOString().split('T')[0];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
        <PageTitle>Spray Calendar</PageTitle>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="spraycalendar-filter-by-field-label-1">Filter by Field</InputLabel>
          <Select labelId="spraycalendar-filter-by-field-label-1" value={filterField} label="Filter by Field" onChange={(e) => setFilterField(e.target.value)}>
            <MenuItem value="">All Fields</MenuItem>
            {fields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Chip size="small" label="Spray Day" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.spray, color: '#fff' }} />
        <Chip size="small" label="PHI Active (No Harvest)" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.phiActive, color: '#fff' }} />
        <Chip size="small" label="PHI Ending Soon" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.phiEnding, color: '#fff' }} />
        <Chip size="small" label="Clear" sx={{ bgcolor: SPRAY_CALENDAR_COLORS.clear, color: '#14532f' }} />
      </Box>

      {/* Month Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 2 }}>
        <IconButton onClick={() => navigateMonth(-1)} aria-label="Previous"><ChevronLeft /></IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600, minWidth: 200, textAlign: 'center' }}>
          {monthName}
        </Typography>
        <IconButton onClick={() => navigateMonth(1)} aria-label="Next"><ChevronRight /></IconButton>
        <Tooltip title="Go to today">
          <IconButton onClick={goToday} aria-label="Go to today"><Today /></IconButton>
        </Tooltip>
      </Box>

      {/* Calendar Grid */}
      <Paper sx={{ overflow: 'auto' }} tabIndex={0} aria-label="Spray calendar">
        <Box sx={{ minWidth: daysInMonth * 36 + 160 }}>
          {/* Header row with day numbers */}
          <Box sx={{ display: 'flex', borderBottom: '2px solid', borderColor: 'divider' }}>
            <Box sx={{ width: 160, minWidth: 160, p: 1, fontWeight: 700, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2">Field</Typography>
            </Box>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const dateStr = formatDate(year, month, d);
              const isToday = dateStr === todayStr;
              const dayName = new Date(year, month, d).toLocaleString('default', { weekday: 'narrow' });
              return (
                <Box key={d} sx={{
                  width: 36, minWidth: 36, textAlign: 'center', p: 0.5,
                  borderRight: '1px solid', borderColor: 'divider',
                  // Today: dark green with white text (the light green with grey
                  // caption text was 1.8:1 contrast).
                  bgcolor: isToday ? 'primary.main' : 'action.hover',
                  color: isToday ? 'primary.contrastText' : 'text.secondary',
                }}>
                  <Typography variant="caption" sx={{ fontSize: '0.6875rem', color: 'inherit' }}>{dayName}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', color: 'inherit' }}>{d}</Typography>
                </Box>
              );
            })}
          </Box>

          {/* Field rows */}
          {calendarData.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {applications.length === 0 ? 'No pesticide applications found for this month' : 'No approved applications found'}
              </Typography>
            </Box>
          ) : (
            calendarData.map(([fieldId, fieldData]) => (
              <Box key={fieldId} sx={{ display: 'flex', borderBottom: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
                <Box sx={{
                  width: 160, minWidth: 160, p: 1, borderRight: '1px solid', borderColor: 'divider',
                  display: 'flex', alignItems: 'center',
                }}>
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
                          transition: 'background-color 0.15s',
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

      {/* Detail Dialog */}
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
                <Typography>{new Date(detailDialog.app.application_date).toLocaleDateString()}</Typography>
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
                <Typography variant="subtitle2" color="text.secondary">Dosage</Typography>
                <Typography>{detailDialog.app.dosage ? `${detailDialog.app.dosage} ${detailDialog.app.dosage_unit || ''}` : '—'}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Method</Typography>
                <Typography sx={{ textTransform: 'capitalize' }}>{detailDialog.app.application_method || '—'}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Operator</Typography>
                <Typography>{detailDialog.app.operator_name || '—'}</Typography>
              </Grid>
              <Grid size={6}>
                <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                <Chip label={detailDialog.app.approval_status} size="small"
                  color={detailDialog.app.approval_status === 'approved' ? 'success' : detailDialog.app.approval_status === 'rejected' ? 'error' : 'warning'} />
              </Grid>
              {detailDialog.app.target_pest && (
                <Grid size={12}>
                  <Typography variant="subtitle2" color="text.secondary">Target Pest</Typography>
                  <Typography>{detailDialog.app.target_pest}</Typography>
                </Grid>
              )}
              {detailDialog.app.notes && (
                <Grid size={12}>
                  <Typography variant="subtitle2" color="text.secondary">Notes</Typography>
                  <Typography>{detailDialog.app.notes}</Typography>
                </Grid>
              )}
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
