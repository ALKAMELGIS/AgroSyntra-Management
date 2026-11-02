import { Box, Paper, Typography } from '@mui/material';

/** KPI tile: small label, large tabular value, optional caption. */
export default function DashboardStatCard({ title, value, subtitle, color }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        overflow: 'hidden',
        boxShadow: 1,
        position: 'relative',
        transition: 'border-color 200ms ease',
        '&:hover': { borderColor: 'border.strong' },
      }}
    >
      <Box sx={{ px: { xs: 4, sm: 5 }, py: { xs: 3.5, sm: 4.5 } }}>
        <Typography
          component="p"
          sx={{
            fontSize: '0.71875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: 'text.secondary',
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color || 'primary.main', flexShrink: 0 }} />
          {title}
        </Typography>
        <Typography
          component="p"
          sx={{
            fontSize: { xs: '1.375rem', sm: '1.625rem' },
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-0.025em',
            color: 'text.primary',
            fontVariantNumeric: 'tabular-nums',
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>{subtitle}</Typography>
        )}
      </Box>
    </Paper>
  );
}
