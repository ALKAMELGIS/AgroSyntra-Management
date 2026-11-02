import { useState, useEffect, useMemo } from 'react';
import {
  Container, Paper, Typography, Box, Grid, Card, CardContent, Button, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, IconButton, Avatar, Tooltip,
} from '@mui/material';
import {
  Schedule as ScheduleIcon, Add as AddIcon, Delete as DeleteIcon,
  ChevronLeft as PrevIcon, ChevronRight as NextIcon,
  WbSunny as MorningIcon, WbTwilight as AfternoonIcon, NightsStay as NightIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import { DeleteSelectedButton, RowCheckbox, SelectAllCheckbox, deleteIdsSequentially } from '../components/table/BulkSelect';
import { useRowSelection } from '../hooks/useRowSelection';

const SHIFT_TYPES = [
  { value: 'morning', label: 'Morning', icon: <MorningIcon />, color: '#ff9800', time: { start: '06:00', end: '14:00' } },
  { value: 'afternoon', label: 'Afternoon', icon: <AfternoonIcon />, color: '#2196f3', time: { start: '14:00', end: '22:00' } },
  { value: 'night', label: 'Night', icon: <NightIcon />, color: '#3f51b5', time: { start: '22:00', end: '06:00' } },
];

export default function ShiftSchedule() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.WORKFORCE);
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [fields, setFields] = useState([]);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [form, setForm] = useState({ user_id: '', field_id: '', shift_type: 'morning', notes: '' });
  const notify = useNotification();
  const { activeSiteId } = useActiveSite();
  const [confirm, confirmDialog] = useConfirmDialog();
  const selection = useRowSelection();

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const loadData = () => {
    const siteParam = activeSiteId ? `&site_id=${activeSiteId}` : '';
    const params = `?start_date=${format(weekStart, 'yyyy-MM-dd')}&end_date=${format(weekEnd, 'yyyy-MM-dd')}${siteParam}`;
    apiRequest(`/shifts${params}`).then((d) => setShifts(d || [])).catch(() => setShifts([]));
  };

  useEffect(() => {
    const siteParam = activeSiteId ? `?site_id=${activeSiteId}` : '';
    Promise.all([
      apiRequest('/users').catch(() => []),
      apiRequest(`/fields${siteParam}`).catch(() => []),
    ]).then(([u, f]) => {
      setUsers(u || []);
      setFields(f || []);
    });
  }, [activeSiteId]);

  useEffect(() => {
    loadData();
  }, [weekStart, activeSiteId]);

  const handleCreate = async () => {
    if (readOnly) return;
    if (!form.user_id || !selectedDate) { notify.warning('User and date are required'); return; }
    const shiftInfo = SHIFT_TYPES.find((s) => s.value === form.shift_type);
    try {
      await apiRequest('/shifts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          date: format(selectedDate, 'yyyy-MM-dd'),
          start_time: shiftInfo.time.start,
          end_time: shiftInfo.time.end,
        }),
      });
      notify.success('Shift created');
      setCreateOpen(false);
      setForm({ user_id: '', field_id: '', shift_type: 'morning', notes: '' });
      loadData();
    } catch (err) { notify.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (readOnly) return;
    if (await confirm('Delete this shift?')) {
      try {
        await apiRequest(`/shifts/${id}`, { method: 'DELETE' });
        notify.success('Shift deleted');
        loadData();
      } catch (err) { notify.error(err.message); }
    }
  };

  const handleBulkDelete = async () => {
    if (readOnly) return;
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!(await confirm(`Delete ${ids.length} selected shift(s)?`))) return;
    const deleted = await deleteIdsSequentially(ids, (id) => apiRequest(`/shifts/${id}`, { method: 'DELETE' }));
    selection.clear();
    notify.success(`Deleted ${deleted} shift(s)`);
    loadData();
  };

  const openCreate = (date) => {
    if (readOnly) return;
    setSelectedDate(date);
    setCreateOpen(true);
  };

  // Group shifts by user for the week view
  const shiftsByUser = useMemo(() => {
    const map = {};
    shifts.forEach((s) => {
      const key = s.user_id;
      if (!map[key]) map[key] = { user_name: s.user_name || s.user_email || 'Unknown', shifts: [] };
      map[key].shifts.push(s);
    });
    return Object.entries(map);
  }, [shifts]);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon fontSize="large" /> Shift Schedule
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!readOnly && (
            <>
              <SelectAllCheckbox
                plain
                ids={shifts.map((s) => s.id)}
                selectedIds={selection.selectedIds}
                onToggleAll={selection.toggleAll}
                label="Select all shifts this week"
              />
              <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />
            </>
          )}
          <IconButton onClick={() => setWeekStart(addDays(weekStart, -7))}><PrevIcon /></IconButton>
          <Typography variant="subtitle1" fontWeight={600}>
            {format(weekStart, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
          </Typography>
          <IconButton onClick={() => setWeekStart(addDays(weekStart, 7))}><NextIcon /></IconButton>
        </Box>
      </Box>

      {readOnly && <ReadOnlyBanner message="View only — shift schedule cannot be modified." />}

      {/* Week Calendar Header */}
      <Paper sx={{ mb: 2, overflow: 'auto' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '150px repeat(7, 1fr)', minWidth: 900 }}>
          <Box sx={{ p: 1, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.100' }}>
            <Typography variant="subtitle2" fontWeight={600}>Team Member</Typography>
          </Box>
          {weekDays.map((day) => (
            <Box key={day.toISOString()} sx={{ p: 1, borderRight: 1, borderBottom: 1, borderColor: 'divider', bgcolor: isSameDay(day, new Date()) ? 'primary.50' : 'grey.100', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">{format(day, 'EEE')}</Typography>
              <Typography variant="subtitle2" fontWeight={600}>{format(day, 'd')}</Typography>
              {!readOnly && (
              <IconButton size="small" onClick={() => openCreate(day)} sx={{ mt: 0.5 }}>
                <AddIcon fontSize="small" />
              </IconButton>
              )}
            </Box>
          ))}

          {/* Rows for each user */}
          {shiftsByUser.map(([userId, { user_name, shifts: userShifts }]) => (
            <Box key={userId} sx={{ display: 'contents' }}>
              <Box sx={{ p: 1, borderRight: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>{user_name.charAt(0)}</Avatar>
                <Typography variant="body2" noWrap>{user_name}</Typography>
              </Box>
              {weekDays.map((day) => {
                const dayShifts = userShifts.filter((s) => s.date && isSameDay(new Date(s.date), day));
                return (
                  <Box key={day.toISOString()} sx={{ p: 0.5, borderRight: 1, borderBottom: 1, borderColor: 'divider', minHeight: 60 }}>
                    {dayShifts.map((s) => {
                      const shiftInfo = SHIFT_TYPES.find((t) => t.value === s.shift_type);
                      return (
                        <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mb: 0.5 }}>
                          {!readOnly && (
                            <RowCheckbox
                              id={s.id}
                              selectedIds={selection.selectedIds}
                              onToggle={selection.toggle}
                              label={`Select ${shiftInfo?.label || 'shift'}`}
                            />
                          )}
                          <Tooltip title={`${s.field_name || ''} ${s.notes || ''}`}>
                            <Chip
                              size="small"
                              icon={shiftInfo?.icon}
                              label={shiftInfo?.label}
                              onDelete={readOnly ? undefined : () => handleDelete(s.id)}
                              sx={{ bgcolor: shiftInfo?.color, color: '#fff', '& .MuiChip-deleteIcon': { color: '#fff' } }}
                            />
                          </Tooltip>
                        </Box>
                      );
                    })}
                  </Box>
                );
              })}
            </Box>
          ))}

          {shiftsByUser.length === 0 && (
            <Box sx={{ gridColumn: '1 / -1', p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No shifts scheduled this week. Click + on a day to add one.</Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Shift {selectedDate && `— ${format(selectedDate, 'EEEE, MMM d')}`}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField select label="Team Member" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name || u.email}</MenuItem>)}
            </TextField>
            <TextField select label="Field (optional)" value={form.field_id} onChange={(e) => setForm({ ...form, field_id: e.target.value })}>
              <MenuItem value="">No Field</MenuItem>
              {fields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </TextField>
            <TextField select label="Shift Type" value={form.shift_type} onChange={(e) => setForm({ ...form, shift_type: e.target.value })}>
              {SHIFT_TYPES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label} ({s.time.start}–{s.time.end})</MenuItem>)}
            </TextField>
            <TextField label="Notes" multiline rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create Shift</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Container>
  );
}
