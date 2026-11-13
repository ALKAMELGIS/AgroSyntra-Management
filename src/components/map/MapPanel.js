import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Box, ButtonBase, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Radio, Tooltip, Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { CloseRounded as CloseIcon } from '@mui/icons-material';
import { BASEMAPS } from '../../utils/mapBasemaps';

/**
 * Docked map workspace (GIS Map, GPS Tracking):
 *
 *   [ tool bar | docked panel (opens / closes, pushes the map) | map ]
 *
 * - The tool bar is a slim column on the start edge: panel tools (Layers,
 *   Legend, Basemaps, Equipment …) and action tools (Add data …).
 * - One docked panel shows the selected tool. It is part of the layout, not a
 *   floating card: opening it narrows the map, closing it gives the width back.
 *   On phones the panel covers the map area while open (too narrow for both).
 * - Nothing floats over the map except Leaflet's own zoom buttons (opposite
 *   top corner) and map credits, so nothing can overlap.
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

/**
 * tools: [{ key, label, icon, badge?, title?, content? , onClick?, actions? }]
 *   – with `content`: a panel tool (toggles the docked panel);
 *   – with `onClick`: an action (e.g. Add data).
 *
 * endTools / endWorkspace: an optional second tool bar on the opposite edge
 * (e.g. satellite tools on GIS Map) with its own docked panel:
 *
 *   [ tools | panel | map | end panel | end tools ]
 */
