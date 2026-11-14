import { useCallback, useEffect, useState } from 'react';
import {
  Box, ButtonBase, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Radio, Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { CloseRounded as CloseIcon } from '@mui/icons-material';
import { BASEMAPS } from '../../utils/mapBasemaps';

/**
 * Map workspace used by every map page (GIS Map, GPS Tracking, Remote Sensing, Weather Map):
 *
 *   [ labelled tool strip: GIS tools | satellite / RS tools ]
 *   [ docked panel (tablet / desktop) | full-width map ]
 *
 * - One strip of icon + label buttons above the map on every screen size; panel
 *   tools open a panel, action tools act at once; counts sit beside the label.
 * - Tablet / desktop: the panel docks beside the map (the map narrows, nothing
 *   covers it). Phones: the panel opens as a sheet over the lower 62% of the map.
 * - Nothing floats over the map except Leaflet's zoom buttons (top corner opposite
 *   the panel) and the map credits, so nothing overlaps. Square corners throughout.
 * - The selected tool is remembered per page; everything mirrors in Arabic.
 */

export const RAIL_WIDTH = 48;

/** Leaflet position for the zoom buttons: the top corner opposite the tool bar. */
export function mapZoomPosition(theme) {
  return theme.direction === 'rtl' ? 'topleft' : 'topright';
}

/** Selected panel tool (null = closed), remembered per page. Opens `initial` on wide screens the first time. */
export function useMapWorkspace(storageKey, initial = null) {
  const [active, setActive] = useState(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) return saved === '' ? null : saved;
    } catch { /* storage unavailable */ }
    return typeof window !== 'undefined' && window.innerWidth >= 1280 ? initial : null;
  });
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, active || ''); } catch { /* ignore */ }
    // Leaflet re-measures on window resize: tell it once the panel has opened / closed.
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 230);
    return () => clearTimeout(t);
  }, [active, storageKey]);
  const toggle = useCallback((key) => setActive((a) => (a === key ? null : key)), []);
  const close = useCallback(() => setActive(null), []);
  return { active, setActive, toggle, close };
}



/* ---- phones ---------------------------------------------------------------
 * Two side rails would eat a quarter of a 390 px screen. On phones all tools sit
 * in one labelled strip above the map (GIS group | satellite group), and a tool
 * panel opens as a sheet over the lower part of the map, so the map stays in view.
 */
