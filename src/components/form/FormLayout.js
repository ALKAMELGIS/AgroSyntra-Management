import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Tooltip, Typography } from '@mui/material';
import { InfoOutlined as InfoIcon, ArrowForwardRounded as NextIcon, ArrowBackRounded as BackIcon, CheckRounded as DoneIcon } from '@mui/icons-material';
import { getIn, useFormikContext } from 'formik';

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

/**
 * One step of a FormSteps wizard. `label` names it in the step bar; `fields`
 * lists the Formik names checked before Next (prefixes work: 'valve1' covers
 * every valve1.* field).
 */
export function FormStep({ children }) {
  return <>{children}</>;
}

const hasError = (errors, name) => {
  const e = getIn(errors, name);
  return !!e && (typeof e === 'string' || Object.keys(e).length > 0);
};
const touchAll = (setFieldTouched, errors, name) => {
  const e = getIn(errors, name);
  if (e && typeof e === 'object') Object.keys(e).forEach((k) => touchAll(setFieldTouched, errors, `${name}.${k}`));
  else setFieldTouched(name, true, false);
};

/**
 * Long entry forms as short steps: a step bar, one step on screen, Back / Next,
 * and the step's own Save on the last one. Must sit inside a Formik form.
 *
 *   <FormSteps>
 *     <FormStep label="Reading" fields={['date', 'site', 'field']}>…</FormStep>
 *     <FormStep label="Valves" fields={['valve1']}>…</FormStep>
 *     <FormStep label="Summary">… <FormActions>…Save…</FormActions></FormStep>
 *   </FormSteps>
 *
 * Next checks only the current step's fields. Enter in a field moves to the next
 * step instead of submitting. A failed save opens the first step with an error.
 * Steps stay mounted (hidden), so nothing typed is lost when moving between them.
 */
export function FormSteps({ children, sx }) {
  const steps = Children.toArray(children).filter(isValidElement);
  const formik = useFormikContext();
  const [active, setActive] = useState(0);
  const topRef = useRef(null);
  const last = steps.length - 1;

  // Yup checks every field; the browser's own check would stop on required
  // inputs that sit in a hidden step and say nothing.
  useEffect(() => { topRef.current?.closest('form')?.setAttribute('novalidate', ''); }, []);

  const focusTop = () => {
    const el = topRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const go = async (to) => {
    if (to > active && formik) {
      const errors = await formik.validateForm();
      for (let i = active; i < to; i += 1) {
        const bad = (steps[i].props.fields || []).filter((n) => hasError(errors, n));
        if (bad.length) {
          bad.forEach((n) => touchAll(formik.setFieldTouched, errors, n));
          setActive(i);
          focusTop();
          return;
        }
      }
    }
    setActive(Math.max(0, Math.min(last, to)));
    focusTop();
  };

  // A save that failed validation: open the first step that holds an error.
  const submitCount = formik?.submitCount || 0;
  // After a successful save the form is reset (submitCount back to 0): start again at step 1.
  const prevSubmits = useRef(0);
  useEffect(() => {
    if (prevSubmits.current > 0 && submitCount === 0) setActive(0);
    prevSubmits.current = submitCount;
  }, [submitCount]);
  useEffect(() => {
    if (!submitCount || !formik) return;
    const idx = steps.findIndex((st) => (st.props.fields || []).some((n) => hasError(formik.errors, n)));
    if (idx >= 0 && idx !== active) setActive(idx);
  }, [submitCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || active === last) return;
    const t = e.target;
    if (t?.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio'].includes(t.type)) {
      e.preventDefault();
      go(active + 1);
    }
  };

  return (
    <Box ref={topRef} sx={{ display: 'grid', gap: GAP, scrollMarginTop: 72, ...sx }} onKeyDown={onKeyDown}>
      <Box component="nav" aria-label="Form steps">
        <Box
          component="ol"
          sx={{
            listStyle: 'none', m: 0, p: 0, display: 'grid',
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            border: 1, borderColor: 'divider', bgcolor: 'background.paper',
          }}
        >
          {steps.map((st, i) => {
            const state = i === active ? 'current' : i < active ? 'done' : 'todo';
            return (
              <Box component="li" key={st.key || i} sx={{ minWidth: 0, '& + &': { borderInlineStart: 1, borderColor: 'divider' } }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => go(i)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  sx={{
                    all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
                    display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, sm: 3 }, minHeight: 44,
                    fontSize: '0.8125rem', fontWeight: state === 'current' ? 600 : 500,
                    color: state === 'todo' ? 'text.secondary' : 'text.primary',
                    bgcolor: state === 'current' ? 'action.selected' : 'transparent',
                    boxShadow: state === 'current' ? (t) => `inset 0 -2px 0 ${t.palette.primary.main}` : 'none',
                    '&:hover': { bgcolor: state === 'current' ? 'action.selected' : 'action.hover' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  }}
                >
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      flexShrink: 0, width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      bgcolor: state === 'todo' ? 'transparent' : 'primary.main',
                      color: state === 'todo' ? 'text.secondary' : 'primary.contrastText',
                      border: 1, borderColor: state === 'todo' ? 'divider' : 'primary.main',
                    }}
                  >
                    {state === 'done' ? <DoneIcon sx={{ fontSize: 14 }} /> : i + 1}
                  </Box>
                  {/* Phones show the name of the current step only; the others keep their number. */}
                  <Box
                    component="span"
                    sx={{
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: { xs: state === 'current' ? 'inline' : 'none', sm: 'inline' },
                    }}
                  >
                    {st.props.label}
                  </Box>
                  <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    {`, step ${i + 1} of ${steps.length}`}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {steps.map((st, i) => (
        <Box key={st.key || i} role="group" aria-label={typeof st.props.label === 'string' ? st.props.label : undefined} hidden={i !== active} sx={{ display: i === active ? 'grid' : 'none', gap: GAP }}>
          {st}
        </Box>
      ))}

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<BackIcon sx={{ transform: (t) => (t.direction === 'rtl' ? 'scaleX(-1)' : 'none') }} />}
          onClick={() => go(active - 1)}
          disabled={active === 0}
          sx={{ visibility: active === 0 ? 'hidden' : 'visible', minWidth: 120 }}
        >
          Back
        </Button>
        {active < last && (
          <Button
            variant="contained"
            endIcon={<NextIcon sx={{ transform: (t) => (t.direction === 'rtl' ? 'scaleX(-1)' : 'none') }} />}
            onClick={() => go(active + 1)}
            sx={{ minWidth: 120 }}
          >
            Next
          </Button>
        )}
      </Box>
    </Box>
  );
}
