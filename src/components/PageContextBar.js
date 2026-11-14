import { useEffect, useState } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { Box, Link, Typography } from '@mui/material';
import { ChevronRightRounded as SepIcon, HomeOutlined as HomeIcon } from '@mui/icons-material';
import { findPageMeta } from '../config/pageMeta';
import { getHubPathForArea } from '../config/navAreas';
import { recordRecentPage } from '../utils/recentPages';
import { useShellLabel } from '../i18n/shellLabels';
import { clearMissingRequired } from '../utils/requiredFields';
import { touchHitArea } from '../utils/touchTarget';

/**
 * Quiet "where am I" trail shown above every page: Home › Area › Section.
 * Also records the page in the per-browser recent list used on Home.
 */
export default function PageContextBar() {
  const { pathname } = useLocation();
  const meta = findPageMeta(pathname);
  const L = useShellLabel();

  // A new page starts without "missing field" outlines from the previous one.
  useEffect(() => { clearMissingRequired(); }, [pathname]);

  useEffect(() => {
    if (meta?.exact) recordRecentPage({ path: meta.path, title: meta.title });
  }, [meta?.exact, meta?.path, meta?.title]);

  const pageTitle = meta ? L(meta.title) : null;
  const appName = L('Elite Agro Cloud');

  // Browser tab shows the page ("Scouting Reports — Elite Agro Cloud").
  useEffect(() => {
    document.title = pageTitle && pathname !== '/' ? `${pageTitle} — ${appName}` : `${L('Al Maha Farm')} — ${appName}`;
  }, [pageTitle, pathname, appName, L]);

  // Every page needs exactly one <h1>; add a screen-reader-only one when the page has none.
  const [needsH1, setNeedsH1] = useState(false);
  // Watched continuously: pages that load data first show their own title later,
  // and the fallback must step aside as soon as it appears (never two h1s).
  useEffect(() => {
    const check = () => setNeedsH1(!document.querySelector('main h1:not([data-page-title])'));
    check();
    const main = document.querySelector('main');
    if (!main || typeof MutationObserver === 'undefined') return undefined;
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    });
    mo.observe(main, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(frame); };
  }, [pathname]);

  // Pixel strings on purpose: in sx a bare 1 means 100%, which made this an
  // invisible page-sized box lying over the content.
  const srOnly = {
    position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden',
    clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
  };
  const hiddenHeading = needsH1 && pageTitle ? (
    <Box component="h1" data-page-title="" sx={srOnly}>{pageTitle}</Box>
  ) : null;
  // Polite announcement of the new page for screen-reader users after navigation.
  const announcer = (
    <Box role="status" aria-live="polite" sx={srOnly}>{pageTitle || ''}</Box>
  );

  if (pathname === '/' || pathname.startsWith('/hub/') || !meta) return <>{hiddenHeading}{announcer}</>;

  const sep = (
    <SepIcon
      aria-hidden
      sx={{ fontSize: 16, color: 'text.disabled', mx: 0.5, transform: (t) => (t.direction === 'rtl' ? 'scaleX(-1)' : 'none') }}
    />
  );
  const shrinkSx = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 };
  const crumbSx = {
    ...touchHitArea,
    fontSize: '0.8125rem',
    color: 'text.secondary',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    '&:hover': { color: 'text.primary' },
  };

  return (
    <>
    {hiddenHeading}
    {announcer}
    <Box
      component="nav"
      aria-label="Breadcrumb"
      sx={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 24,
        // Room for the finger-sized hit areas of the links on touch screens.
        '@media (pointer: coarse)': { minHeight: 32, overflow: 'visible' },
        mb: { xs: 2, md: 4 },
        overflow: 'hidden',
        '@media print': { display: 'none' },
      }}
    >
      <Link component={RouterLink} to="/" underline="none" sx={{ ...crumbSx, display: 'inline-flex', alignItems: 'center' }} aria-label="Home">
        <HomeIcon sx={{ fontSize: 16 }} />
      </Link>
      {meta.areaId && (
        <>
          {sep}
          <Link component={RouterLink} to={getHubPathForArea(meta.areaId)} underline="none" sx={{ ...crumbSx, ...shrinkSx }}>
            {L(meta.areaLabel)}
          </Link>
        </>
      )}
      {meta.section && meta.section !== 'General' && meta.section.toLowerCase() !== (meta.areaLabel || '').toLowerCase() && (
        // The full path on every screen size (Home › area › section › page); on narrow
        // screens the middle names shorten with an ellipsis instead of disappearing.
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
          {sep}
          <Typography component="span" sx={{ ...crumbSx, ...shrinkSx, '&:hover': {} }}>
            {L(meta.section)}
          </Typography>
        </Box>
      )}
      {sep}
      <Typography
        component="span"
        aria-current="page"
        noWrap
        sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary', minWidth: 0, flexShrink: 0, maxWidth: '60%' }}
      >
        {L(meta.title)}
      </Typography>
      {/* Page flags (e.g. "View only") render here through a portal, so they share
          the breadcrumb line instead of taking a row of their own. */}
      <Box id="page-flags-slot" sx={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, paddingInlineStart: '8px', '&:empty': { display: 'none' } }} />
    </Box>
    </>
  );
}
