import { Box, Typography } from '@mui/material';
import HelpTip from './HelpTip';

/**
 * The one page title style used on every screen: an <h1>, 17px on phones
 * and 19px from tablets up (compact header, owner request round 43), semibold, no decorative icon. Spacing around it
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
        fontSize: { xs: '1.0625rem', md: '1.1875rem' },
        fontWeight: 600,
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
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
