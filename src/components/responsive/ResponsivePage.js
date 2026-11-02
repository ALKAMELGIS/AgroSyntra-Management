import { Box, Typography } from '@mui/material';

/**
 * Standard page wrapper with responsive padding and optional title row.
 */
export default function ResponsivePage({
  title,
  subtitle,
  actions,
  children,
  maxWidth,
  sx,
  ...rest
}) {
  return (
    <Box
      sx={{
        maxWidth: maxWidth || 'none',
        mx: maxWidth ? 'auto' : undefined,
        width: '100%',
        ...sx,
      }}
      {...rest}
    >
      {(title || actions) && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            justifyContent: 'space-between',
            gap: 3,
            mb: { xs: 4, md: 6 },
          }}
        >
          <Box>
            {title && (
              <Typography variant="h4" component="h1">
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexShrink: 0 }}>
              {actions}
            </Box>
          )}
        </Box>
      )}
      {children}
    </Box>
  );
}
