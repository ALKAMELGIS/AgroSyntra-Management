import { TableCell } from '@mui/material';

/**
 * Width of the row-number gutter. Exported because a table using both the
 * gutter and frozen columns has to start the frozen run after it.
 */
export const GUTTER_WIDTH = 44;

/**
 * Spreadsheet-style data table styling.
 *
 * Apply to a Table alongside a height-constrained TableContainer:
 *
 *   <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 560 }}>
 *     <Table size="small" sx={excelTableSx}>
 *
 * Four things together produce the spreadsheet read: a frozen row-number gutter,
 * a saturated frozen header band, gridlines on every cell, and colour confined to
 * the edges so body cells stay free to carry semantic row state.
 *
 * Vertical padding is left at the 10px App.css applies globally, so adopting
 * this does not change row heights.
 */
export const excelTableSx = (theme) => ({
  // Collapsed borders are dropped from sticky cells in Chrome, which leaves a
  // hairline gap under the header while scrolling. Separate borders plus inset
  // shadows on the header avoid it.
  borderCollapse: 'separate',
  borderSpacing: 0,

  // The !important below is not decoration. App.css styles .MuiTableCell-head
  // and .MuiTableCell-body globally with !important, which no amount of
  // specificity can beat. Each one here matches a property App.css forces;
  // remove one and that property silently reverts to the global grey.
  '& .MuiTableCell-root': {
    borderBottom: `1px solid ${theme.palette.table.gridline} !important`,
    borderRight: `1px solid ${theme.palette.table.gridline}`,
    '&:last-of-type': { borderRight: 0 },
  },

  // The whole header block is pinned, not each cell: rows 2 and 3 of a
  // multi-row header then stay under row 1 whatever its height (per-cell
  // top offsets went wrong as soon as a title wrapped). Frozen header cells
  // stay sticky sideways via their own col-frozen / gutter rules.
  '& .MuiTableHead-root': {
    position: 'sticky',
    top: 0,
    zIndex: 3,
  },
  '&& .MuiTableCell-head': {
    position: 'static',
    zIndex: 3,
    backgroundColor: `${theme.palette.table.headerBg} !important`,
    color: `${theme.palette.table.headerText} !important`,
    fontSize: '0.75rem !important',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: 0,
    // Long titles wrap onto a second line instead of forcing a wide column, so
    // more columns fit on screen; minWidth keeps short columns from squeezing
    // titles into a tall stack.
    whiteSpace: 'normal',
    minWidth: 96,
    lineHeight: 1.3,
    verticalAlign: 'bottom',
    '&:empty, &.MuiTableCell-paddingCheckbox': { minWidth: 0 },
    borderBottom: 'none !important',
    borderRight: 0,
    boxShadow: `inset -1px 0 0 ${theme.palette.table.headerRule}, inset 0 -1px 0 ${theme.palette.table.headerRule}`,
    '&:last-of-type': { boxShadow: `inset 0 -1px 0 ${theme.palette.table.headerRule}` },
  },

  '&& .table-gutter': {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    width: GUTTER_WIDTH,
    minWidth: GUTTER_WIDTH,
    // Vertical stays at the 10px App.css gives every other cell, so row heights
    // do not shift; only the horizontal padding tightens for a narrow column.
    padding: '10px 8px !important',
    backgroundColor: theme.palette.table.gutterBg,
    color: theme.palette.table.gutterText,
    fontSize: '0.6875rem !important',
    textAlign: 'right',
    userSelect: 'none',
    borderRight: `1px solid ${theme.palette.divider}`,
  },

  // Corner cell is part of the header band and must sit above both sticky axes.
  // Declared after the gutter rule so it wins the tie for that one cell.
  '&& .MuiTableCell-head.table-gutter': {
    position: 'sticky',
    left: 0,
    zIndex: 4,
    minWidth: GUTTER_WIDTH,
    backgroundColor: `${theme.palette.table.headerBg} !important`,
    borderRight: 0,
  },

  '&& .MuiTableCell-head .MuiTableSortLabel-root': {
    color: 'inherit',
    '&:hover': { color: 'inherit' },
    '&.Mui-active': { color: 'inherit' },
  },
  '&& .MuiTableCell-head .MuiTableSortLabel-icon': {
    color: 'inherit !important',
  },

  // Compact, one-line rows (sheet look): values do not wrap into tall rows;
  // the table scrolls sideways instead.
  // Records plan (round 45): 12 px text, 30 px rows, 8 px side padding, the
  // density of a spreadsheet. Touch screens get 40 px rows ("comfortable").
  '&& .MuiTableCell-body': {
    whiteSpace: 'nowrap',
    fontSize: '0.75rem !important',
    paddingTop: '5px !important',
    paddingBottom: '5px !important',
    paddingLeft: '8px !important',
    paddingRight: '8px !important',
    lineHeight: 1.6,
    '@media (pointer: coarse)': { paddingTop: '10px !important', paddingBottom: '10px !important' },
  },
  '&&& .MuiTableCell-head': {
    fontSize: '0.75rem !important',
    paddingTop: '6px !important',
    paddingBottom: '6px !important',
    paddingLeft: '8px !important',
    paddingRight: '8px !important',
  },
  '&& .MuiTableCell-root .MuiCheckbox-root .MuiSvgIcon-root': { fontSize: 18 },
  // Column-group band above the column titles (light green, records plan).
  '&&& .MuiTableCell-head.col-group': {
    backgroundColor: `${theme.palette.table.groupBg} !important`,
    color: `${theme.palette.table.groupText} !important`,
    fontSize: '0.6875rem !important',
    paddingTop: '4px !important',
    paddingBottom: '4px !important',
  },
  // Row actions stay inside the 30 px row.
  '&&& .MuiTableCell-body .MuiIconButton-root': { padding: '3px', width: 26, height: 26, minWidth: 26, minHeight: 26, '& .MuiSvgIcon-root': { fontSize: 18 } },
  '&&& .MuiTableCell-body .MuiCheckbox-root': { padding: '1px' },
  // Checkbox columns: no "…" from the frozen-column ellipsis, tight padding.
  '&& .MuiTableCell-paddingCheckbox': {
    textOverflow: 'clip',
    paddingLeft: '4px !important',
    paddingRight: '4px !important',
    '& .MuiCheckbox-root': { padding: '4px' },
  },

  '& .col-numeric': {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  // Out-of-range readings: dark red text only, no coloured chips filling the grid.
  '& .val-bad': { color: theme.palette.mode === 'dark' ? '#f6a99e' : '#b42318', fontWeight: 600 },
  '& .val-warn': { color: theme.palette.mode === 'dark' ? '#f0c88e' : '#8a5a00', fontWeight: 600 },

  // Row state is painted on the cells rather than the row, because sticky cells
  // have their own background and would otherwise not pick it up. The gutter is
  // excluded so the frozen column does not smear when scrolling sideways.
  '& .MuiTableBody-root .MuiTableRow-root:hover .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: theme.palette.table.rowHover,
  },
  '& .MuiTableBody-root .MuiTableRow-root.Mui-selected .MuiTableCell-root:not(.table-gutter)': {
    backgroundColor: theme.palette.table.selectionRange,
  },
});

