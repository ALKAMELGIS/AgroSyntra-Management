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

  '&& .MuiTableCell-head': {
    position: 'sticky',
    top: 0,
    zIndex: 3,
    backgroundColor: `${theme.palette.table.headerBg} !important`,
    color: `${theme.palette.table.headerText} !important`,
    fontSize: '0.75rem !important',
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: 0,
    whiteSpace: 'nowrap',
    borderBottom: 'none !important',
    borderRight: 0,
    boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.22)',
    '&:last-of-type': { boxShadow: 'none' },
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
    zIndex: 4,
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

  '& .col-numeric': {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },

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
      rules[`&& .MuiTableCell-head.col-frozen-${i}`] = { zIndex: 4, ...edge };
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
