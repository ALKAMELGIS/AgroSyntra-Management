import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Divider,
  Chip,
} from '@mui/material';
import {
  Notifications as BellIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { format } from 'date-fns';
import useSocket from '../hooks/useSocket';
import { useNotification } from '../contexts/NotificationContext';

/** Where a clickable notification leads, or null when it has no page of its own. */
function notificationTarget(n) {
  if (n.entity_type === 'phi_conflict') return '/audit/phi-audit-log';
  if (n.entity_type === 'work_order') {
    return `/ipm/pesticide-applications?tab=work-orders${n.entity_id ? `&wo=${n.entity_id}` : ''}`;
  }
  return null;
}

const SEVERITY_ICON = {
  critical: <ErrorIcon fontSize="small" color="error" />,
  warning: <WarningIcon fontSize="small" color="warning" />,
  info: <InfoIcon fontSize="small" color="info" />,
  success: <CheckIcon fontSize="small" color="success" />,
};

export default function NotificationCenter() {
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  const fetchCount = useCallback(async () => {
    try {
      const data = await apiRequest('/alerts/notifications/count');
      setUnreadCount(data?.count || 0);
    } catch {
      // Silently fail - alert system might not be set up yet
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiRequest('/alerts/notifications?limit=10');
      setNotifications(data || []);
    } catch {
      // Silently fail
    }
  }, []);

  const { on, off } = useSocket();
  const notify = useNotification();

  // Poll for unread count every 30 seconds, and react at once to live alerts.
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    const onAlert = (alert) => {
      fetchCount();
      if (alert?.entity_type === 'work_order' && alert.title) notify.info(alert.title);
    };
    on('alert:new', onAlert);
    return () => {
      clearInterval(interval);
      off('alert:new', onAlert);
    };
  }, [fetchCount, on, off, notify]);

  const openNotification = async (n) => {
    const target = notificationTarget(n);
    if (!target) return;
    handleClose();
    if (!n.is_read) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      apiRequest('/alerts/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [n.id] }) }).catch(() => {});
    }
    navigate(target);
  };

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/alerts/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Silently fail
    }
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen}>
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <BellIcon />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: { xs: 'min(380px, calc(100vw - 16px))', sm: 380 },
            maxHeight: { xs: 'min(480px, calc(100dvh - 80px))', sm: 480 },
            borderRadius: 2,
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button size="small" startIcon={<DoneAllIcon />} onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />

        {notifications.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <BellIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">No notifications yet</Typography>
          </Box>
        ) : (
          <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
            {notifications.map((n) => (
              <ListItem
                key={n.id}
                button={Boolean(notificationTarget(n))}
                onClick={() => openNotification(n)}
                sx={{
                  bgcolor: n.is_read ? 'transparent' : 'action.hover',
                  borderLeft: n.is_read ? 'none' : '3px solid',
                  borderColor: n.severity === 'critical' ? 'error.main' : 'warning.main',
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {SEVERITY_ICON[n.severity] || SEVERITY_ICON.info}
                </ListItemIcon>
                <ListItemText
                  primary={n.title}
                  secondary={
                    <>
                      <Typography variant="caption" component="span" color="text.secondary">
                        {n.created_at ? format(new Date(n.created_at), 'MMM d, HH:mm') : ''}
                      </Typography>
                      {' — '}
                      {n.message?.substring(0, 80)}
                    </>
                  }
                  primaryTypographyProps={{ fontWeight: n.is_read ? 400 : 600, fontSize: '0.875rem' }}
                />
              </ListItem>
            ))}
          </List>
        )}

        <Divider />
        <Box sx={{ p: 1, textAlign: 'center' }}>
          <Button
            size="small"
            onClick={() => {
              handleClose();
              navigate('/notifications');
            }}
          >
            View All Notifications
          </Button>
        </Box>
      </Popover>
    </>
  );
}
