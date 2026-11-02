import { Box, Paper, Typography } from '@mui/material';

/**
 * Green spreadsheet-style section banner used on the Analytics Dashboard.
 */
export default function DashboardSection({ title, action, children, sx }) {
  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden', ...sx }}>
      {title != null && title !== '' && (
        <Box
          sx={{
            bgcolor: 'table.headerBg',
            color: 'table.headerText',
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            '& .MuiSvgIcon-root': { color: 'inherit' },
          }}
        >
          <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1, color: 'inherit' }}>
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
    <Box sx={{ p: 2 }}>
      <Box sx={{ width: '100%', height }}>
        {children}
      </Box>
      {footer}
    </Box>
  );
}
