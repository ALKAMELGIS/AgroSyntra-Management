import { createContext, useContext, useMemo } from 'react';
import { useTheme, useMediaQuery } from '@mui/material';

export const APP_BAR_HEIGHT = 60;
/** Phones get a slimmer top bar so more of the page fits above the fold. */
export const APP_BAR_HEIGHT_PHONE = 52;
export const NAV_TABS_HEIGHT = 44;
/** Height of the phone bottom navigation (see components/MobileBottomNav). */
export const MOBILE_NAV_HEIGHT = 64;
/** Breadcrumb trail above each page (components/PageContextBar) incl. its margin. */
export const CONTEXT_BAR_HEIGHT = 40;

/** Main content gutter (theme spacing units of 4px): 12 / 20 / 24 / 28 px. */
export const CONTENT_PADDING = { xs: 3, sm: 5, md: 6, lg: 7 };
/** Negative gutter, for full-bleed children (maps, edge-to-edge sheets). */
export const CONTENT_BLEED = { xs: -3, sm: -5, md: -6, lg: -7 };

// Pixel gutter per breakpoint and the gutter the page offsets were tuned for
// before the spacing refresh; the difference keeps scroll regions on-screen.
const PAD_PX = { phone: 12, tablet: 20, laptop: 24, desktop: 28 };
const LEGACY_PAD_PX = { phone: 4, tablet: 8, laptop: 12, desktop: 12 };

/** Provided by the authenticated shell so every page knows whether the area tabs row is shown. */
export const AppChromeContext = createContext({ showNavTabs: false });

/**
 * Shared layout metrics for responsive pages (phone, tablet, desktop).
 * @param {{ showNavTabs?: boolean }} options
 */
export default function useAppLayout(options = {}) {
  const chrome = useContext(AppChromeContext);
  const showNavTabs = options.showNavTabs ?? chrome.showNavTabs;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const appBarHeight = isPhone ? APP_BAR_HEIGHT_PHONE : APP_BAR_HEIGHT;
  const topBarHeight = appBarHeight + (showNavTabs ? NAV_TABS_HEIGHT : 0);

  return useMemo(() => {
    const tier = isPhone ? 'phone' : isMobile ? 'tablet' : isTablet ? 'laptop' : 'desktop';
    const padPx = PAD_PX[tier];
    const bottomChrome = isPhone ? MOBILE_NAV_HEIGHT : 0;
    const extraPad = (PAD_PX[tier] - LEGACY_PAD_PX[tier]) * 2 + bottomChrome + CONTEXT_BAR_HEIGHT;
    const contentMinHeight = `calc(100dvh - ${topBarHeight}px)`;
    const scrollRegionHeight = (extraOffset = 0) =>
      `calc(100dvh - ${topBarHeight + extraOffset + extraPad}px)`;

    return {
      isMobile,
      isTablet,
      isPhone,
      topBarHeight,
      appBarHeight,
      padPx,
      bottomChrome,
      contentPadding: CONTENT_PADDING,
      contentBleed: CONTENT_BLEED,
      contentMinHeight,
      scrollRegionHeight,
      fullBleedHeight: `calc(100dvh - ${topBarHeight + bottomChrome}px)`,
      mainSx: {
        flexGrow: 1,
        p: CONTENT_PADDING,
        mt: `${topBarHeight}px`,
        minHeight: contentMinHeight,
      },
    };
  }, [isMobile, isTablet, isPhone, topBarHeight, appBarHeight]);
}
