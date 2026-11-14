export const GRID_BORDER = '1px solid var(--sheet-border, #BDBDBD)';
export // Unified with the app font (theme FONT_SANS via CSS variable).
const FONT = 'var(--font-sans, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif)';
export const HEADER_FILL = 'var(--grid-head-bg, #f3f5f2)';
export const TOTAL_ROW_BG = 'var(--sheet-select, #C8E6C9)';

export const hCell = {
  fontFamily: FONT,
  fontWeight: 700,
  fontSize: '11px',
  whiteSpace: 'nowrap',
  border: GRID_BORDER,
  backgroundColor: HEADER_FILL,
  py: 0.5,
  px: 1,
};

export const dCell = {
  fontFamily: FONT,
  fontSize: '11px',
  border: GRID_BORDER,
  py: 0.25,
  px: 0.75,
};

export const tableSx = {
  borderCollapse: 'collapse',
  fontFamily: FONT,
  '& td, & th': { border: GRID_BORDER },
};