function PhoneToolStrip({ groups }) {
  // One strip; each tool group is its own labelled navigation landmark
  // (e.g. "Map tools" | "Remote sensing tools") so screen readers keep them apart.
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'stretch', gap: 0.5, px: 1, flexShrink: 0,
        overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
      }}
    >
      {groups.map((g, gi) => (
        <Box component="nav" aria-label={g.label} key={g.label} sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, flexShrink: 0 }}>
          {gi > 0 && <Box aria-hidden sx={{ width: '1px', my: 2, mx: 1, bgcolor: 'divider', flexShrink: 0 }} />}
          {g.tools.map((tool, ti) => {
            if (tool.divider) {
              return <Box key={tool.key || `div-${ti}`} aria-hidden sx={{ width: '1px', my: 2, mx: 1, bgcolor: 'divider', flexShrink: 0 }} />;
            }
            const isPanel = Boolean(tool.content);
            const pressed = isPanel ? g.workspace.active === tool.key : Boolean(tool.pressed);
            const count = tool.badge ? (tool.badge > 99 ? '99+' : tool.badge) : null;
            return (
              <ButtonBase
                key={tool.key}
                aria-label={count ? `${tool.label} (${count})` : tool.label}
                aria-pressed={!isPanel && tool.pressed !== undefined ? pressed : undefined}
                aria-expanded={isPanel ? pressed : undefined}
                aria-controls={isPanel && pressed ? g.panelId : undefined}
                disabled={tool.disabled}
                onClick={isPanel ? () => g.open(tool.key) : tool.onClick}
                sx={{
                  flexDirection: 'column', gap: 0.5, minWidth: 64, maxWidth: { xs: 96, sm: 180 }, px: 1.5, py: 1.5,
                  color: pressed ? 'primary.main' : 'text.secondary',
                  bgcolor: pressed ? 'action.selected' : 'transparent',
                  borderBottom: '2px solid', borderColor: pressed ? 'primary.main' : 'transparent',
                  '& .MuiSvgIcon-root': { fontSize: 20 },
                  '&.Mui-disabled': { opacity: 0.4 },
                }}
              >
                {tool.icon}
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: '100%', fontSize: '0.6875rem', lineHeight: 1.2, fontWeight: 500 }}>
                  <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{tool.label}</Box>
                  {count && (
                    <Box component="span" aria-hidden sx={{ flexShrink: 0, px: 1, minWidth: 16, textAlign: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, fontSize: '0.625rem', lineHeight: '16px', fontVariantNumeric: 'tabular-nums' }}>{count}</Box>
                  )}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function PhoneSheet({ current, onClose, panelId, docked = false, width = 340 }) {
  if (!current) return null;
  // Phones: a sheet over the lower part of the map. Tablet / desktop: a column docked
  // beside the map (the map shrinks, nothing covers it).
  const placement = docked
    ? { width, flexShrink: 0, height: '100%', borderInlineEnd: '1px solid', borderColor: 'divider' }
    : {
      position: 'absolute', insetInline: 0, bottom: 0, height: '62%', zIndex: 1100,
      borderTop: '1px solid', borderColor: 'divider', boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
    };
  return (
    <Box
      id={panelId}
      component="section"
      aria-label={current.title || current.label}
      sx={{ ...placement, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', minHeight: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, minHeight: 48, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ color: 'text.secondary', display: 'flex', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{current.icon}</Box>
        <Typography component="h2" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, flex: 1, minWidth: 0 }}>
          {current.title || current.label}
        </Typography>
        {current.actions}
        <IconButton size="small" onClick={onClose} aria-label={`Close ${current.title || current.label}`}><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{current.content}</Box>
    </Box>
  );
}

const NO_WORKSPACE = { active: null, toggle: () => {}, close: () => {} };

export function MapWorkspace({
  id, workspace, tools, height, panelWidth = 320, children, label = 'Map tools',
  endTools, endWorkspace = NO_WORKSPACE, endPanelWidth = 340, endLabel = 'More map tools',
}) {
  const list = tools.filter(Boolean);
  const endList = (endTools || []).filter(Boolean);
  const current = list.find((t) => t.content && t.key === workspace.active) || null;
  const endCurrent = endList.find((t) => t.content && t.key === endWorkspace.active) || null;
  const open = Boolean(current);
  const endOpen = Boolean(endCurrent);

  useEffect(() => {
    if (!open && !endOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (endOpen) endWorkspace.close(); else workspace.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, endOpen, workspace, endWorkspace]);

  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  // One layout on every screen: a labelled tool strip above a full-width map
  // (GIS group | satellite group). Phones open a tool as a sheet over the lower map;
  // tablet and desktop dock it beside the map. Opening a tool of one group closes the
  // other group's panel, so only one panel is ever open.
  const groups = [
    { label, tools: list, workspace, panelId: `${id}-panel`, open: (k) => { endWorkspace.close(); workspace.toggle(k); } },
    ...(endList.length ? [{ label: endLabel, tools: endList, workspace: endWorkspace, panelId: `${id}-end-panel`, open: (k) => { workspace.close(); endWorkspace.toggle(k); } }] : []),
  ];
  const sheet = endCurrent || current;
  const sheetProps = {
    current: sheet,
    panelId: endCurrent ? `${id}-end-panel` : `${id}-panel`,
    onClose: () => (endCurrent ? endWorkspace.close() : workspace.close()),
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, minHeight: 0, bgcolor: 'background.paper' }}>
      <PhoneToolStrip groups={groups} />
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
        {!isPhone && <PhoneSheet {...sheetProps} docked width={endCurrent ? endPanelWidth : panelWidth} />}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
          {children}
          {isPhone && <PhoneSheet {...sheetProps} />}
        </Box>
      </Box>
    </Box>
  );
}


export function useBasemap(storageKey, initial = 'osm') {
  const [basemap, setBasemap] = useState(() => {
    try { const v = window.localStorage.getItem(storageKey); if (v && BASEMAPS[v]) return v; } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => { try { window.localStorage.setItem(storageKey, basemap); } catch { /* ignore */ } }, [basemap, storageKey]);
  return [basemap, setBasemap];
}

/** Panel content: choose the basemap (radio list). */
export function BasemapList({ value, onChange }) {
  return (
    <List role="radiogroup" aria-label="Basemap" sx={{ py: 1 }}>
      {Object.entries(BASEMAPS).map(([key, b]) => (
        <ListItemButton key={key} role="radio" aria-checked={value === key} selected={value === key} onClick={() => onChange(key)} sx={{ mx: 1, borderRadius: 1.25 }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Radio size="small" checked={value === key} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-hidden': true } }} />
          </ListItemIcon>
          <ListItemText primary={b.name || b.label} primaryTypographyProps={{ fontSize: '0.875rem' }} />
        </ListItemButton>
      ))}
    </List>
  );
}

/**
 * Panel content: legend built from what is switched on.
 * sections: [{ title, items: [{ color, label, shape?: 'fill' | 'line' | 'dot' }] }]
 */
export function MapLegend({ sections, empty = 'Turn on a layer to see its legend.' }) {
  const shown = sections.filter((s) => s && s.items && s.items.length);
  if (!shown.length) {
    return <Typography sx={{ p: 3, fontSize: '0.8125rem', color: 'text.secondary' }}>{empty}</Typography>;
  }
  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {shown.map((section) => (
        <Box key={section.title}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'text.secondary', mb: 1.5 }}>
            {section.title}
          </Typography>
          {section.items.map((item) => (
            <Box key={`${section.title}-${item.label}`} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.75 }}>
              <Box
                aria-hidden
                sx={{
                  flexShrink: 0,
                  width: 16,
                  height: item.shape === 'line' ? 3 : 16,
                  borderRadius: item.shape === 'dot' ? '50%' : 0.5,
                  bgcolor: item.color,
                  border: item.shape === 'line' ? 'none' : '1px solid rgba(0,0,0,0.15)',
                }}
              />
              <Typography sx={{ fontSize: '0.8125rem', minWidth: 0 }} noWrap title={item.label}>{item.label}</Typography>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