function ToolRail({ tools, workspace, panelId, label, side }) {
  const theme = useTheme();
  const rtl = theme.direction === 'rtl';
  const end = side === 'end';
  const tipSide = (rtl !== end) ? 'left' : 'right';
  return (
    <Box
      component="nav"
      aria-label={label}
      sx={{
        width: RAIL_WIDTH, flexShrink: 0, py: 1.5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, overflowY: 'auto',
        [end ? 'borderInlineStart' : 'borderInlineEnd']: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', zIndex: 2,
      }}
    >
      {tools.map((tool) => {
        if (tool.divider) return <Box key={tool.key} sx={{ width: 24, height: '1px', bgcolor: 'divider', my: 0.5, flexShrink: 0 }} />;
        const isPanel = Boolean(tool.content);
        const pressed = isPanel ? workspace.active === tool.key : Boolean(tool.pressed);
        const iconEl = tool.badge ? <Badge badgeContent={tool.badge} color="primary" max={99}>{tool.icon}</Badge> : tool.icon;
        return (
          <Tooltip key={tool.key} title={tool.label} placement={tipSide}>
            <span>
              <IconButton
                size="small"
                aria-label={tool.label}
                aria-pressed={isPanel || tool.pressed !== undefined ? pressed : undefined}
                aria-controls={isPanel ? panelId : undefined}
                aria-expanded={isPanel ? pressed : undefined}
                disabled={tool.disabled}
                onClick={isPanel ? () => workspace.toggle(tool.key) : tool.onClick}
                sx={{
                  flexShrink: 0,
                  color: pressed ? 'primary.main' : 'text.secondary',
                  bgcolor: pressed ? 'action.selected' : 'transparent',
                  // A thin bar on the outer edge marks the open tool.
                  position: 'relative',
                  '&::before': pressed ? {
                    content: '""', position: 'absolute', [end ? 'insetInlineEnd' : 'insetInlineStart']: -8, top: 6, bottom: 6, width: 3, borderRadius: 2, bgcolor: 'primary.main',
                  } : undefined,
                }}
              >
                {iconEl}
              </IconButton>
            </span>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function DockedPanel({ current, workspace, panelId, panelWidth, side }) {
  const open = Boolean(current);
  const end = side === 'end';
  return (
    <Box
      id={panelId}
      component="section"
      aria-label={current ? current.title || current.label : undefined}
      hidden={!open}
      sx={{
        display: open ? 'flex' : 'none',
        flexDirection: 'column',
        width: { xs: `calc(100% - ${RAIL_WIDTH}px)`, sm: panelWidth },
        flexShrink: 0,
        minHeight: 0,
        bgcolor: 'background.paper',
        [end ? 'borderInlineStart' : 'borderInlineEnd']: '1px solid',
        borderColor: 'divider',
        // Phones: cover the map area while open (docked to the tool bar, full height).
        position: { xs: 'absolute', sm: 'relative' },
        [end ? 'insetInlineEnd' : 'insetInlineStart']: { xs: RAIL_WIDTH, sm: 'auto' },
        top: 0,
        bottom: 0,
        zIndex: { xs: 1100, sm: 1 },
      }}
    >
      {current && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, minHeight: 48, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex', '& .MuiSvgIcon-root': { fontSize: 20 } }}>{current.icon}</Box>
            <Typography component="h2" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, flex: 1, minWidth: 0 }}>
              {current.title || current.label}
            </Typography>
            {current.actions}
            <IconButton size="small" onClick={workspace.close} aria-label={`Close ${current.title || current.label}`}><CloseIcon /></IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{current.content}</Box>
        </>
      )}
    </Box>
  );
}

/* ---- phones ---------------------------------------------------------------
 * Two side rails would eat a quarter of a 390 px screen. On phones all tools sit
 * in one labelled strip above the map (GIS group | satellite group), and a tool
 * panel opens as a sheet over the lower part of the map, so the map stays in view.
 */
function PhoneToolStrip({ groups }) {
  return (
    <Box
      component="nav"
      aria-label="Map tools"
      sx={{
        display: 'flex', alignItems: 'stretch', gap: 0.5, px: 1, flexShrink: 0,
        overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
        borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
      }}
    >
      {groups.map((g, gi) => (
        <Box key={g.label} sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, flexShrink: 0 }}>
          {gi > 0 && <Box aria-hidden sx={{ width: '1px', my: 2, mx: 1, bgcolor: 'divider', flexShrink: 0 }} />}
          {g.tools.filter((t) => !t.divider).map((tool) => {
            const isPanel = Boolean(tool.content);
            const pressed = isPanel ? g.workspace.active === tool.key : Boolean(tool.pressed);
            const iconEl = tool.badge ? <Badge badgeContent={tool.badge} color="primary" max={99}>{tool.icon}</Badge> : tool.icon;
            return (
              <ButtonBase
                key={tool.key}
                aria-label={tool.label}
                aria-pressed={isPanel || tool.pressed !== undefined ? pressed : undefined}
                disabled={tool.disabled}
                onClick={isPanel ? () => g.open(tool.key) : tool.onClick}
                sx={{
                  flexDirection: 'column', gap: 0.5, minWidth: 64, maxWidth: 96, px: 1.5, py: 1.5,
                  color: pressed ? 'primary.main' : 'text.secondary',
                  bgcolor: pressed ? 'action.selected' : 'transparent',
                  borderBottom: '2px solid', borderColor: pressed ? 'primary.main' : 'transparent',
                  '& .MuiSvgIcon-root': { fontSize: 20 },
                  '&.Mui-disabled': { opacity: 0.4 },
                }}
              >
                {iconEl}
                <Box component="span" sx={{ fontSize: '0.6875rem', lineHeight: 1.2, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {tool.label}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function PhoneSheet({ current, onClose, panelId }) {
  if (!current) return null;
  return (
    <Box
      id={panelId}
      component="section"
      aria-label={current.title || current.label}
      sx={{
        position: 'absolute', insetInline: 0, bottom: 0, height: '62%', zIndex: 1100,
        display: 'flex', flexDirection: 'column', bgcolor: 'background.paper',
        borderTop: '1px solid', borderColor: 'divider', boxShadow: '0 -4px 16px rgba(0,0,0,0.12)',
      }}
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

  if (isPhone) {
    // Opening a tool of one group closes the other group's panel: one sheet at a time.
    const groups = [
      { label, tools: list, workspace, open: (k) => { endWorkspace.close(); workspace.toggle(k); } },
      ...(endList.length ? [{ label: endLabel, tools: endList, workspace: endWorkspace, open: (k) => { workspace.close(); endWorkspace.toggle(k); } }] : []),
    ];
    const sheet = endCurrent || current;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height, minHeight: 0, bgcolor: 'background.paper' }}>
        <PhoneToolStrip groups={groups} />
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {children}
          <PhoneSheet
            current={sheet}
            panelId={endCurrent ? `${id}-end-panel` : `${id}-panel`}
            onClose={() => (endCurrent ? endWorkspace.close() : workspace.close())}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height, position: 'relative', minHeight: 0, bgcolor: 'background.paper' }}>
      <ToolRail tools={list} workspace={workspace} panelId={`${id}-panel`} label={label} side="start" />
      {/* Docked panel: part of the layout (pushes the map), not a floating card. */}
      <DockedPanel current={current} workspace={workspace} panelId={`${id}-panel`} panelWidth={panelWidth} side="start" />

      {/* Map area */}
      <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>{children}</Box>

      {endList.length > 0 && (
        <>
          <DockedPanel current={endCurrent} workspace={endWorkspace} panelId={`${id}-end-panel`} panelWidth={endPanelWidth} side="end" />
          <ToolRail tools={endList} workspace={endWorkspace} panelId={`${id}-end-panel`} label={endLabel} side="end" />
        </>
      )}
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
