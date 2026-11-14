import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Card, CardActionArea, CardContent, Checkbox, Chip, CircularProgress, Divider, Drawer,
  FormControl, IconButton, InputAdornment, InputLabel, List, ListItemButton, ListItemIcon,
  ListItemText, ListSubheader, Menu, MenuItem, Popover, Select, Table, TableBody, TableCell,
  TableContainer, TableFooter, TableHead, TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  ViewColumnOutlined as ColumnsIcon, FilterAltOutlined as FilterIcon, FilterAlt as FilterOnIcon,
  SearchOutlined as SearchIcon, CloseOutlined as CloseIcon,
  ContentCopyOutlined as CopyIcon, FilterAltOffOutlined as ClearFilterIcon,
} from '@mui/icons-material';
import useAppLayout from '../../hooks/useAppLayout';
import { excelTableSx, freezeColumnsSx, GUTTER_WIDTH } from './ExcelTable';

/**
 * DataSheet: one records view that suits every kind of user.
 *
 * Desktop and tablet landscape get a spreadsheet that behaves like Excel:
 * row numbers, frozen identifying columns, column groups, sort and AutoFilter
 * on each header, a totals row, show/hide columns (remembered per browser),
 * click-drag or Shift+arrow cell selection with a Count / Sum / Average bar,
 * and Ctrl+C that pastes straight into Excel.
 *
 * Phones and tablets in portrait get cards (one column on a phone, two on a
 * tablet) that show the fields people check in the field, with a details
 * sheet holding every column.
 *
 * columns: [{
 *   key, label, group?, width? (frozen columns need one), minWidth?, numeric?,
 *   frozen?, hidden? (hidden by default), total?: 'sum',
 *   value?: (row) => raw value used for sort, filter, copy and totals,
 *   render?: (row) => node shown in the cell (defaults to value),
 *   format?: (number) => string for totals,
 * }]
 */

const STORAGE_PREFIX = 'agrocloud_sheet_cols:';
const GROUP_ROW_HEIGHT = 30;

const readHidden = (key, columns) => {
  const fallback = new Set(columns.filter((c) => c.hidden).map((c) => c.key));
  if (!key) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return fallback;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : fallback;
  } catch {
    return fallback;
  }
};

const valueOf = (col, row) => {
  if (col.value) return col.value(row);
  const v = row[col.key];
  return v === undefined ? null : v;
};

const isBlank = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
const asText = (v) => (isBlank(v) ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
const asNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/,/g, '')))) return Number(v.replace(/,/g, ''));
  return null;
};
const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));

const compare = (a, b) => {
  if (isBlank(a) && isBlank(b)) return 0;
  if (isBlank(a)) return 1; // blanks last, like Excel
  if (isBlank(b)) return -1;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na != null && nb != null) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="checkbox"], [role="button"]';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Header AutoFilter                                                         */
/* ------------------------------------------------------------------------ */

