import { Typography } from '@mui/material';

/**
 * The one page title style used on every screen: an <h1>, 1.375rem on phones
 * and 1.625rem from tablets up, semibold, no decorative icon. Spacing around it
 * comes from the page (pass sx for margins only).
 */
export default function PageTitle({ children, sx, ...rest }) {
  return (
    <Typography
      component="h1"
      className="page-title"
      {...rest}
      sx={{
        fontSize: { xs: '1.375rem', md: '1.625rem' },
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: '-0.02em',
        color: 'text.primary',
        m: 0,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}
