import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, IconButton, Avatar, List, ListItem, ListItemAvatar,
  ListItemText, ListItemSecondaryAction, CircularProgress,
} from '@mui/material';
import { Send as SendIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

/**
 * Reusable comment thread component for any entity.
 * @param {string} entityType - 'harvest', 'field', 'fertigation', 'ecph'
 * @param {string} entityId - UUID of the entity
 */
export default function CommentThread({ entityType, entityId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const notify = useNotification();
  const { user } = useAuth();

  const loadComments = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const data = await apiRequest(`/comments/${entityType}/${entityId}`);
      setComments(data || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    try {
      await apiRequest(`/comments/${entityType}/${entityId}`, {
        method: 'POST',
        body: JSON.stringify({ comment: newComment }),
      });
      setNewComment('');
      loadComments();
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await apiRequest(`/comments/${commentId}`, { method: 'DELETE' });
      loadComments();
    } catch (err) {
      notify.error(err.message);
    }
  };

  if (loading) {
    return <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={24} /></Box>;
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Comments ({comments.length})
      </Typography>
      <List dense disablePadding>
        {comments.map((c) => (
          <ListItem key={c.id} alignItems="flex-start" sx={{ px: 0 }}>
            <ListItemAvatar>
              <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
                {(c.user_name || c.user_email || 'U').charAt(0).toUpperCase()}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                  <Typography variant="subtitle2">{c.user_name || c.user_email || 'User'}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : ''}
                  </Typography>
                </Box>
              }
              secondary={c.comment}
            />
            {(c.user_id === user?.id || ['ceo', 'farm_manager'].includes(user?.role)) && (
              <ListItemSecondaryAction>
                <IconButton size="small" onClick={() => handleDelete(c.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            )}
          </ListItem>
        ))}
        {comments.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No comments yet. Be the first!
          </Typography>
        )}
      </List>
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <TextField
          size="small" fullWidth multiline maxRows={3} placeholder="Write a comment..."
          value={newComment} onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
        />
        <IconButton onClick={handleAdd} color="primary" disabled={!newComment.trim()} aria-label="Send">
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