function HeaderFilter({ col, rows, selected, onChange }) {
  const [anchor, setAnchor] = useState(null);
  const [q, setQ] = useState('');
  const options = useMemo(() => {
    if (!anchor) return [];
    const seen = new Map();
    rows.forEach((r) => {
      const t = asText(valueOf(col, r));
      seen.set(t, (seen.get(t) || 0) + 1);
    });
    return [...seen.entries()].sort((a, b) => compare(a[0], b[0]));
  }, [anchor, rows, col]);
  const shown = options.filter(([t]) => !q || t.toLowerCase().includes(q.toLowerCase()));
  const active = selected && selected.size > 0;
  const isOn = (t) => !active || selected.has(t);
  const toggle = (t) => {
    const base = active ? new Set(selected) : new Set(options.map(([v]) => v));
    if (base.has(t)) base.delete(t); else base.add(t);
    onChange(base.size === options.length ? null : base);
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Filter ${col.label}`}
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        sx={{
          color: active ? 'primary.main' : 'inherit', p: '2px', ml: 0.25, opacity: active ? 1 : 0.7,
          bgcolor: active ? 'action.selected' : 'transparent',
          '&:hover': { opacity: 1, bgcolor: 'action.hover' },
          '& .MuiSvgIcon-root': { fontSize: 16 },
        }}
      >
        {active ? <FilterOnIcon /> : <FilterIcon />}
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => { setAnchor(null); setQ(''); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 260, maxHeight: 420, display: 'flex', flexDirection: 'column' } } }}
      >
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{col.label}</Typography>
          <TextField
            size="small" fullWidth placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            inputProps={{ 'aria-label': `Search ${col.label}` }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, px: 1.5 }}>
          <Button size="small" onClick={() => onChange(null)}>Select all</Button>
          <Button size="small" onClick={() => onChange(new Set())} disabled={!options.length}>Clear</Button>
        </Box>
        <Divider sx={{ mt: 0.5 }} />
        <List dense sx={{ overflowY: 'auto', flex: 1, py: 0 }}>
          {shown.map(([t, n]) => (
            <ListItemButton key={t || '__blank'} onClick={() => toggle(t)} sx={{ py: 0 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Checkbox edge="start" size="small" checked={isOn(t)} tabIndex={-1} disableRipple
                  inputProps={{ 'aria-label': t || 'Blanks' }} />
              </ListItemIcon>
              <ListItemText
                translate={col.translate || col.render ? undefined : 'no'}
                primary={t ? <bdi>{t}</bdi> : <Typography component="span" variant="body2" color="text.secondary">(Blanks)</Typography>}
                secondary={null}
              />
              <Typography variant="caption" color="text.secondary">{n}</Typography>
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Columns menu                                                              */
/* ------------------------------------------------------------------------ */

function ColumnsMenu({ columns, hidden, setHidden }) {
  const [anchor, setAnchor] = useState(null);
  const groups = [];
  columns.forEach((c) => {
    if (c.frozen) return;
    const g = c.group || '';
    let entry = groups.find((x) => x.name === g);
    if (!entry) { entry = { name: g, cols: [] }; groups.push(entry); }
    entry.cols.push(c);
  });
  const hiddenCount = columns.filter((c) => !c.frozen && hidden.has(c.key)).length;
  const toggleGroup = (cols, show) => {
    const next = new Set(hidden);
    cols.forEach((c) => (show ? next.delete(c.key) : next.add(c.key)));
    setHidden(next);
  };

  return (
    <>
      <Button
        size="small" variant="outlined" color="inherit" startIcon={<ColumnsIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ borderColor: 'divider', color: 'text.secondary', textTransform: 'none' }}
      >
        {hiddenCount ? `Columns (${columns.filter((c) => !c.frozen).length - hiddenCount})` : 'Columns'}
      </Button>
      <Menu
        anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 480, width: 280 } } }}
      >
        <Box sx={{ display: 'flex', gap: 1, px: 1.5, pb: 0.5 }}>
          <Button size="small" onClick={() => setHidden(new Set())}>Show all</Button>
          <Button size="small" onClick={() => setHidden(new Set(columns.filter((c) => c.hidden).map((c) => c.key)))}>Reset</Button>
        </Box>
        {groups.map((g) => {
          const allShown = g.cols.every((c) => !hidden.has(c.key));
          return [
            g.name ? (
              <ListSubheader key={`g-${g.name}`} sx={{ lineHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {g.name}
                <Button size="small" onClick={() => toggleGroup(g.cols, !allShown)} sx={{ minWidth: 0, textTransform: 'none' }}>
                  {allShown ? 'Hide' : 'Show'}
                </Button>
              </ListSubheader>
            ) : null,
            ...g.cols.map((c) => (
              <MenuItem
                key={c.key} dense
                onClick={() => {
                  const next = new Set(hidden);
                  if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                  setHidden(next);
                }}
              >
                <Checkbox size="small" checked={!hidden.has(c.key)} sx={{ p: 0.5, mr: 1 }} tabIndex={-1}
                  inputProps={{ 'aria-label': c.label }} />
                <ListItemText primary={c.label} />
              </MenuItem>
            )),
          ];
        })}
      </Menu>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Phone / tablet portrait: cards + details sheet                            */
/* ------------------------------------------------------------------------ */

function DetailsSheet({ row, columns, card, onClose, actions }) {
  const open = Boolean(row);
  const groups = [];
  if (row) {
    columns.forEach((c) => {
      const g = c.group || '';
      let e = groups.find((x) => x.name === g);
      if (!e) { e = { name: g, cols: [] }; groups.push(e); }
      e.cols.push(c);
    });
  }
  return (
    <Drawer
      anchor="bottom" open={open} onClose={onClose}
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' } } }}
    >
      {row && (
        <Box sx={{ pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 2, pt: 1.5, pb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>{card.title(row)}</Typography>
              {card.subtitle && <Typography variant="body2" color="text.secondary">{card.subtitle(row)}</Typography>}
            </Box>
            {card.status && card.status(row)}
            <IconButton aria-label="Close" onClick={onClose} sx={{ mt: -0.5 }}><CloseIcon /></IconButton>
          </Box>
          {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', px: 2, pb: 1.5 }}>{actions(row)}</Box>}
          <Divider />
          <Box sx={{ overflowY: 'auto', px: 2 }}>
            {groups.map((g) => (
              <Box key={g.name || 'main'} sx={{ py: 1 }}>
                {g.name && (
                  <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 0, lineHeight: 2 }}>
                    {g.name}
                  </Typography>
                )}
                {g.cols.map((c) => {
                  const node = c.render ? c.render(row) : asText(valueOf(c, row));
                  const empty = node === null || node === undefined || node === '';
                  return (
                    <Box key={c.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{c.label}</Typography>
                      <Typography variant="body2" translate={c.translate || c.render ? undefined : 'no'} sx={{ fontWeight: 500, textAlign: 'end', minWidth: 0, overflowWrap: 'anywhere' }}>
                        {empty ? '—' : node}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

function RecordCards({ rows, columns, card, selection, getRowId, actions, rowRef, rowHighlighted, loading, emptyText }) {
  const [detail, setDetail] = useState(null);
  const byKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);
  if (!rows.length) {
    return loading ? (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 4 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading records…</Typography>
      </Box>
    ) : (
      <Typography color="text.secondary" align="center" py={4}>{emptyText}</Typography>
    );
  }
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, pb: 1 }}>
        {rows.map((row) => {
          const id = getRowId(row);
          const fields = (card.fields || []).map((k) => byKey[k]).filter(Boolean);
          const hi = rowHighlighted && rowHighlighted(row);
          return (
            <Card
              key={id} variant="outlined" ref={rowRef ? rowRef(row) : undefined}
              sx={{ boxShadow: 'none', display: 'flex', flexDirection: 'column', ...(hi ? { borderColor: 'warning.main', bgcolor: (t) => alpha(t.palette.warning.main, 0.08) } : null) }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                {selection && (
                  <Checkbox
                    size="small" sx={{ mt: 1, ml: 0.5 }}
                    checked={selection.selected.has(id)} onChange={() => selection.onToggle(id)}
                    inputProps={{ 'aria-label': 'Select row' }}
                  />
                )}
                <CardActionArea onClick={() => setDetail(row)} sx={{ flex: 1, minWidth: 0, borderRadius: 0 }} aria-label="Show details">
                  <CardContent sx={{ p: 1.75, pl: selection ? 0.5 : 1.75, '&:last-child': { pb: 1.5 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} sx={{ lineHeight: 1.35 }}>{card.title(row)}</Typography>
                        {card.subtitle && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{card.subtitle(row)}</Typography>
                        )}
                      </Box>
                      {card.status && <Box sx={{ flexShrink: 0 }}>{card.status(row)}</Box>}
                    </Box>
                    {fields.length > 0 && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 1.5, rowGap: 0.75, mt: 1.25 }}>
                        {fields.map((c) => {
                          const node = c.render ? c.render(row) : asText(valueOf(c, row));
                          const empty = node === null || node === undefined || node === '';
                          return (
                            <Box key={c.key} sx={{ minWidth: 0 }}>
                              <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3 }}>{c.cardLabel || c.label}</Typography>
                              <Typography variant="body2" component="div" translate={c.translate || c.render ? undefined : 'no'} sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {empty ? '—' : node}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </CardContent>
                </CardActionArea>
              </Box>
              {actions && (() => {
                const a = actions(row, 'card');
                return a ? (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', px: 1.75, pb: 1.5, mt: 'auto' }}>{a}</Box>
                ) : null;
              })()}
            </Card>
          );
        })}
      </Box>
      <DetailsSheet row={detail} columns={columns} card={card} onClose={() => setDetail(null)}
        actions={actions ? (r) => actions(r, 'sheet') : null} />
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* DataSheet                                                                 */
/* ------------------------------------------------------------------------ */

export default function DataSheet({
  columns,
  rows,
  getRowId = (r) => r.id,
  storageKey,
  height,
  loading = false,
  emptyText = 'No records found',
  selection,
  actions,
  actionsLabel = 'Actions',
  card,
  rowClassName,
  rowRef,
  rowHighlighted,
  tableSx,
  ariaLabel = 'Records',
  toolbarExtra,
}) {
  const theme = useTheme();
  const rtl = theme.direction === 'rtl';
  const { isMobile } = useAppLayout();

  const [hidden, setHiddenState] = useState(() => readHidden(storageKey, columns));
  const setHidden = useCallback((next) => {
    setHiddenState(next);
    if (storageKey) {
      try { window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify([...next])); } catch { /* private mode */ }
    }
  }, [storageKey]);

  const [sort, setSort] = useState(null); // { key, dir }
  const [filters, setFilters] = useState({}); // key -> Set | null

  const visible = useMemo(() => columns.filter((c) => c.frozen || !hidden.has(c.key)), [columns, hidden]);
  const frozen = visible.filter((c) => c.frozen);
  const hasGroups = visible.some((c) => c.group);
  const activeFilters = useMemo(() => Object.entries(filters).filter(([, s]) => s), [filters]);

  const viewRows = useMemo(() => {
    let out = rows;
    if (activeFilters.length) {
      const byKey = Object.fromEntries(columns.map((c) => [c.key, c]));
      out = out.filter((r) => activeFilters.every(([k, set]) => set.has(asText(valueOf(byKey[k], r)))));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = out
          .map((r, i) => [r, i])
          .sort((a, b) => {
            const d = compare(valueOf(col, a[0]), valueOf(col, b[0]));
            return (d === 0 ? a[1] - b[1] : (sort.dir === 'asc' ? d : -d));
          })
          .map(([r]) => r);
      }
    }
    return out;
  }, [rows, columns, sort, activeFilters]);

  const cycleSort = (key) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  /* ---- cell selection ---------------------------------------------------- */
  const [anchorCell, setAnchorCell] = useState(null); // { r, c }
  const [focusCell, setFocusCell] = useState(null);
  const dragging = useRef(false);
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const up = () => { dragging.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  // Selection refers to positions; reset it when the view changes shape.
  useEffect(() => { setAnchorCell(null); setFocusCell(null); }, [sort, filters, hidden, rows]);

  const range = useMemo(() => (anchorCell && focusCell ? {
    r1: Math.min(anchorCell.r, focusCell.r), r2: Math.max(anchorCell.r, focusCell.r),
    c1: Math.min(anchorCell.c, focusCell.c), c2: Math.max(anchorCell.c, focusCell.c),
  } : null), [anchorCell, focusCell]);
  const inRange = (r, c) => range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  const stats = useMemo(() => {
    if (!range) return null;
    let count = 0; let nums = 0; let sum = 0;
    for (let r = range.r1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) {
        const v = valueOf(visible[c], viewRows[r]);
        if (!isBlank(v)) count += 1;
        const n = visible[c].numeric ? asNumber(v) : null;
        if (n != null) { nums += 1; sum += n; }
      }
    }
    const cells = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    return { cells, count, nums, sum, avg: nums ? sum / nums : null };
  }, [range, visible, viewRows]);

  const copyRange = useCallback(async () => {
    if (!range) return;
    const lines = [];
    if (range.r1 === 0 && range.r2 === viewRows.length - 1 && viewRows.length > 1) {
      lines.push(visible.slice(range.c1, range.c2 + 1).map((c) => c.label).join('\t'));
    }
    for (let r = range.r1; r <= range.r2; r += 1) {
      const cells = [];
      for (let c = range.c1; c <= range.c2; c += 1) {
        cells.push(asText(valueOf(visible[c], viewRows[r])).replace(/[\t\n\r]+/g, ' '));
      }
      lines.push(cells.join('\t'));
    }
    if (await copyText(lines.join('\n'))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }, [range, visible, viewRows]);

  const onCellMouseDown = (e, r, c) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
    if (e.shiftKey && anchorCell) {
      setFocusCell({ r, c });
    } else {
      setAnchorCell({ r, c });
      setFocusCell({ r, c });
    }
    dragging.current = true;
    containerRef.current?.focus({ preventScroll: true });
  };
  const onCellMouseEnter = (r, c) => {
    if (dragging.current) setFocusCell({ r, c });
  };

  const scrollCellIntoView = (r, c) => {
    const el = containerRef.current?.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onKeyDown = (e) => {
    if (e.target !== containerRef.current) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'c' || e.key === 'C')) {
      if (range) { e.preventDefault(); copyRange(); }
      return;
    }
    if (mod && (e.key === 'a' || e.key === 'A')) {
      if (!viewRows.length) return;
      e.preventDefault();
      setAnchorCell({ r: 0, c: 0 });
      setFocusCell({ r: viewRows.length - 1, c: visible.length - 1 });
      return;
    }
    if (e.key === 'Escape') { setAnchorCell(null); setFocusCell(null); return; }
    const moves = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0],
      ArrowLeft: [0, rtl ? 1 : -1], ArrowRight: [0, rtl ? -1 : 1],
      Home: [0, -Infinity], End: [0, Infinity], Tab: [0, e.shiftKey ? -1 : 1], Enter: [e.shiftKey ? -1 : 1, 0],
    };
    if (!moves[e.key] || !viewRows.length) return;
    if (e.key === 'Tab' && !focusCell) return; // let Tab leave the table
    e.preventDefault();
    const from = focusCell || { r: 0, c: 0 };
    const [dr, dc] = moves[e.key];
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    const next = {
      r: clamp(from.r + dr, viewRows.length - 1),
      c: dc === Infinity ? visible.length - 1 : dc === -Infinity ? 0 : clamp(from.c + dc, visible.length - 1),
    };
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      if (!anchorCell) setAnchorCell(from);
      setFocusCell(next);
    } else {
      setAnchorCell(next);
      setFocusCell(next);
    }
    scrollCellIntoView(next.r, next.c);
  };

  /* ---- totals ------------------------------------------------------------ */
  const totals = useMemo(() => {
    const out = {};
    visible.forEach((c) => {
      if (c.total === 'sum') {
        out[c.key] = viewRows.reduce((s, r) => s + (asNumber(valueOf(c, r)) || 0), 0);
      }
    });
    return out;
  }, [visible, viewRows]);
  const hasTotals = Object.keys(totals).length > 0;

  /* ---- mobile ------------------------------------------------------------ */
  if (isMobile && card) {
    const sortable = columns.filter((c) => !c.noSort);
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, pt: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 0, flex: '0 1 200px' }}>
            <InputLabel shrink id={`${storageKey || 'sheet'}-sort-label`}>Sort by</InputLabel>
            <Select
              labelId={`${storageKey || 'sheet'}-sort-label`} label="Sort by"
              displayEmpty
              value={sort ? `${sort.key}:${sort.dir}` : ''}
              onChange={(e) => {
                const [key, dir] = String(e.target.value).split(':');
                setSort(key ? { key, dir } : null);
              }}
            >
              <MenuItem value="">Default order</MenuItem>
              {sortable.flatMap((c) => [
                <MenuItem key={`${c.key}:asc`} value={`${c.key}:asc`}>{`${c.label} ↑`}</MenuItem>,
                <MenuItem key={`${c.key}:desc`} value={`${c.key}:desc`}>{`${c.label} ↓`}</MenuItem>,
              ])}
            </Select>
          </FormControl>
          {toolbarExtra}
          {hasTotals && viewRows.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {visible.filter((c) => c.total === 'sum').map((c) => (
                <Chip
                  key={c.key} size="small" variant="outlined"
                  label={<span><Box component="span" sx={{ color: 'text.secondary' }}>{c.cardLabel || c.label}</Box>{' '}<bdi><b>{c.format ? c.format(totals[c.key]) : fmt(totals[c.key])}</b></bdi></span>}
                  sx={{ bgcolor: 'table.totalBg', borderColor: 'transparent', color: 'table.totalText' }}
                />
              ))}
            </Box>
          )}
        </Box>
        <RecordCards
          rows={viewRows} columns={columns} card={card} selection={selection} getRowId={getRowId}
          actions={actions} rowRef={rowRef} rowHighlighted={rowHighlighted} loading={loading} emptyText={emptyText}
        />
      </Box>
    );
  }

  /* ---- desktop ----------------------------------------------------------- */
  const leadWidths = [GUTTER_WIDTH, ...(selection ? [48] : []), ...frozen.map((c) => c.width || 120)];
  const allSelected = selection && viewRows.length > 0 && viewRows.every((r) => selection.selected.has(getRowId(r)));
  const someSelected = selection && viewRows.some((r) => selection.selected.has(getRowId(r)));
  const colSpanAll = visible.length + 1 + (selection ? 1 : 0) + (actions ? 1 : 0);

  // Group header cells: consecutive scrolling columns with the same group share one cell.
  const groupCells = [];
  if (hasGroups) {
    visible.forEach((c) => {
      if (c.frozen) return;
      const last = groupCells[groupCells.length - 1];
      if (last && last.name === (c.group || '')) last.span += 1;
      else groupCells.push({ name: c.group || '', span: 1, key: c.key });
    });
  }
  const headRowSpan = hasGroups ? 2 : 1;
  const frozenClass = (i) => `col-frozen-${i}`;
  const leadOffset = selection ? 2 : 1; // gutter (+ checkbox) precede frozen data columns

  const sheetSx = (t) => ({
    '&& .MuiTableCell-head': { py: '6px' },
    ...(hasGroups ? {
      '&& .MuiTableHead-root tr:first-of-type .MuiTableCell-head.sheet-group': {
        height: GROUP_ROW_HEIGHT, top: 0, py: 0, textAlign: 'center', verticalAlign: 'middle',
        fontSize: '0.6875rem !important', letterSpacing: '0.02em',
        backgroundColor: `${t.palette.table.groupBg} !important`,
        color: `${t.palette.table.groupText} !important`,
        boxShadow: `inset -1px 0 0 ${t.palette.table.headerRule}, inset 0 -1px 0 ${t.palette.table.headerRule}`,
      },
      '&& .MuiTableHead-root tr:first-of-type .MuiTableCell-head.sheet-group-empty': {
        backgroundColor: `${t.palette.table.headerBg} !important`,
      },
      '&& .MuiTableHead-root tr:nth-of-type(2) .MuiTableCell-head': { top: GROUP_ROW_HEIGHT },
    } : null),
    '& .MuiTableBody-root td': { userSelect: 'none', cursor: 'cell' },
    '&& .MuiTableBody-root td.sheet-actions, && .MuiTableBody-root td.MuiTableCell-paddingCheckbox': {
      paddingTop: '2px !important', paddingBottom: '2px !important',
    },
    '& td.sheet-actions .MuiIconButton-root': { padding: '5px' },
    '& td.MuiTableCell-paddingCheckbox .MuiCheckbox-root': { padding: '6px' },
    '& .MuiTableBody-root td.MuiTableCell-paddingCheckbox, & .MuiTableBody-root td.sheet-actions': { cursor: 'default' },
    '&& .MuiTableBody-root td.cell-sel': {
      backgroundColor: `${alpha(t.palette.table.selection, t.palette.mode === 'dark' ? 0.22 : 0.12)} !important`,
    },
    '&& .MuiTableBody-root td.cell-focus': {
      boxShadow: `inset 0 0 0 2px ${t.palette.table.selection}`,
    },
    '&& .MuiTableBody-root td.cell-sel.col-frozen-edge, && .MuiTableBody-root td.cell-focus.col-frozen-edge': {
      boxShadow: `inset 0 0 0 2px ${t.palette.table.selection}, 4px 0 6px -4px rgba(0,0,0,0.28)`,
    },
    '& .MuiTableFooter-root td': {
      position: 'sticky', bottom: 0, zIndex: 2,
      backgroundColor: `${t.palette.table.totalBg} !important`,
      color: t.palette.table.totalText, fontWeight: 700, fontSize: '0.8125rem',
      borderTop: `2px solid ${alpha(t.palette.table.totalText, 0.35)}`,
      borderBottom: '0 !important',
      fontVariantNumeric: 'tabular-nums',
    },
    '& .MuiTableFooter-root td[class*="col-frozen-"], & .MuiTableFooter-root td.table-gutter': { zIndex: 3 },
    '& .MuiTableBody-root tr.row-gutter-hover td.table-gutter': { color: t.palette.text.primary },
  });

  const statusBar = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 32 }}>
      <Chip size="small" color="primary" variant="outlined" label={`${viewRows.length} records`} />
      {activeFilters.length > 0 && (
        <Button size="small" startIcon={<ClearFilterIcon />} onClick={() => setFilters({})} sx={{ textTransform: 'none' }}>
          Clear column filters
        </Button>
      )}
      {stats && stats.cells > 1 && (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', color: 'text.secondary', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
          <span><span>Count</span>: <b><bdi>{stats.count}</bdi></b></span>
          {stats.nums > 0 && <span><span>Sum</span>: <b><bdi>{fmt(stats.sum)}</bdi></b></span>}
          {stats.nums > 0 && <span><span>Average</span>: <b><bdi>{fmt(stats.avg)}</bdi></b></span>}
        </Box>
      )}
      {range && (
        <Tooltip title="Copy (Ctrl+C) — paste into Excel">
          <Button size="small" startIcon={<CopyIcon />} onClick={copyRange} sx={{ textTransform: 'none' }}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Tooltip>
      )}
      <Box sx={{ flex: 1 }} />
      {toolbarExtra}
      <ColumnsMenu columns={columns} hidden={hidden} setHidden={setHidden} />
    </Box>
  );

  const headerCell = (c, idx) => {
    const fi = frozen.indexOf(c);
    const cls = [fi >= 0 ? frozenClass(fi + leadOffset) : '', c.numeric ? 'col-numeric' : ''].filter(Boolean).join(' ');
    const sorted = sort && sort.key === c.key;
    return (
      <TableCell
        key={c.key} className={cls || undefined}
        rowSpan={c.frozen ? headRowSpan : undefined}
        sortDirection={sorted ? sort.dir : false}
        sx={{ minWidth: c.frozen ? undefined : (c.minWidth || 96), whiteSpace: 'normal' }}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: c.numeric ? 'flex-end' : 'flex-start', width: '100%', gap: 0.25 }}>
          {c.noSort ? <span>{c.label}</span> : (
            <TableSortLabel
              active={Boolean(sorted)} direction={sorted ? sort.dir : 'asc'} onClick={() => cycleSort(c.key)}
              sx={{ '& .MuiTableSortLabel-icon': { fontSize: 16, mx: 0.25 } }}
            >
              {c.label}
            </TableSortLabel>
          )}
          {!c.noFilter && (
            <HeaderFilter col={c} rows={rows} selected={filters[c.key]}
              onChange={(set) => setFilters((f) => ({ ...f, [c.key]: set }))} />
          )}
        </Box>
      </TableCell>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 1 }}>{statusBar}</Box>
      <TableContainer
        ref={containerRef}
        component={Box}
        tabIndex={0}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        sx={{
          height, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper',
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
        }}
      >
        <Table
          stickyHeader size="small"
          sx={[excelTableSx, freezeColumnsSx(leadWidths), sheetSx, ...(Array.isArray(tableSx) ? tableSx : tableSx ? [tableSx] : [])]}
        >
          <TableHead>
            {hasGroups && (
              <TableRow>
                <TableCell className="table-gutter col-frozen-0" rowSpan={2} aria-label="Row number" />
                {selection && (
                  <TableCell className="col-frozen-1" padding="checkbox" rowSpan={2}>
                    <Checkbox
                      size="small" checked={Boolean(allSelected)} indeterminate={Boolean(someSelected && !allSelected)}
                      onChange={() => selection.onToggleAll(viewRows.map(getRowId), !allSelected)}
                      inputProps={{ 'aria-label': 'Select all rows' }}
                      sx={{ color: 'inherit', '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: 'inherit' } }}
                    />
                  </TableCell>
                )}
                {frozen.map((c) => headerCell(c))}
                {groupCells.map((g) => (
                  <TableCell key={`grp-${g.key}`} colSpan={g.span} className={g.name ? 'sheet-group' : 'sheet-group sheet-group-empty'}>
                    {g.name}
                  </TableCell>
                ))}
                {actions && <TableCell rowSpan={2} className="sheet-actions" sx={{ minWidth: 96 }}>{actionsLabel}</TableCell>}
              </TableRow>
            )}
            <TableRow>
              {!hasGroups && <TableCell className="table-gutter col-frozen-0" aria-label="Row number" />}
              {!hasGroups && selection && (
                <TableCell className="col-frozen-1" padding="checkbox">
                  <Checkbox
                    size="small" checked={Boolean(allSelected)} indeterminate={Boolean(someSelected && !allSelected)}
                    onChange={() => selection.onToggleAll(viewRows.map(getRowId), !allSelected)}
                    inputProps={{ 'aria-label': 'Select all rows' }}
                    sx={{ color: 'inherit', '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: 'inherit' } }}
                  />
                </TableCell>
              )}
              {(hasGroups ? visible.filter((c) => !c.frozen) : visible).map((c) => headerCell(c))}
              {!hasGroups && actions && <TableCell className="sheet-actions" sx={{ minWidth: 96 }}>{actionsLabel}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {viewRows.map((row, r) => {
              const id = getRowId(row);
              const selectedRow = selection && selection.selected.has(id);
              const cls = [rowClassName ? rowClassName(row) : '', selectedRow ? 'Mui-selected' : ''].filter(Boolean).join(' ');
              return (
                <TableRow key={id} hover className={cls || undefined} ref={rowRef ? rowRef(row) : undefined}>
                  <TableCell className="table-gutter col-frozen-0">{r + 1}</TableCell>
                  {selection && (
                    <TableCell className="col-frozen-1" padding="checkbox">
                      <Checkbox size="small" checked={Boolean(selectedRow)} onChange={() => selection.onToggle(id)}
                        inputProps={{ 'aria-label': 'Select row' }} />
                    </TableCell>
                  )}
                  {visible.map((c, ci) => {
                    const fi = frozen.indexOf(c);
                    const sel = inRange(r, ci);
                    const isFocus = focusCell && focusCell.r === r && focusCell.c === ci;
                    const classes = [
                      fi >= 0 ? frozenClass(fi + leadOffset) : '',
                      fi === frozen.length - 1 && fi >= 0 ? 'col-frozen-edge' : '',
                      c.numeric ? 'col-numeric' : '',
                      sel ? 'cell-sel' : '',
                      isFocus ? 'cell-focus' : '',
                    ].filter(Boolean).join(' ');
                    const raw = valueOf(c, row);
                    const content = c.render ? c.render(row) : asText(raw);
                    return (
                      <TableCell
                        key={c.key} className={classes || undefined} data-r={r} data-c={ci}
                        translate={c.translate || c.render ? undefined : 'no'}
                        data-ui-text={c.translate ? '' : undefined}
                        title={c.frozen ? asText(raw) : undefined}
                        onMouseDown={(e) => onCellMouseDown(e, r, ci)}
                        onMouseEnter={() => onCellMouseEnter(r, ci)}
                        sx={{ whiteSpace: c.wrap ? 'normal' : 'nowrap', ...(c.cellSx || null) }}
                      >
                        {content}
                      </TableCell>
                    );
                  })}
                  {actions && <TableCell className="sheet-actions">{actions(row, 'table')}</TableCell>}
                </TableRow>
              );
            })}
            {viewRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpanAll} align="center" sx={{ py: 4 }}>
                  {loading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                      <CircularProgress size={28} />
                      <Typography color="text.secondary">Loading records…</Typography>
                    </Box>
                  ) : (
                    <Typography color="text.secondary">{rows.length ? 'No records match the column filters' : emptyText}</Typography>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {hasTotals && viewRows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="table-gutter col-frozen-0">Σ</TableCell>
                {selection && <TableCell className="col-frozen-1" padding="checkbox" />}
                {visible.map((c, ci) => {
                  const fi = frozen.indexOf(c);
                  const cls = [fi >= 0 ? frozenClass(fi + leadOffset) : '', c.numeric ? 'col-numeric' : ''].filter(Boolean).join(' ');
                  let content = null;
                  if (c.total === 'sum') content = <bdi>{c.format ? c.format(totals[c.key]) : fmt(totals[c.key])}</bdi>;
                  else if (ci === 0) content = 'Total';
                  return <TableCell key={c.key} className={cls || undefined}>{content}</TableCell>;
                })}
                {actions && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
    </Box>
  );
}
