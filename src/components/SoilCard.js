import { Card, CardContent, Typography, Box, Grid } from '@mui/material';
import { Grass } from '@mui/icons-material';

function SoilCard({ fieldName, soilData }) {
  if (!soilData) {
    return (
      <Card sx={{ height: '100%', opacity: 0.6 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Grass sx={{ fontSize: 18, color: '#7f8c8d' }} />
            <Typography variant="h6">{fieldName}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            No soil data available
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const fmt = (val, unit, decimals = 1) =>
    val !== null && val !== undefined ? `${Number(val).toFixed(decimals)} ${unit}` : `-- ${unit}`;

  const moisture = soilData.moisture_pct;
  const heroText = moisture !== null && moisture !== undefined
    ? `${Number(moisture).toFixed(1)} %`
    : '-- %';

  const getMoistureColor = (pct) => {
    if (pct == null) return '#7f8c8d';
    if (pct < 20) return '#e74c3c';
    if (pct < 40) return '#f39c12';
    if (pct <= 70) return '#27ae60';
    return '#2980b9';
  };

  const dateLabel = soilData.date
    ? new Date(soilData.date).toLocaleDateString()
    : '';

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 2,
        background: 'linear-gradient(135deg, rgba(232, 245, 233, 0.95) 0%, rgba(241, 248, 233, 0.95) 100%)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 6px 12px rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Grass sx={{ fontSize: 18, color: '#4caf50' }} />
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, color: '#2c3e50', fontSize: '1.1rem' }}
            >
              {fieldName}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: '#7f8c8d', fontSize: '0.75rem' }}>
            Soil Sensor {dateLabel ? `\u2022 ${dateLabel}` : ''} {soilData.source ? `\u2022 ${soilData.source}` : ''}
          </Typography>
        </Box>

        <Box sx={{ mb: 2.5, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#7f8c8d', display: 'block', mb: 0.5 }}>
            Moisture
          </Typography>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              color: getMoistureColor(moisture),
              fontSize: '2.5rem',
              lineHeight: 1.2,
            }}
          >
            {heroText}
          </Typography>
        </Box>

        <Grid container spacing={1.5}>
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#34495e', fontSize: '0.875rem' }}>
                Soil Temp
              </Typography>
              <Typography variant="body2" sx={{ color: '#2c3e50', fontSize: '0.875rem', fontWeight: 500 }}>
                {fmt(soilData.temperature_c, '\u00b0C')}
              </Typography>
            </Box>
          </Grid>

          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#34495e', fontSize: '0.875rem' }}>
                EC
              </Typography>
              <Typography variant="body2" sx={{ color: '#2c3e50', fontSize: '0.875rem', fontWeight: 500 }}>
                {fmt(soilData.ec_dsm, 'dS/m', 2)}
              </Typography>
            </Box>
          </Grid>

          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#34495e', fontSize: '0.875rem' }}>
                pH
              </Typography>
              <Typography variant="body2" sx={{ color: '#2c3e50', fontSize: '0.875rem', fontWeight: 500 }}>
                {fmt(soilData.ph, '', 1)}
              </Typography>
            </Box>
          </Grid>

          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#34495e', fontSize: '0.875rem' }}>
                Depth
              </Typography>
              <Typography variant="body2" sx={{ color: '#2c3e50', fontSize: '0.875rem', fontWeight: 500 }}>
                {fmt(soilData.depth_cm, 'cm', 0)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

export default SoilCard;
