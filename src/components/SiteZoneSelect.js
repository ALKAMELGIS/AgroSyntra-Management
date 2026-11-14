import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Box, ButtonBase, InputAdornment, InputBase, Popover, Typography,
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
  const openPanel = () => setOpen(true);

  // A plain drop list: every zone as a group heading, every site as one row
  // under it (zone codes such as MH kept as they are), the chosen one ticked.
  const itemSx = (selected) => (t) => ({
    display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', justifyContent: 'flex-start', textAlign: 'start',
    minHeight: 32, px: 1.5, py: 0.5,
    fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: selected ? 600 : 400,
    color: selected ? 'primary.main' : 'text.primary',
    bgcolor: selected ? alpha(t.palette.primary.main, 0.08) : 'transparent',
    '&:hover': { bgcolor: selected ? alpha(t.palette.primary.main, 0.12) : 'action.hover' },
    '&.Mui-focusVisible': { bgcolor: 'action.focus' },
    '@media (pointer: coarse)': { minHeight: 44 },
  });
  const onListKeyDown = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll('[role="option"]')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
    items[next].focus();
  };

  const panel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(520px, 75dvh)', width: '100%' }}>
      {siteCount >= SEARCH_FROM && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <InputBase
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites"
            inputProps={{ 'aria-label': 'Search sites' }}
            startAdornment={<InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>}
            sx={{ width: '100%', height: 34, px: 1, borderRadius: 0, fontSize: '0.8125rem', bgcolor: 'background.muted', border: 1, borderColor: 'divider' }}
          />
        </Box>
      )}
      <Box
        ref={revealSelected}
        role="listbox"
        aria-labelledby={labelId}
        onKeyDown={onListKeyDown}
        sx={{ overflowY: 'auto', py: 0.5 }}
      >
        <Typography id={labelId} component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{label}</Typography>
        {allowAllSites && !query && (
          <ButtonBase role="option" aria-selected={!value} onClick={() => pick('')} className={!value ? 'Mui-selected' : undefined}
            sx={[itemSx(!value), { borderBottom: 1, borderColor: 'divider' }]}>
            <Box component="span" sx={{ flex: 1 }}>All Sites</Box>
            {!value && <CheckIcon sx={{ fontSize: 16 }} />}
          </ButtonBase>
        )}
        {filtered.map((zone) => (
          <Box key={zone.id} role="group" aria-label={zone.name}>
            <Typography
              translate="no"
              sx={{
                position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper',
                px: 1.5, pt: 1, pb: 0.25, fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary',
                borderTop: 1, borderColor: 'divider',
              }}
            >
              {zone.name}
            </Typography>
            {zone.sites.map((s) => {
              const selected = s.id === value;
              return (
                <ButtonBase key={s.id} role="option" aria-selected={selected} onClick={() => pick(s.id)}
                  className={selected ? 'Mui-selected' : undefined} sx={itemSx(selected)}>
                  <SiteIcon sx={{ fontSize: 16, color: selected ? 'primary.main' : 'text.disabled', flexShrink: 0 }} />
                  <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{s.name}</Box>
                  {selected && <CheckIcon sx={{ fontSize: 16, flexShrink: 0 }} />}
                </ButtonBase>
              );
            })}
          </Box>
        ))}
        {filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>No sites found</Typography>
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
          aria-haspopup="listbox"
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
            sx: (t) => ({
              mt: 0.5,
              // Same width as the field it drops from (min 200 px), like a native select.
              width: Math.max(anchorRef.current?.offsetWidth || 0, 200),
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
