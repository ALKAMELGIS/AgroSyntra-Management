import { Box, Typography } from '@mui/material';
import useAppLayout from '../../hooks/useAppLayout';

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
  const { contentPadding } = useAppLayout();

  return (
    <Box
      sx={{
        p: contentPadding,
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
            gap: 1.5,
            mb: 2,
          }}
        >
          <Box>
            {title && (
              <Typography variant="h5" fontWeight={700} sx={{ fontSize: { xs: '1.15rem', md: '1.5rem' } }}>
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
