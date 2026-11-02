import { Box, Paper, Typography } from '@mui/material';

export default function DashboardStatCard({ title, value, subtitle, color }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        overflow: 'hidden',
        borderColor: 'table.gridline',
      }}
    >
      <Box sx={{ height: 3, bgcolor: 'table.headerBg' }} />
      <Box sx={{ px: 1.5, py: 1.25 }}>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'text.secondary',
            mb: 0.5,
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, color: color || 'table.headerBg', wordBreak: 'break-word' }}
        >
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        )}
      </Box>
    </Paper>
  );
}
