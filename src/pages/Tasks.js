import { useState } from 'react';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { useApiQuery } from '../hooks/useApiQuery';
import { useQueryClient } from '@tanstack/react-query';
import { TableSkeleton } from '../components/LoadingSkeleton';
import {
  Container,
  Paper,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Button,
  IconButton,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Assignment as TaskIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Flag as FlagIcon,
  ArrowForward as MoveIcon,
  Delete as DeleteIcon,
  CheckCircleOutline as CheckIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import TaskDetailDialog from '../components/TaskDetailDialog';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import { DeleteSelectedButton, RowCheckbox, SelectAllCheckbox, deleteIdsSequentially } from '../components/table/BulkSelect';
import { useRowSelection } from '../hooks/useRowSelection';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: '#1976d2' },
  { id: 'in_progress', label: 'In Progress', color: '#f57c00' },
  { id: 'done', label: 'Done', color: '#388e3c' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'default' },
  { value: 'medium', label: 'Medium', color: 'primary' },
  { value: 'high', label: 'High', color: 'warning' },
  { value: 'urgent', label: 'Urgent', color: 'error' },
];

const TASK_TYPES = [
  'irrigation', 'fertilization', 'harvesting', 'spraying', 'maintenance', 'inspection', 'general',
];

export default function Tasks() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.WORKFORCE);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', task_type: 'general', priority: 'medium', due_date: '', assigned_to: '' });
  const notify = useNotification();
  const [confirm, confirmDialog] = useConfirmDialog();
  const selection = useRowSelection();
  const { user } = useAuth();
  const { activeSiteId } = useActiveSite();
  const queryClient = useQueryClient();

  // React Query: cached, auto-refetching data
  const tasksEndpoint = activeSiteId ? `/tasks?limit=200&site_id=${activeSiteId}` : '/tasks?limit=200';
  const { data: tasks = [], isLoading: loading } = useApiQuery(['tasks', activeSiteId], tasksEndpoint);
  const { data: users = [] } = useApiQuery(['users'], '/users');

  const handleCreate = async () => {
    if (readOnly) return;
    if (!form.title.trim()) {
      notify.warning('Task title is required');
      return;
    }
    try {
      await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      notify.success('Task created');
      setCreateOpen(false);
      setForm({ title: '', description: '', task_type: 'general', priority: 'medium', due_date: '', assigned_to: '' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleMove = async (taskId, newStatus) => {
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleDelete = async (taskId) => {
    if (!(await confirm('Delete this task?', { title: 'Delete Task' }))) return;
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      notify.success('Task deleted');
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection.selectedIds];
    if (!ids.length) return;
    if (!(await confirm(`Delete ${ids.length} selected task(s)?`, { title: 'Delete selected' }))) return;
    const deleted = await deleteIdsSequentially(ids, (id) => apiRequest(`/tasks/${id}`, { method: 'DELETE' }));
    selection.clear();
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    notify.success(`Deleted ${deleted} task(s)`);
  };

  const getNextStatus = (current) => {
    const order = ['todo', 'in_progress', 'done'];
    const idx = order.indexOf(current);
    return idx < order.length - 1 ? order[idx + 1] : null;
  };

  const getPriorityChip = (priority) => {
    const p = PRIORITIES.find((x) => x.value === priority);
    return p ? <Chip label={p.label} size="small" color={p.color} variant="outlined" /> : null;
  };

  if (loading) {
    return (
      <Container maxWidth="xl">
        <TableSkeleton rows={6} columns={5} />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TaskIcon color="primary" sx={{ fontSize: 28 }} />
          <Typography variant="h5" fontWeight={600}>Tasks</Typography>
          <Chip label={`${tasks.length} total`} size="small" />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!readOnly && (
            <>
              <SelectAllCheckbox
                plain
                ids={tasks.map((t) => t.id)}
                selectedIds={selection.selectedIds}
                onToggleAll={selection.toggleAll}
                label="Select all tasks"
              />
              <DeleteSelectedButton count={selection.size} onClick={handleBulkDelete} />
            </>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} disabled={readOnly}>
            New Task
          </Button>
        </Box>
      </Box>

      {readOnly && <ReadOnlyBanner message="View only — workforce tasks cannot be modified." />}

      <Grid container spacing={3}>
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <Grid size={{ xs: 12, md: 4 }} key={col.id}>
              <Paper
                sx={{
                  p: 2,
                  minHeight: 400,
                  borderTop: `3px solid ${col.color}`,
                  bgcolor: 'background.default',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" fontWeight={600}>{col.label}</Typography>
                  <Chip label={colTasks.length} size="small" />
                </Box>

                {colTasks.map((task) => {
                  const nextStatus = getNextStatus(task.status);
                  const checkProgress = task.checklist_total > 0
                    ? Math.round((task.checklist_done / task.checklist_total) * 100)
                    : null;

                  return (
                    <Card key={task.id} sx={{ mb: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 3 } }} onClick={() => setSelectedTask(task)}>
                      <CardContent sx={{ pb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          {!readOnly && (
                            <Box onClick={(e) => e.stopPropagation()} sx={{ mr: 0.5, mt: -0.5 }}>
                              <RowCheckbox
                                id={task.id}
                                selectedIds={selection.selectedIds}
                                onToggle={selection.toggle}
                                label={`Select task ${task.title}`}
                              />
                            </Box>
                          )}
                          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
                            {task.title}
                          </Typography>
                          {getPriorityChip(task.priority)}
                        </Box>

                        {task.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                            {task.description}
                          </Typography>
                        )}

                        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                          <Chip label={task.task_type} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} />
                          {task.field_name && <Chip label={task.field_name} size="small" variant="outlined" />}
                        </Box>

                        {checkProgress !== null && (
                          <Box sx={{ mt: 1 }}>
                            <LinearProgress variant="determinate" value={checkProgress} sx={{ height: 4, borderRadius: 2 }} />
                            <Typography variant="caption" color="text.secondary">
                              {task.checklist_done}/{task.checklist_total} items
                            </Typography>
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                          {task.assigned_to_name && (
                            <Tooltip title={`Assigned to: ${task.assigned_to_name}`}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Avatar sx={{ width: 20, height: 20, fontSize: 12 }}>
                                  {task.assigned_to_name.charAt(0)}
                                </Avatar>
                                <Typography variant="caption">{task.assigned_to_name}</Typography>
                              </Box>
                            </Tooltip>
                          )}
                          {task.due_date && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                              <CalendarIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {format(new Date(task.due_date), 'MMM d')}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </CardContent>
                      <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
                        {nextStatus && (
                          <Tooltip title={`Move to ${COLUMNS.find((c) => c.id === nextStatus)?.label}`}>
                            <IconButton size="small" onClick={() => handleMove(task.id, nextStatus)}>
                              {nextStatus === 'done' ? <CheckIcon fontSize="small" color="success" /> : <MoveIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                        <IconButton size="small" onClick={() => handleDelete(task.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </CardActions>
                    </Card>
                  );
                })}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Task</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            multiline
            rows={3}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              select
              label="Type"
              value={form.task_type}
              onChange={(e) => setForm({ ...form, task_type: e.target.value })}
              sx={{ flex: 1 }}
            >
              {TASK_TYPES.map((t) => (
                <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Priority"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              sx={{ flex: 1 }}
            >
              {PRIORITIES.map((p) => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              type="date"
              label="Due Date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Assign To"
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create Task</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        users={users}
      />
    </Container>
  );
}
