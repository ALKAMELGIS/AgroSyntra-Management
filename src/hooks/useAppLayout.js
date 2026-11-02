import { useMemo } from 'react';
import { useTheme, useMediaQuery } from '@mui/material';

export const APP_BAR_HEIGHT = 56;
export const NAV_TABS_HEIGHT = 40;

export const CONTENT_PADDING = { xs: 1, sm: 2, md: 3 };

/**
 * Shared layout metrics for responsive pages (phone, tablet, desktop).
 * @param {{ showNavTabs?: boolean }} options
 */
export default function useAppLayout(options = {}) {
  const { showNavTabs = false } = options;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const topBarHeight = APP_BAR_HEIGHT + (showNavTabs ? NAV_TABS_HEIGHT : 0);

  return useMemo(() => {
    const contentMinHeight = `calc(100dvh - ${topBarHeight}px)`;
    const scrollRegionHeight = (extraOffset = 0) =>
      `calc(100dvh - ${topBarHeight + extraOffset}px)`;

    return {
      isMobile,
      isTablet,
      isPhone,
      topBarHeight,
      contentPadding: CONTENT_PADDING,
      contentMinHeight,
      scrollRegionHeight,
      mainSx: {
        flexGrow: 1,
        p: CONTENT_PADDING,
        mt: `${topBarHeight}px`,
        minHeight: contentMinHeight,
      },
    };
  }, [isMobile, isTablet, isPhone, topBarHeight]);
}
