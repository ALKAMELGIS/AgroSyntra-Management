import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  HomeOutlined as HomeIcon,
  GridViewOutlined as AreaIcon,
  SearchOutlined as SearchIcon,
  NotificationsNoneOutlined as BellIcon,
  MenuOutlined as MenuIcon,
} from '@mui/icons-material';
import { getHubPathForArea } from '../config/navAreas';
import { MOBILE_NAV_HEIGHT } from '../hooks/useAppLayout';
import { useShellLabel } from '../i18n/shellLabels';

export { MOBILE_NAV_HEIGHT };

/**
 * Thumb-reach navigation for phones: the four things field staff do most,
 * plus the full menu. Rendered only below the `sm` breakpoint by the caller.
 */
export default function MobileBottomNav({ activeNavArea, onOpenMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const L = useShellLabel();
  const hubPath = activeNavArea ? getHubPathForArea(activeNavArea) : null;

  // Lets App.css lift snackbars and other bottom-pinned UI above this bar.
  useEffect(() => {
    document.documentElement.classList.add('has-bottom-nav');
    return () => document.documentElement.classList.remove('has-bottom-nav');
  }, []);

  const openSearch = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  };

  const items = [
    { key: 'home', label: L('Home'), icon: HomeIcon, active: pathname === '/', onClick: () => navigate('/') },
    ...(hubPath
      ? [{ key: 'area', label: L('Modules'), icon: AreaIcon, active: pathname.startsWith('/hub/'), onClick: () => navigate(hubPath) }]
      : []),
    { key: 'search', label: L('Search'), icon: SearchIcon, active: false, onClick: openSearch },
    { key: 'alerts', label: L('Alerts'), icon: BellIcon, active: pathname.startsWith('/notifications'), onClick: () => navigate('/notifications') },
    { key: 'menu', label: L('Menu'), icon: MenuIcon, active: false, onClick: onOpenMenu },
  ];

  return (
    <Box
      component="nav"
      aria-label="Quick navigation"
      sx={(t) => ({
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: t.zIndex.appBar,
        display: 'flex',
        height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        pb: 'env(safe-area-inset-bottom, 0px)',
        bgcolor: alpha(t.palette.background.paper, 0.88),
        backdropFilter: 'saturate(180%) blur(14px)',
        borderTop: '1px solid',
        borderColor: 'divider',
        '@media print': { display: 'none' },
      })}
    >
      {items.map(({ key, label, icon: Icon, active, onClick }) => (
        <ButtonBase
          key={key}
          onClick={onClick}
          aria-current={active ? 'page' : undefined}
          sx={{
            flex: 1,
            flexDirection: 'column',
            gap: 0.5,
            color: active ? 'primary.main' : 'text.secondary',
            transition: 'color 160ms ease',
          }}
        >
          <Box
            sx={(t) => ({
              width: 48,
              height: 28,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.1) : 'transparent',
              transition: 'background-color 160ms ease',
            })}
          >
            <Icon sx={{ fontSize: 22 }} />
          </Box>
          <Typography component="span" sx={{ fontSize: '0.6875rem', fontWeight: active ? 600 : 500, lineHeight: 1 }}>
            {label}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  );
}
