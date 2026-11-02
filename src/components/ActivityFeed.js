import { useState, useEffect } from 'react';
import {
  List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography, Box, Chip, Skeleton, Paper,
} from '@mui/material';
import {
  Agriculture as HarvestIcon, WaterDrop as WaterIcon, Science as EcphIcon,
  Assignment as TaskIcon, Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';

const ACTION_ICONS = {
  harvest: <HarvestIcon />,
  fertigation: <WaterIcon />,
  ecph: <EcphIcon />,
  task: <TaskIcon />,
  default: <EditIcon />,
};

const ACTION_COLORS = {
  CREATE: '#4caf50',
  UPDATE: '#1976d2',
  DELETE: '#ef5350',
};

function formatAction(entry) {
  const user = entry.user_name || entry.user_email || 'Someone';
  const entity = entry.entity_type?.replace(/_/g, ' ') || 'item';
  const actions = { CREATE: 'created', UPDATE: 'updated', DELETE: 'deleted' };
  const action = actions[entry.action] || entry.action?.toLowerCase() || 'modified';
  return `${user} ${action} a ${entity} entry`;
}

export default function ActivityFeed({ limit = 15, compact = false }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest(`/activity?limit=${limit}`)
      .then((data) => setActivities(data || []))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) {
    return (
      <Box>
        {[...Array(5)].map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <Skeleton variant="circular" width={36} height={36} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="80%" />
              <Skeleton width="40%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (activities.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
        No recent activity
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {activities.map((activity) => (
        <ListItem key={activity.id} alignItems="flex-start" sx={{ px: compact ? 0 : 2 }}>
          <ListItemAvatar>
            <Avatar
              sx={{
                width: 36, height: 36,
                bgcolor: ACTION_COLORS[activity.action] || '#757575',
              }}
            >
              {ACTION_ICONS[activity.entity_type] || ACTION_ICONS.default}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={formatAction(activity)}
            secondary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ''}
                </Typography>
                {activity.field_name && (
                  <Chip label={activity.field_name} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                )}
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}
