import { Box, Typography, Skeleton } from '@mui/material';
import { NavigationOutlined as Navigation, CloudQueueOutlined as CloudQueue } from '@mui/icons-material';
import { windDirectionLabel } from '../../utils/siteFieldWeather';

export default function FieldWeatherStrip({ weather, loading = false, variant = 'compact' }) {
  if (loading) {
    return <Skeleton variant="text" width="90%" height={14} sx={{ mt: 0.5 }} />;
  }
  if (!weather) return null;

  const temp = weather.avgTemp != null ? `${Number(weather.avgTemp).toFixed(0)}°C` : '--';
  const rh = weather.avgRH != null ? `${Math.round(weather.avgRH)}%` : '--';
  const wind = weather.windSpeed != null ? `${Number(weather.windSpeed).toFixed(1)} m/s` : '--';
  const dir = windDirectionLabel(weather.windDirection);
  const clouds = weather.clouds != null ? `${Math.round(weather.clouds)}%` : '--';

  if (variant === 'detail') {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Temp</Typography>
          <Typography variant="body2" fontWeight={600}>{temp}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Humidity</Typography>
          <Typography variant="body2" fontWeight={600}>{rh}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Wind</Typography>
          <Typography variant="body2" fontWeight={600}>{wind}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Direction</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Navigation
              sx={{
                fontSize: 14,
                color: '#0288d1',
                transform: weather.windDirection != null ? `rotate(${weather.windDirection}deg)` : 'none',
              }}
            />
            <Typography variant="body2" fontWeight={600}>{dir}</Typography>
          </Box>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Clouds</Typography>
          <Typography variant="body2" fontWeight={600}>{clouds}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.4,
        mt: 0.6,
        flexWrap: 'wrap',
      }}
    >
      <CloudQueue sx={{ fontSize: 11, color: '#0288d1', flexShrink: 0 }} />
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.6875rem',
          lineHeight: 1.3,
          color: 'text.secondary',
          fontWeight: 500,
        }}
      >
        {temp}
        <Box component="span" sx={{ mx: 0.35, opacity: 0.5 }}>·</Box>
        {rh}
        <Box component="span" sx={{ mx: 0.35, opacity: 0.5 }}>·</Box>
        {wind}
        <Box component="span" sx={{ mx: 0.35, opacity: 0.5 }}>·</Box>
        {dir}
        <Box component="span" sx={{ mx: 0.35, opacity: 0.5 }}>·</Box>
        {clouds}
      </Typography>
    </Box>
  );
}
