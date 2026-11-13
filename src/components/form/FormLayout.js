import { Box, Paper, Tooltip, Typography } from '@mui/material';
import { InfoOutlined as InfoIcon } from '@mui/icons-material';

/**
 * Compact building blocks for data-entry forms.
 *
 *   <FormSection title="Where and when">
 *     <FormGrid columns={{ xs: 2, md: 4 }}>
 *       <TextField … />
 *       <TextField … sx={span({ xs: 2, md: 2 })} />
 *     </FormGrid>
 *   </FormSection>
 *
 * Sections are quiet outlined panels with one title line, so a form reads as a
 * few dense groups that use the full page width instead of tall cards with a
 * lonely field per row.
 */

const GAP = { xs: 3, md: 4 }; // theme spacing unit is 4px → 12 / 16px

export function FormSection({ title, action, children, sx, ...rest }) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label={typeof title === 'string' ? title : undefined}
      sx={{ p: { xs: 3, sm: 4 }, ...sx }}
      {...rest}
    >
      {(title || action) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, minHeight: 28 }}>
          {title && (
            <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.primary' }}>
              {title}
            </Typography>
          )}
          {action}
        </Box>
      )}
      {children}
    </Paper>
  );
}

/** Stack of FormSections with one consistent gap. */
export function FormStack({ children, sx }) {
  return <Box sx={{ display: 'grid', gap: GAP, ...sx }}>{children}</Box>;
}

const toTemplate = (n) => `repeat(${n}, minmax(0, 1fr))`;

/**
 * Grid of fields. `columns` is a number or a breakpoint map; children fill the
 * cells in reading order. Use `span()` on a child to widen it.
 */
export function FormGrid({ columns = { xs: 1, sm: 2, md: 4 }, stretchLast = false, children, sx }) {
  const cols = typeof columns === 'number'
    ? toTemplate(columns)
    : Object.fromEntries(Object.entries(columns).map(([bp, n]) => [bp, toTemplate(n)]));
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: cols,
        columnGap: GAP,
        rowGap: GAP,
        alignItems: 'start',
        '& > *': { minWidth: 0 },
        // On two-column phones an odd last field takes the whole row.
        ...(stretchLast ? { '& > :last-child:nth-child(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } } } : null),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** sx helper: `span(2)` or `span({ xs: 2, md: 1 })`; `span('all')` fills the row. */
export function span(n) {
  const one = (v) => (v === 'all' ? '1 / -1' : `span ${v}`);
  if (typeof n === 'object') {
    return { gridColumn: Object.fromEntries(Object.entries(n).map(([bp, v]) => [bp, one(v)])) };
  }
  return { gridColumn: one(n) };
}

/** Small muted label that starts a sub-group inside a FormGrid. */
export function GroupLabel({ children }) {
  return (
    <Typography
      component="h3"
      sx={{ gridColumn: '1 / -1', fontSize: '0.8125rem', fontWeight: 500, color: 'text.secondary', mt: 1 }}
    >
      {children}
    </Typography>
  );
}

/** Field label with an optional hint shown on hover/focus instead of always-on helper text. */
export function HintLabel({ children, hint }) {
  if (!hint) return children;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span>{children}</span>
      <Tooltip title={hint} arrow>
        <InfoIcon aria-label={typeof hint === 'string' ? hint : 'More information'} sx={{ fontSize: 14, color: 'text.secondary', cursor: 'help' }} />
      </Tooltip>
    </Box>
  );
}

/** sx for read-only calculated fields: muted fill, tabular figures. */
export const calcFieldSx = {
  '& .MuiOutlinedInput-root': { backgroundColor: 'action.hover' },
  '& .MuiInputBase-input': { fontVariantNumeric: 'tabular-nums' },
};

/** Footer row for Clear / Save, right aligned, full width on phones. */
export function FormActions({ children }) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        '& > .MuiButton-root': { flex: { xs: '1 1 0', sm: '0 0 auto' }, minWidth: { sm: 120 } },
      }}
    >
      {children}
    </Box>
  );
}
