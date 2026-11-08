import { useNavigate } from 'react-router-dom';
import { Box, Typography, ButtonBase } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ArrowForwardRounded as ArrowIcon, HistoryOutlined as RecentIcon } from '@mui/icons-material';
import { calmLabel } from '../config/pageMeta';
import { getTileMeta } from '../config/hubTiles';
import { useShellLabel } from '../i18n/shellLabels';

const calmTitle = calmLabel;

function HubTile({ tile, onOpen, L }) {
  const Icon = tile.icon;
  return (
    <ButtonBase
      onClick={() => onOpen(tile.path)}
      focusRipple
      sx={(t) => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        width: '100%',
        minHeight: { xs: 60, sm: 64 },
        px: { xs: 3, sm: 3.5 },
        py: 2.5,
        textAlign: 'start',
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: t.shadows[1],
        transition: 'border-color 200ms ease, box-shadow 220ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1)',
        '& .hub-arrow': {
          opacity: 0,
          transform: t.direction === 'rtl' ? 'translateX(4px) scaleX(-1)' : 'translateX(-4px)',
          transition: 'opacity 200ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1)',
        },
        '&:hover, &.Mui-focusVisible': {
          borderColor: alpha(t.palette.primary.main, 0.35),
          boxShadow: t.shadows[5],
          transform: 'translateY(-2px)',
          '& .hub-arrow': { opacity: 1, transform: t.direction === 'rtl' ? 'translateX(0) scaleX(-1)' : 'translateX(0)' },
          '& .hub-icon': { bgcolor: 'primary.main', color: 'primary.contrastText' },
        },
        '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
        '@media (hover: none)': { '& .hub-arrow': { opacity: 0.6, transform: 'none' } },
      })}
    >
      <Box
          className="hub-icon"
          sx={(t) => ({
            width: 36,
            height: 36,
            flexShrink: 0,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.08),
            color: 'primary.main',
            transition: 'background-color 200ms ease, color 200ms ease',
          })}
        >
          <Icon sx={{ fontSize: 20 }} />
      </Box>
      <Typography
        component="span"
        sx={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: { xs: '0.875rem', sm: '0.9375rem' }, color: 'text.primary', lineHeight: 1.3, letterSpacing: '-0.01em' }}
      >
        {L(tile.label)}
      </Typography>
      <ArrowIcon className="hub-arrow" sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />
    </ButtonBase>
  );
}

/** Visually hidden but read by screen readers (the page still has its one h1). */
const srOnly = {
  position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

/**
 * Home and area hubs: the tiles start at the top of the page (no greeting
 * block), so the destinations use the space.
 */
export default function HubTileGrid({ sections, title = 'Home', recent = [] }) {
  const navigate = useNavigate();
  const L = useShellLabel();

  return (
    <Box sx={{ pb: 3 }}>
      <Typography component="h1" sx={srOnly}>{L(title)}</Typography>

      {recent.length > 0 && (
        <Box component="section" aria-label="Recently opened" sx={{ mb: { xs: 4, md: 4.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
            <RecentIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600 }}>
              {L('Continue where you left off')}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              pb: 1,
              mx: { xs: -3, sm: 0 },
              px: { xs: 3, sm: 0 },
              flexWrap: { sm: 'wrap' },
              scrollSnapType: 'x mandatory',
            }}
          >
            {recent.map((item) => {
              const Icon = getTileMeta(item.path).icon;
              return (
                <ButtonBase
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  focusRipple
                  sx={(t) => ({
                    flexShrink: 0,
                    scrollSnapAlign: 'start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    height: 40,
                    pl: 2,
                    pr: 4,
                    borderRadius: 999,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'text.primary',
                    transition: 'border-color 160ms ease, background-color 160ms ease',
                    '&:hover, &.Mui-focusVisible': { borderColor: alpha(t.palette.primary.main, 0.4) },
                  })}
                >
                  <Box
                    sx={(t) => ({
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.08),
                      color: 'primary.main',
                    })}
                  >
                    <Icon sx={{ fontSize: 16 }} />
                  </Box>
                  {L(item.title)}
                </ButtonBase>
              );
            })}
          </Box>
        </Box>
      )}

      {sections.map((section) => (
        <Box component="section" key={section.title} sx={{ mb: { xs: 4, md: 4.5 } }} aria-label={section.title}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, mb: 2.5 }}>
            <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {L(calmTitle(section.title))}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', px: 1.5, borderRadius: 999, bgcolor: 'action.hover', lineHeight: '20px' }}>
              {section.tiles.length}
            </Typography>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', alignSelf: 'center' }} />
          </Box>
          <Box
            sx={{
              display: 'grid',
              gap: { xs: 2.5, sm: 3 },
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(3, minmax(0, 1fr))',
                md: 'repeat(auto-fill, minmax(232px, 1fr))',
              },
            }}
          >
            {section.tiles.map((tile) => (
              <HubTile key={tile.path} tile={tile} onOpen={navigate} L={L} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
