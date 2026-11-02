import { Box, Paper, Typography } from '@mui/material';

/**
 * Section card used on dashboards: quiet title row on a hairline divider,
 * content below. Optional `action` renders at the inline end of the title row.
 */
export default function DashboardSection({ title, action, children, sx }) {
  return (
    <Paper variant="outlined" sx={{ mb: { xs: 4, md: 5 }, overflow: 'hidden', boxShadow: 1, ...sx }}>
      {title != null && title !== '' && (
        <Box
          sx={{
            px: { xs: 4, sm: 5 },
            py: 3.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .MuiSvgIcon-root': { color: 'text.secondary' },
          }}
        >
          <Box component="span" sx={{ width: 4, height: 16, borderRadius: 2, bgcolor: 'primary.main', flexShrink: 0 }} />
          <Typography
            component="h2"
            sx={{ flexGrow: 1, fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'text.primary' }}
          >
            {title}
          </Typography>
          {action}
        </Box>
      )}
      {children}
    </Paper>
  );
}

export function DashboardChartBody({ height, children, footer }) {
  return (
    <Box sx={{ p: { xs: 3, sm: 5 } }}>
      <Box sx={{ width: '100%', height }}>
        {children}
      </Box>
      {footer}
    </Box>
  );
}
