import { useNavigate } from 'react-router-dom';
import { Box, Typography, ButtonBase } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ArrowForwardRounded as ArrowIcon, HistoryOutlined as RecentIcon } from '@mui/icons-material';
import { calmLabel } from '../config/pageMeta';
import { getTileMeta } from '../config/hubTiles';
import { useShellLabel, useIsArabic } from '../i18n/shellLabels';

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

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
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 3,
        width: '100%',
        minHeight: { xs: 96, sm: 108 },
        p: { xs: 3, sm: 4 },
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
      <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box
          className="hub-icon"
          sx={(t) => ({
            width: 40,
            height: 40,
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
        <ArrowIcon className="hub-arrow" sx={{ fontSize: 18, color: 'text.secondary', mt: 0.5 }} />
      </Box>
      <Typography
        component="span"
        sx={{ fontWeight: 600, fontSize: { xs: '0.875rem', sm: '0.9375rem' }, color: 'text.primary', lineHeight: 1.3, letterSpacing: '-0.01em' }}
      >
        {L(tile.label)}
      </Typography>
    </ButtonBase>
  );
}

export default function HubTileGrid({ sections, userName, subtitle, recent = [] }) {
  const navigate = useNavigate();
  const now = new Date();
  const L = useShellLabel();
  const isAr = useIsArabic();
  const greeting = L(greetingFor(now));
  const dateLabel = now.toLocaleDateString(isAr ? 'ar-AE' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', pt: { xs: 2, md: 4 }, pb: 4 }}>
      <Box component="header" sx={{ mb: { xs: 5, md: 7 } }}>
        <Typography
          variant="overline"
          component="p"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, mb: 2, color: 'text.secondary' }}
        >
          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main' }} />
          {dateLabel}
        </Typography>
        <Typography
          variant="h2"
          component="h1"
          sx={{ fontSize: { xs: '1.875rem', sm: '2.25rem', md: '2.625rem' }, fontWeight: 600, letterSpacing: '-0.035em' }}
        >
          {greeting}{isAr ? '، ' : ', '}{userName?.split(' ')[0] || ''}
        </Typography>
        <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary', maxWidth: 620, fontSize: { xs: '0.9375rem', md: '1.0625rem' } }}>
          {subtitle || L('Everything happening across your fields today, one tap away.')}
        </Typography>
      </Box>

      {recent.length > 0 && (
        <Box component="section" aria-label="Recently opened" sx={{ mb: { xs: 5, md: 6 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
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
        <Box component="section" key={section.title} sx={{ mb: { xs: 5, md: 6 } }} aria-label={section.title}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, mb: 2.5 }}>
            <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {L(calmTitle(section.title))}
            </Typography>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', alignSelf: 'center' }} />
            <Typography variant="caption" sx={{ color: 'text.disabled', whiteSpace: 'nowrap' }}>
              {section.tiles.length}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gap: { xs: 2.5, sm: 3.5 },
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(3, minmax(0, 1fr))',
                md: 'repeat(auto-fill, minmax(200px, 1fr))',
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
