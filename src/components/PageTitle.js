import { Box, Typography } from '@mui/material';
import HelpTip from './HelpTip';

/**
 * The one page title style used on every screen: an <h1>, 1.375rem on phones
 * and 1.625rem from tablets up, semibold, no decorative icon. Spacing around it
 * comes from the page (pass sx for margins only).
 *
 * `help` puts the page's explanation behind a small "?" next to the title
 * instead of a paragraph under it.
 */
export default function PageTitle({ children, sx, help, ...rest }) {
  const title = (
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
        ...(help ? {} : sx),
      }}
    >
      {children}
    </Typography>
  );
  if (!help) return title;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ...sx }}>
      {title}
      <HelpTip>{help}</HelpTip>
    </Box>
  );
}