/**
 * Freezes the leading columns against the left edge, the way Excel's Freeze
 * Panes does, so the columns that identify a row stay visible on a table wide
 * enough to scroll sideways.
 *
 * Merge it after excelTableSx, then tag the cells by position on both the head
 * and body rows:
 *
 *   <Table sx={[excelTableSx, freezeColumnsSx([140, 110, 100])]}>
 *     <TableCell className="col-frozen-0">Crop</TableCell>
 *
 * Widths are fixed rather than minimums because each column is offset by the
 * sum of the widths before it. Let one size to its content and every column
 * after it lands in the wrong place. Anything too long is ellipsized, so give
 * body cells a title attribute carrying the full value.
 *
 * @param {number[]} widths Column widths in px, ordered from the left edge.
 * @param {number} [startLeft] Offset the run begins at. Pass the gutter width
 *   when a table has both, or the first frozen column slides underneath it.
 */
export function freezeColumnsSx(widths, startLeft = 0) {
  return (theme) => {
    const rules = {};
    let left = startLeft;
    widths.forEach((width, i) => {
      // The boundary reads better as a shadow than a border: it looks like the
      // scrolling columns pass underneath rather than stopping at a line.
      const edge = i === widths.length - 1
        ? { boxShadow: '4px 0 6px -4px rgba(0,0,0,0.28)' }
        : {};
      rules[`& .col-frozen-${i}`] = {
        position: 'sticky',
        left,
        width,
        minWidth: width,
        maxWidth: width,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        // Sticky cells are transparent by default, which lets the columns
        // scrolling behind them show through.
        backgroundColor: theme.palette.background.paper,
        zIndex: 2,
        ...edge,
      };
      // These header cells are sticky on both axes at once, so they have to
      // clear the header band as well as the frozen columns.
      rules[`&& .MuiTableCell-head.col-frozen-${i}`] = { position: 'sticky', left, zIndex: 4, minWidth: width, ...edge };
      left += width;
    });
    // Native date pickers in frozen cells cannot open when overflow is hidden.
    rules['& .col-frozen-date'] = { overflow: 'visible' };
    return rules;
  };
}

/**
 * Frozen row-number cell. Replaces a "#" column rather than adding to it, so
 * column counts and existing colSpan values stay correct.
 *
 * @param {{ index?: number }} props 1-based row number; omit for the header cell.
 */
export function GutterCell({ index }) {
  return <TableCell className="table-gutter">{index}</TableCell>;
}
