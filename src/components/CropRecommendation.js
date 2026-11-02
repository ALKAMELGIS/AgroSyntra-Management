import { useState, useEffect } from 'react';
import {
  Card, CardContent, Typography, Box, Chip, LinearProgress, List, ListItem, ListItemText,
  Skeleton, Avatar,
} from '@mui/material';
import {
  EmojiNatureOutlined as CropIcon, Star as StarIcon, TrendingUpOutlined as ScoreIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';

const SCORE_COLORS = ['#4caf50', '#8bc34a', '#ffc107', '#ff9800', '#f44336'];

function getScoreColor(score) {
  if (score >= 70) return SCORE_COLORS[0];
  if (score >= 55) return SCORE_COLORS[1];
  if (score >= 40) return SCORE_COLORS[2];
  if (score >= 25) return SCORE_COLORS[3];
  return SCORE_COLORS[4];
}

/**
 * Crop recommendation card component.
 * Shows top recommended crops for a field with reasoning.
 */
export default function CropRecommendation({ fieldId }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fieldId) return;
    setLoading(true);
    apiRequest(`/predictions/crop/${fieldId}`)
      .then((d) => setRecommendations(d || []))
      .catch(() => setRecommendations([]))
      .finally(() => setLoading(false));
  }, [fieldId]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton width="60%" height={32} />
          {[1, 2, 3].map((i) => <Skeleton key={i} height={60} sx={{ mt: 1 }} />)}
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CropIcon /> Crop Recommendations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No recommendations available. Select a field with historical data.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CropIcon /> Top Crop Recommendations
        </Typography>
        <List disablePadding>
          {recommendations.map((rec, index) => (
            <ListItem key={rec.crop_id} divider={index < recommendations.length - 1} sx={{ px: 0 }}>
              <Avatar sx={{ bgcolor: getScoreColor(rec.score), mr: 2, width: 40, height: 40 }}>
                {index === 0 ? <StarIcon /> : index + 1}
              </Avatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>{rec.crop_name}</Typography>
                    <Chip
                      label={`${rec.score}/100`}
                      size="small"
                      sx={{ bgcolor: getScoreColor(rec.score), color: '#fff' }}
                      icon={<ScoreIcon sx={{ color: '#fff !important' }} />}
                    />
                  </Box>
                }
                secondary={
                  <Box sx={{ mt: 0.5 }}>
                    {rec.reasoning.map((r, i) => (
                      <Typography key={i} variant="caption" display="block" color="text.secondary">
                        • {r}
                      </Typography>
                    ))}
                    <LinearProgress
                      variant="determinate"
                      value={rec.score}
                      sx={{ mt: 1, height: 4, borderRadius: 2, bgcolor: '#e0e0e0', '& .MuiLinearProgress-bar': { bgcolor: getScoreColor(rec.score) } }}
                    />
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
