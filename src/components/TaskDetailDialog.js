import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, Box, Typography, Chip, Grid, TextField, Button,
  List, ListItem, ListItemIcon, ListItemText, Checkbox, IconButton, Divider, Avatar, CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon, Send as SendIcon, Add as AddIcon, Person as PersonIcon,
  CalendarToday as CalendarIcon, Flag as FlagIcon, CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { format } from 'date-fns';

const PRIORITY_COLORS = { low: 'default', medium: 'info', high: 'warning', urgent: 'error' };

export default function TaskDetailDialog({ task, open, onClose, users = [] }) {
  const [comments, setComments] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);
  const notify = useNotification();

  const loadDetails = useCallback(async () => {
    if (!task?.id) return;
    setLoading(true);
    try {
      const [c, cl] = await Promise.all([
        apiRequest(`/tasks/${task.id}/comments`),
        apiRequest(`/tasks/${task.id}/checklist`),
      ]);
      setComments(c || []);
      setChecklist(cl || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [task?.id]);

  useEffect(() => {
    if (open && task?.id) loadDetails();
  }, [open, task?.id, loadDetails]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await apiRequest(`/tasks/${task.id}/comments`, {
        method: 'POST', body: JSON.stringify({ comment: newComment }),
      });
      setNewComment('');
      loadDetails();
    } catch (err) { notify.error(err.message); }
  };

  const handleAddChecklistItem = async () => {
    if (!newItem.trim()) return;
    try {
      await apiRequest(`/tasks/${task.id}/checklist`, {
        method: 'POST', body: JSON.stringify({ item: newItem }),
      });
      setNewItem('');
      loadDetails();
    } catch (err) { notify.error(err.message); }
  };

  const handleToggleItem = async (itemId) => {
    try {
      await apiRequest(`/tasks/checklist/${itemId}/toggle`, { method: 'PUT' });
      loadDetails();
    } catch (err) { notify.error(err.message); }
  };

  if (!task) return null;

  const assignedUser = users.find((u) => u.id === task.assigned_to);
  const completedCount = checklist.filter((i) => i.is_completed).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{task.title}</Typography>
          <Chip label={task.priority} color={PRIORITY_COLORS[task.priority] || 'default'} size="small" />
          <Chip label={task.status?.replace('_', ' ')} size="small" variant="outlined" />
        </Box>
        <IconButton onClick={onClose} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box> : (
          <Grid container spacing={3}>
            {/* Task Info */}
            <Grid item xs={12}>
              {task.description && <Typography variant="body1" sx={{ mb: 2 }}>{task.description}</Typography>}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {assignedUser && (
                  <Chip icon={<PersonIcon />} label={assignedUser.name || assignedUser.email} size="small" />
                )}
                {task.due_date && (
                  <Chip icon={<CalendarIcon />} label={`Due: ${format(new Date(task.due_date), 'MMM d, yyyy')}`} size="small" />
                )}
                <Chip icon={<FlagIcon />} label={task.task_type} size="small" variant="outlined" />
              </Box>
            </Grid>

            {/* Checklist */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Checklist {checklist.length > 0 && `(${completedCount}/${checklist.length})`}
              </Typography>
              <List dense disablePadding>
                {checklist.map((item) => (
                  <ListItem key={item.id} disablePadding>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        checked={item.is_completed}
                        onChange={() => handleToggleItem(item.id)}
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.item}
                      sx={{ textDecoration: item.is_completed ? 'line-through' : 'none', opacity: item.is_completed ? 0.6 : 1 }}
                    />
                  </ListItem>
                ))}
              </List>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  size="small" fullWidth placeholder="Add checklist item..."
                  value={newItem} onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                />
                <IconButton onClick={handleAddChecklistItem} color="primary"><AddIcon /></IconButton>
              </Box>
            </Grid>

            <Grid item xs={12}><Divider /></Grid>

            {/* Comments */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Comments ({comments.length})
              </Typography>
              <List disablePadding>
                {comments.map((c) => (
                  <ListItem key={c.id} alignItems="flex-start" sx={{ px: 0 }}>
                    <Avatar sx={{ width: 32, height: 32, mr: 1.5, mt: 0.5, fontSize: 14 }}>
                      {(c.user_name || c.user_email || 'U').charAt(0).toUpperCase()}
                    </Avatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="subtitle2">{c.user_name || c.user_email || 'User'}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {c.created_at ? format(new Date(c.created_at), 'MMM d, h:mm a') : ''}
                          </Typography>
                        </Box>
                      }
                      secondary={c.comment}
                    />
                  </ListItem>
                ))}
                {comments.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No comments yet
                  </Typography>
                )}
              </List>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  size="small" fullWidth multiline maxRows={3} placeholder="Write a comment..."
                  value={newComment} onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                />
                <IconButton onClick={handleAddComment} color="primary"><SendIcon /></IconButton>
              </Box>
            </Grid>
          </Grid>
        )}
      </DialogContent>
    </Dialog>
  );
}
