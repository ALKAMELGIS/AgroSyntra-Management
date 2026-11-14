import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Box, ButtonBase, InputAdornment, InputBase, Popover, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  CheckRounded as CheckIcon, LocationOnOutlined as SiteIcon, SearchRounded as SearchIcon, UnfoldMoreRounded as OpenIcon,
} from '@mui/icons-material';

function findSiteWithZone(countries, siteId) {
  if (!siteId) return null;
  for (const country of countries || []) {
    const site = country.sites?.find((s) => s.id === siteId);
    if (site) {
      return { site, zoneId: country.id, zoneName: country.name };
    }
  }
  return null;
}

const SEARCH_FROM = 7;

/**
 * Site picker. The list opens as its own floating panel beside the sidebar
 * (a bottom sheet on phones), never on top of the navigation menu, so the
 * two can't be confused. Zones are small group labels; only sites are choices.
 */
export default function SiteZoneSelect({
  countries = [],
  value,
  onChange,
  label = 'Site',
  allowAllSites = true,
  noAssignmentMessage,
  variant = 'field',
  sx,
}) {
  const chip = variant === 'chip';
  const theme = useTheme();
  const rtl = theme.direction === 'rtl';
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const labelId = useId();
  // When the list opens, bring the chosen site into view.
  const revealSelected = useCallback((el) => {
    if (el) requestAnimationFrame(() => el.querySelector('.Mui-selected')?.scrollIntoView({ block: 'center' }));
  }, []);

  const zones = useMemo(() => (countries || []).filter((c) => c.sites?.length), [countries]);
  const siteCount = zones.reduce((n, z) => n + z.sites.length, 0);
  const current = findSiteWithZone(countries, value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones
      .map((z) => (String(z.name).toLowerCase().includes(q)
        ? z
        : { ...z, sites: z.sites.filter((s) => String(s.name).toLowerCase().includes(q)) }))
      .filter((z) => z.sites.length);
  }, [zones, query]);

  if (noAssignmentMessage) {
    return (
      <Typography variant="caption" color="warning.main" sx={{ display: 'block', px: 0.5 }}>
        {noAssignmentMessage}
      </Typography>
    );
  }
  if (siteCount === 0) return null;

  const close = () => { setOpen(false); setQuery(''); };
  const pick = (id) => { onChange(id); close(); };
  const openPanel = () => { setZoneFilter(current?.zoneId ?? 'all'); setOpen(true); };

  const shownZones = zoneFilter === 'all' ? filtered : filtered.filter((z) => z.id === zoneFilter);

  const siteButtonSx = (selected) => (t) => ({
    display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-start', textAlign: 'start',
    minHeight: 40, px: 1.25, py: 0.5, borderRadius: 0, border: 1,
    borderColor: selected ? 'primary.main' : 'divider',
    bgcolor: selected ? alpha(t.palette.primary.main, 0.08) : 'background.paper',
    color: selected ? 'primary.main' : 'text.primary',
    fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: selected ? 600 : 500,
    transition: 'border-color .15s, background-color .15s',
    '&:hover': { borderColor: alpha(t.palette.primary.main, 0.5) },
    '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
  });

  // Same look as the Farm Monitor header: green bar + segmented filter, cards below.
  const panel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(560px, 80dvh)', width: '100%' }}>
      {/* Dark green in both modes so the white zone names stay readable. */}
      <Box sx={{ bgcolor: 'var(--sheet-header)', color: 'common.white', px: 1.75, pt: 1.25, pb: 1.25, flexShrink: 0 }}>
        <Typography id={labelId} sx={{ fontSize: '0.875rem', fontWeight: 700, mb: 1, color: 'common.white' }}>{label}</Typography>
        <ToggleButtonGroup
          ref={(el) => { if (el) requestAnimationFrame(() => el.querySelector('.Mui-selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })); }}
          value={zoneFilter}
          exclusive
          size="small"
          aria-label="Zone"
          onChange={(_, v) => { if (v !== null) setZoneFilter(v); }}
          sx={{
            // Every zone visible at once: the chips wrap onto a second line
            // instead of scrolling sideways out of view.
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            maxWidth: '100%',
            bgcolor: 'transparent',
            p: 0,
            border: '0 !important',
            '& .MuiToggleButton-root': {
              flexShrink: 0,
              m: 0,
              color: 'common.white',
              bgcolor: 'transparent',
              border: '1px solid rgba(255,255,255,0.4) !important',
              borderRadius: '0 !important',
              textTransform: 'none',
              px: 1.25,
              py: 0.25,
              minHeight: 28,
              fontSize: '0.75rem',
              fontWeight: 600,
              lineHeight: 1.6,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
              '&.Mui-selected': {
                bgcolor: 'common.white',
                color: 'var(--sheet-header)',
                borderColor: 'common.white !important',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
              },
            },
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          {zones.map((z) => <ToggleButton key={z.id} value={z.id}><span translate="no">{z.name}</span></ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      {siteCount >= SEARCH_FROM && (
        <Box sx={{ px: 1.5, pt: 1.25, flexShrink: 0 }}>
          <InputBase
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites"
            inputProps={{ 'aria-label': 'Search sites' }}
            startAdornment={<InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>}
            sx={(t) => ({
              width: '100%', height: 34, px: 1, borderRadius: 0, fontSize: '0.8125rem',
              bgcolor: alpha(t.palette.text.primary, 0.04), border: 1, borderColor: 'divider',
            })}
          />
        </Box>
      )}

      <Box ref={revealSelected} sx={{ overflowY: 'auto', px: 1.5, pt: 1.25, pb: 1.5 }}>
        {allowAllSites && zoneFilter === 'all' && !query && (
          <ButtonBase onClick={() => pick('')} aria-pressed={!value} className={!value ? 'Mui-selected' : undefined}
            sx={[siteButtonSx(!value), { width: '100%', mb: 1.25 }]}>
            <Box component="span" sx={{ flex: 1 }}>All Sites</Box>
            {!value && <CheckIcon sx={{ fontSize: 16 }} />}
          </ButtonBase>
        )}
        {shownZones.map((zone) => (
          <Box key={zone.id} sx={{ mb: 1.25 }}>
            {zoneFilter === 'all' && (
              <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary', mb: 0.5, px: 0.25 }} translate="no">
                {zone.name}
              </Typography>
            )}
            {/* One site per row, full names: a plain drop list, not a cramped grid. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.5 }}>
              {zone.sites.map((s) => {
                const selected = s.id === value;
                return (
                  <ButtonBase key={s.id} onClick={() => pick(s.id)} aria-pressed={selected}
                    className={selected ? 'Mui-selected' : undefined} sx={siteButtonSx(selected)}>
                    <SiteIcon sx={{ fontSize: 16, color: selected ? 'primary.main' : 'text.disabled', flexShrink: 0 }} />
                    <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Box>
                    {selected && <CheckIcon sx={{ fontSize: 16, flexShrink: 0 }} />}
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        ))}
        {shownZones.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No sites found</Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <Box sx={{ position: 'relative', display: chip ? 'inline-flex' : 'block', ...sx }}>
        {!chip && (
          <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: 'text.secondary', mb: 0.5, px: 0.25 }}>
            {label}
          </Typography>
        )}
        <ButtonBase
          ref={anchorRef}
          onClick={openPanel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${current ? `${current.zoneName} · ${current.site.name}` : 'All Sites'}`}
          sx={(t) => ({
            width: chip ? 'auto' : '100%', maxWidth: chip ? 280 : 'none', height: 36, px: 1.25, gap: 1, justifyContent: 'flex-start',
            borderRadius: chip ? 999 : 1.25,
            bgcolor: chip ? 'background.paper' : 'background.muted', border: 1, borderColor: open ? 'primary.main' : 'divider',
            fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: 500, color: 'text.primary', textAlign: 'start',
            transition: 'border-color .15s',
            '&:hover': { borderColor: alpha(t.palette.primary.main, 0.5) },
            '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
          })}
        >
          <SiteIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current ? (
              <>
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>{current.zoneName}</Box>
                {' · '}
                {current.site.name}
              </>
            ) : 'All Sites'}
          </Box>
          <OpenIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        </ButtonBase>
      </Box>

      <Popover
        open={open}
        onClose={close}
        // Drops down right under the field it was opened from.
        anchorEl={anchorRef.current}
        anchorOrigin={{ vertical: 'bottom', horizontal: rtl ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: rtl ? 'right' : 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-labelledby': labelId,
            sx: (t) => ({
              mt: 0.5,
              width: Math.max(anchorRef.current?.offsetWidth || 0, 340),
              maxWidth: 'calc(100vw - 16px)',
              overflow: 'hidden',
              borderRadius: 0,
              border: 1,
              borderColor: 'divider',
              boxShadow: t.shadows[8],
            }),
          },
        }}
      >
        {panel}
      </Popover>
    </>
  );
}

export { findSiteWithZone };
