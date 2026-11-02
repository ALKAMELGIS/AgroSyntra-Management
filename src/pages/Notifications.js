import { useState } from 'react';
import { useApiQuery } from '../hooks/useApiQuery';
import { useQueryClient } from '@tanstack/react-query';
import { ListSkeleton } from '../components/LoadingSkeleton';
import {
  Container,
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Chip,
  CircularProgress,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  NotificationsOutlined as BellIcon,
  WarningOutlined as WarningIcon,
  ErrorOutlined as ErrorIcon,
  InfoOutlined as InfoIcon,
  CheckCircleOutlined as CheckIcon,
  DoneAllOutlined as DoneAllIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { format } from 'date-fns';

const SEVERITY_ICON = {
  critical: <ErrorIcon color="error" />,
  warning: <WarningIcon color="warning" />,
  info: <InfoIcon color="info" />,
  success: <CheckIcon color="success" />,
};

const SEVERITY_COLOR = {
  critical: 'error',
  warning: 'warning',
  info: 'info',
  success: 'success',
};

export default function Notifications() {
  const [filter, setFilter] = useState('all'); // all | unread
  const queryClient = useQueryClient();

  const unreadParam = filter === 'unread' ? '&unread=true' : '';
  const { data: notifications = [], isLoading: loading } = useApiQuery(
    ['notifications', filter],
    `/alerts/notifications?limit=100${unreadParam}`
  );

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/alerts/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      // fail silently
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await apiRequest('/alerts/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ ids: [id] }),
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      // fail silently
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Container maxWidth="md">
      <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BellIcon color="primary" sx={{ fontSize: 28 }} />
            <Typography variant="h5" fontWeight={600}>
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Chip label={`${unreadCount} unread`} color="error" size="small" />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ToggleButtonGroup
              value={filter}
              exclusive
              onChange={(_, v) => v && setFilter(v)}
              size="small"
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="unread">Unread</ToggleButton>
            </ToggleButtonGroup>
            {unreadCount > 0 && (
              <Button size="small" startIcon={<DoneAllIcon />} onClick={handleMarkAllRead}>
                Mark all read
              </Button>
            )}
          </Box>
        </Box>

        {loading ? (
          <ListSkeleton items={6} />
        ) : notifications.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <BellIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </Typography>
          </Box>
        ) : (
          <List>
            {notifications.map((n, i) => (
              <Box key={n.id}>
                {i > 0 && <Divider />}
                <ListItem
                  sx={{
                    bgcolor: n.is_read ? 'transparent' : 'action.hover',
                    borderRadius: 1,
                    cursor: !n.is_read ? 'pointer' : 'default',
                  }}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {SEVERITY_ICON[n.severity] || SEVERITY_ICON.info}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={n.is_read ? 400 : 600}>{n.title}</Typography>
                        <Chip
                          label={n.severity}
                          size="small"
                          color={SEVERITY_COLOR[n.severity] || 'default'}
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {n.message}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {n.created_at ? format(new Date(n.created_at), 'MMM d, yyyy HH:mm') : ''}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        )}
      </Paper>
    </Container>
  );
}
