import { useEffect } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { Box, Link, Typography } from '@mui/material';
import { ChevronRightRounded as SepIcon, HomeOutlined as HomeIcon } from '@mui/icons-material';
import { findPageMeta } from '../config/pageMeta';
import { getHubPathForArea } from '../config/navAreas';
import { recordRecentPage } from '../utils/recentPages';
import { useShellLabel } from '../i18n/shellLabels';

/**
 * Quiet "where am I" trail shown above every page: Home › Area › Section.
 * Also records the page in the per-browser recent list used on Home.
 */
export default function PageContextBar() {
  const { pathname } = useLocation();
  const meta = findPageMeta(pathname);
  const L = useShellLabel();

  useEffect(() => {
    if (meta?.exact) recordRecentPage({ path: meta.path, title: meta.title });
  }, [meta?.exact, meta?.path, meta?.title]);

  if (pathname === '/' || pathname.startsWith('/hub/') || !meta) return null;

  const sep = (
    <SepIcon
      aria-hidden
      sx={{ fontSize: 16, color: 'text.disabled', mx: 0.5, transform: (t) => (t.direction === 'rtl' ? 'scaleX(-1)' : 'none') }}
    />
  );
  const crumbSx = {
    fontSize: '0.8125rem',
    color: 'text.secondary',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    '&:hover': { color: 'text.primary' },
  };

  return (
    <Box
      component="nav"
      aria-label="Breadcrumb"
      sx={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 24,
        mb: { xs: 3, md: 4 },
        overflow: 'hidden',
        '@media print': { display: 'none' },
      }}
    >
      <Link component={RouterLink} to="/" underline="none" sx={{ ...crumbSx, display: 'inline-flex', alignItems: 'center' }} aria-label="Home">
        <HomeIcon sx={{ fontSize: 17 }} />
      </Link>
      {meta.areaId && (
        <>
          {sep}
          <Link component={RouterLink} to={getHubPathForArea(meta.areaId)} underline="none" sx={crumbSx}>
            {L(meta.areaLabel)}
          </Link>
        </>
      )}
      {meta.section && meta.section !== 'General' && meta.section.toLowerCase() !== (meta.areaLabel || '').toLowerCase() && (
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, alignItems: 'center' }}>
          {sep}
          <Typography component="span" sx={{ ...crumbSx, '&:hover': {} }}>
            {L(meta.section)}
          </Typography>
        </Box>
      )}
      {sep}
      <Typography
        component="span"
        aria-current="page"
        noWrap
        sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary', minWidth: 0 }}
      >
        {L(meta.title)}
      </Typography>
    </Box>
  );
}
