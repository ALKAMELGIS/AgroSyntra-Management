import { createTheme, alpha } from '@mui/material/styles';

/*
 * AgroCloud design system — "calm field" edition.
 *
 * One deep-emerald accent on quiet neutral surfaces, near-black ink, generous
 * spacing and soft rounded geometry (inspired by modern agri-tech products such
 * as OneSoil, not copied). Every colour used by the UI comes from here; App.css
 * mirrors the same tokens as CSS variables (see `cssTokens`) so legacy CSS and
 * inline styles stay in sync in both light and dark mode.
 */

export const FONT_SANS =
  "'Inter', 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/**
 * Arabic interface font: IBM Plex Sans Arabic leads for everything on screen in
 * Arabic, including numbers and Latin words, so a mixed line keeps one typeface.
 * Inter stays as the fallback.
 */
export const FONT_SANS_AR =
  "'IBM Plex Sans Arabic', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

export const RADIUS = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
/** Widest the page content gets on very large screens (keeps tables and lines readable). */
export const PAGE_MAX_WIDTH = 1760;

const lightPalette = {
  primary: { main: '#1f7a4d', light: '#3a9a68', dark: '#165c3a', contrastText: '#ffffff' },
  secondary: { main: '#0f6f6a', light: '#2f8f89', dark: '#0a524e', contrastText: '#ffffff' },
  success: { main: '#1f7a4d', light: '#e3f1e8', dark: '#165c3a', contrastText: '#ffffff' },
  warning: { main: '#c4761a', light: '#fbefdc', dark: '#995a10', contrastText: '#ffffff' },
  error: { main: '#c23b2b', light: '#fbe5e1', dark: '#9a2c1f', contrastText: '#ffffff' },
  info: { main: '#2f6aa8', light: '#e3edf8', dark: '#22507f', contrastText: '#ffffff' },
  background: { default: '#f5f6f3', paper: '#ffffff', muted: '#eff1ed', elevated: '#ffffff' },
  text: { primary: '#121714', secondary: '#58625c', disabled: '#7c867f' },
  divider: '#e3e7e2',
  border: { subtle: '#e3e7e2', strong: '#cfd5cf' },
  action: {
    hover: 'rgba(18,23,20,0.04)',
    selected: 'rgba(31,122,77,0.08)',
    focus: 'rgba(31,122,77,0.14)',
  },
  // Spreadsheet-style data tables. Saturated colour stays at the edges (header,
  // gutter, totals) so body cells keep carrying semantic row colour.
  table: {
    headerBg: '#1d5a3c',
    headerText: '#ffffff',
    gutterBg: '#eceee9',
    gutterText: '#58625c',
    gridline: '#dde2dc',
    sectionBg: 'rgba(31,122,77,0.08)',
    sectionText: '#165c3a',
    totalBg: '#fbf1d9',
    totalText: '#6b4b06',
    selection: '#1f7a4d',
    selectionRange: 'rgba(31,122,77,0.06)',
    rowHover: '#f3f6f2',
    errorBg: '#fbe5e1',
    errorAccent: '#9a2c1f',
  },
};

const darkPalette = {
  primary: { main: '#4cb27e', light: '#74c99c', dark: '#2f8f5d', contrastText: '#06170e' },
  secondary: { main: '#45b3aa', light: '#6fcac2', dark: '#2a8d85', contrastText: '#041614' },
  success: { main: '#4cb27e', light: '#74c99c', dark: '#2f8f5d', contrastText: '#06170e' },
  warning: { main: '#e5a24f', light: '#f0c184', dark: '#c4761a', contrastText: '#2a1702' },
  error: { main: '#ef7d6d', light: '#f6a99e', dark: '#d6584a', contrastText: '#2b0905' },
  info: { main: '#6aa6e6', light: '#99c3f0', dark: '#3f82c8', contrastText: '#06182b' },
  background: { default: '#0c100e', paper: '#141a17', muted: '#1a211d', elevated: '#1b231f' },
  text: { primary: '#e9eee9', secondary: '#9ba79f', disabled: '#7f8a83' },
  divider: '#252d28',
  border: { subtle: '#252d28', strong: '#343e38' },
  action: {
    hover: 'rgba(233,238,233,0.05)',
    selected: 'rgba(76,178,126,0.14)',
    focus: 'rgba(76,178,126,0.2)',
  },
  // Header and gutter go darker than background.paper here, not lighter — that
  // inversion is what keeps them reading as chrome rather than as data.
  table: {
    headerBg: '#1d5a3c',
    headerText: '#ffffff',
    gutterBg: '#1a211d',
    gutterText: '#9ba79f',
    gridline: '#2a332d',
    sectionBg: 'rgba(76,178,126,0.14)',
    sectionText: '#74c99c',
    totalBg: 'rgba(229,162,79,0.14)',
    totalText: '#efd29e',
    selection: '#4cb27e',
    selectionRange: 'rgba(76,178,126,0.08)',
    rowHover: 'rgba(255,255,255,0.04)',
    errorBg: 'rgba(239,125,109,0.14)',
    errorAccent: '#f6a99e',
  },
};

/** CSS custom properties mirrored from the palette (consumed by App.css). */
export function cssTokens(mode = 'light') {
  const p = mode === 'dark' ? darkPalette : lightPalette;
  return {
    '--brand-green': p.primary.main,
    '--brand-green-dark': p.primary.dark,
    '--brand-green-soft': alpha(p.primary.main, mode === 'dark' ? 0.14 : 0.08),
    '--brand-green-faint': alpha(p.primary.main, 0.05),
    '--brand-orange': p.warning.main,
    '--brand-ink': p.text.primary,
    '--text-primary': p.text.primary,
    '--text-secondary': p.text.secondary,
    '--text-disabled': p.text.disabled,
    '--bg-page': p.background.default,
    '--bg-surface': p.background.paper,
    '--bg-muted': p.background.muted,
    '--border-subtle': p.border.subtle,
    '--border-hover': p.border.strong,
    '--focus-ring': alpha(p.primary.main, 0.35),
    '--shadow-soft': mode === 'dark' ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(16,24,20,0.04)',
    '--shadow-card': mode === 'dark' ? '0 1px 3px rgba(0,0,0,0.45)' : '0 1px 3px rgba(16,24,20,0.05), 0 1px 2px rgba(16,24,20,0.03)',
    '--shadow-pop': mode === 'dark' ? '0 16px 40px -12px rgba(0,0,0,0.7)' : '0 16px 40px -16px rgba(16,24,20,0.18)',
    '--radius-xl': `${RADIUS.xl}px`,
    '--radius-lg': `${RADIUS.lg}px`,
    '--radius-md': `${RADIUS.md}px`,
    '--radius-sm': `${RADIUS.sm}px`,
    '--font-sans': FONT_SANS,
    '--font-mono': FONT_MONO,
    '--error-main': mode === 'dark' ? '#ef7d6d' : '#c23b2b',
    '--ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
    // Excel-style entry sheets (SpreadsheetGrid, Harvest/Irrigation/Pivot sheets).
    ...(mode === 'dark'
      ? {
        '--sheet-bg': '#141a17',
        '--sheet-alt': '#171e1a',
        '--sheet-muted': '#1b231f',
        '--sheet-border': '#3b463f',
        '--sheet-grid': '#2b342f',
        '--sheet-ink': '#e9eee9',
        '--sheet-ink-2': '#b5c0b8',
        '--sheet-ink-3': '#8c978f',
        '--sheet-accent': '#74c99c',
        '--sheet-danger': '#f19a8d',
        '--sheet-select': 'rgba(76,178,126,0.18)',
        '--sheet-select-strong': 'rgba(76,178,126,0.30)',
        '--sheet-tint-blue': 'rgba(106,166,230,0.14)',
        '--sheet-tint-green': 'rgba(76,178,126,0.12)',
        '--sheet-tint-peach': 'rgba(229,162,79,0.14)',
        '--sheet-tint-yellow': 'rgba(229,190,79,0.14)',
        '--sheet-tint-lavender': 'rgba(160,140,210,0.16)',
      }
      : {
        '--sheet-bg': '#ffffff',
        '--sheet-alt': '#fafafa',
        '--sheet-muted': '#f2f3f0',
        '--sheet-border': '#b0b0b0',
        '--sheet-grid': '#d5d5d5',
        '--sheet-ink': '#111111',
        '--sheet-ink-2': '#555555',
        '--sheet-ink-3': '#767676',
        '--sheet-accent': '#1f7a4d',
        '--sheet-danger': '#c62828',
        '--sheet-select': '#d5e7d9',
        '--sheet-select-strong': '#c6dfcd',
        '--sheet-tint-blue': '#dbeef4',
        '--sheet-tint-green': '#ebf1de',
        '--sheet-tint-peach': '#fdeada',
        '--sheet-tint-yellow': '#fff8e1',
        '--sheet-tint-lavender': '#e6e0ec',
      }),
  };
}

export function createAppTheme(mode = 'light', direction = 'ltr') {
  const isDark = mode === 'dark';
  const palette = isDark ? darkPalette : lightPalette;
  const borderStrong = palette.border.strong;
  const hoverBg = palette.action.hover;
  const focusRing = `0 0 0 3px ${alpha(palette.primary.main, isDark ? 0.28 : 0.16)}`;
  const softShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4)'
    : '0 1px 2px rgba(16,24,20,0.04), 0 1px 1px rgba(16,24,20,0.02)';
  const popShadow = isDark
    ? '0 18px 48px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)'
    : '0 18px 48px -16px rgba(16,24,20,0.20), 0 2px 6px -2px rgba(16,24,20,0.06)';

  const base = createTheme({
    direction,
    palette: { mode, ...palette },
    breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
    typography: {
      fontFamily: direction === 'rtl' ? FONT_SANS_AR : FONT_SANS,
      htmlFontSize: 16,
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600,
      h1: { fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.032em', color: palette.text.primary },
      h2: { fontSize: '2rem', fontWeight: 600, lineHeight: 1.16, letterSpacing: '-0.028em', color: palette.text.primary },
      h3: { fontSize: '1.625rem', fontWeight: 600, lineHeight: 1.22, letterSpacing: '-0.024em', color: palette.text.primary },
      h4: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.022em', color: palette.text.primary },
      h5: { fontSize: '1.1875rem', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.014em', color: palette.text.primary },
      h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.45, letterSpacing: '-0.008em', color: palette.text.primary },
      subtitle1: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.5, letterSpacing: '-0.006em' },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.5, color: palette.text.secondary },
      body1: { fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.6, color: palette.text.primary },
      body2: { fontSize: '0.84375rem', fontWeight: 400, lineHeight: 1.55, color: palette.text.secondary },
      caption: { fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.5, color: palette.text.secondary, letterSpacing: '0.005em' },
      button: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5, textTransform: 'none', letterSpacing: '-0.003em' },
      overline: { fontSize: '0.6875rem', fontWeight: 600, lineHeight: 1.6, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.text.secondary },
    },
    spacing: 4,
    shape: { borderRadius: RADIUS.sm },
    shadows: [
      'none',
      softShadow,
      isDark ? '0 1px 3px rgba(0,0,0,0.45)' : '0 1px 3px rgba(16,24,20,0.05), 0 1px 2px rgba(16,24,20,0.03)',
      isDark ? '0 2px 6px rgba(0,0,0,0.45)' : '0 2px 6px -1px rgba(16,24,20,0.06)',
      isDark ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px -2px rgba(16,24,20,0.07)',
      isDark ? '0 6px 16px rgba(0,0,0,0.5)' : '0 6px 16px -4px rgba(16,24,20,0.08)',
      isDark ? '0 8px 24px rgba(0,0,0,0.55)' : '0 8px 24px -6px rgba(16,24,20,0.10)',
      isDark ? '0 12px 32px rgba(0,0,0,0.6)' : '0 12px 32px -8px rgba(16,24,20,0.12)',
      ...Array(17).fill(popShadow),
    ],
    transitions: {
      easing: { easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      duration: { shortest: 120, shorter: 160, short: 200, standard: 240, complex: 320 },
    },
  });

  const { breakpoints } = base;

  return createTheme(base, {
    typography: {
      h1: { [breakpoints.down('sm')]: { fontSize: '2rem' } },
      h2: { [breakpoints.down('sm')]: { fontSize: '1.625rem' } },
      h3: { [breakpoints.down('sm')]: { fontSize: '1.375rem' } },
      h4: { [breakpoints.down('sm')]: { fontSize: '1.25rem' } },
      h5: { [breakpoints.down('sm')]: { fontSize: '1.0625rem' } },
    },
    components: {
      // One page width for the whole app: the main area already has its own padding,
      // so containers add none; data pages (lg / xl) use the full content area up to
      // a comfortable cap on very wide screens; md stays for reading lists.
      MuiContainer: {
        defaultProps: { disableGutters: true },
        styleOverrides: {
          maxWidthLg: { [breakpoints.up('lg')]: { maxWidth: PAGE_MAX_WIDTH } },
          maxWidthXl: { [breakpoints.up('xl')]: { maxWidth: PAGE_MAX_WIDTH } },
          maxWidthMd: { [breakpoints.up('md')]: { maxWidth: 1040 } },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          ':root': cssTokens(mode),
          // Arabic: IBM Plex Sans Arabic for every text that reads var(--font-sans).
          'html[lang|="ar"]': { '--font-sans': FONT_SANS_AR },
          html: {
            scrollBehavior: 'smooth',
            colorScheme: mode,
            WebkitTextSizeAdjust: '100%',
            textRendering: 'optimizeLegibility',
          },
          body: {
            backgroundColor: palette.background.default,
            color: palette.text.primary,
            fontFeatureSettings: '"cv11", "ss01", "ss03"',
            fontVariantNumeric: 'tabular-nums',
            WebkitTapHighlightColor: 'transparent',
          },
          '::selection': { backgroundColor: alpha(palette.primary.main, isDark ? 0.35 : 0.18) },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },

      /* ---------- Buttons ---------- */
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.pill,
            padding: '8px 18px',
            minHeight: 38,
            fontWeight: 500,
            fontSize: '0.875rem',
            textTransform: 'none',
            whiteSpace: 'nowrap',
            transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
            '&:active': { transform: 'translateY(0.5px)' },
            '&.Mui-focusVisible': { boxShadow: focusRing },
            '&.Mui-disabled': { opacity: 0.55 },
          },
          sizeSmall: { padding: '5px 14px', minHeight: 32, fontSize: '0.8125rem' },
          sizeLarge: { padding: '11px 24px', minHeight: 46, fontSize: '0.9375rem' },
          contained: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            border: `1px solid ${palette.border.subtle}`,
            boxShadow: softShadow,
            '&:hover': { backgroundColor: palette.background.muted, borderColor: borderStrong, boxShadow: softShadow },
          },
          containedPrimary: {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
            border: '1px solid transparent',
            boxShadow: `0 1px 2px ${alpha(palette.primary.dark, 0.25)}, inset 0 1px 0 ${alpha('#ffffff', 0.12)}`,
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': { backgroundColor: palette.primary.dark, borderColor: 'transparent' },
          },
          containedSecondary: {
            backgroundColor: palette.secondary.main,
            color: palette.secondary.contrastText,
            border: '1px solid transparent',
            '&:hover': { backgroundColor: palette.secondary.dark, borderColor: 'transparent' },
          },
          containedError: {
            backgroundColor: palette.error.main,
            color: palette.error.contrastText,
            border: '1px solid transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': { backgroundColor: palette.error.dark, borderColor: 'transparent' },
          },
          containedWarning: {
            backgroundColor: palette.warning.main,
            color: palette.warning.contrastText,
            border: '1px solid transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': { backgroundColor: palette.warning.dark, borderColor: 'transparent' },
          },
          containedSuccess: {
            backgroundColor: palette.success.main,
            color: palette.success.contrastText,
            border: '1px solid transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': { backgroundColor: palette.success.dark, borderColor: 'transparent' },
          },
          containedInfo: {
            backgroundColor: palette.info.main,
            color: palette.info.contrastText,
            border: '1px solid transparent',
            '&:hover': { backgroundColor: palette.info.dark, borderColor: 'transparent' },
          },
          outlined: {
            borderColor: palette.border.subtle,
            color: palette.text.primary,
            backgroundColor: palette.background.paper,
            '&:hover': { borderColor: borderStrong, backgroundColor: palette.background.muted },
          },
          outlinedPrimary: {
            color: palette.primary.main,
            borderColor: alpha(palette.primary.main, 0.35),
            '&:hover': { borderColor: palette.primary.main, backgroundColor: alpha(palette.primary.main, 0.06) },
          },
          outlinedError: { color: palette.error.main, borderColor: alpha(palette.error.main, 0.4) },
          outlinedWarning: { color: palette.warning.dark, borderColor: alpha(palette.warning.main, 0.45) },
          text: {
            color: palette.text.secondary,
            padding: '8px 12px',
            '&:hover': { backgroundColor: hoverBg, color: palette.text.primary },
            '&.MuiButton-colorInherit, &.MuiButton-colorInherit:hover': { color: 'inherit' },
          },
          textPrimary: { color: palette.primary.main, '&:hover': { backgroundColor: alpha(palette.primary.main, 0.07), color: palette.primary.dark } },
          textError: { color: palette.error.main },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm + 2,
            color: palette.text.secondary,
            transition: 'background-color 160ms ease, color 160ms ease',
            '&:hover': { backgroundColor: hoverBg, color: palette.text.primary },
            '&.Mui-focusVisible': { boxShadow: focusRing },
          },
          sizeSmall: { padding: 6 },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { backgroundColor: palette.background.muted, borderRadius: RADIUS.pill, padding: 3, gap: 2 },
          grouped: {
            border: '0 !important',
            borderRadius: `${RADIUS.pill}px !important`,
            margin: '0 !important',
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          sizeSmall: { minHeight: 30 },
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8125rem',
            color: palette.text.secondary,
            padding: '6px 14px',
            '&.Mui-selected': {
              backgroundColor: palette.background.paper,
              color: palette.text.primary,
              boxShadow: softShadow,
              '&:hover': { backgroundColor: palette.background.paper },
            },
          },
        },
      },
      MuiFab: {
        styleOverrides: { root: { boxShadow: popShadow, textTransform: 'none' } },
      },

      /* ---------- Surfaces ---------- */
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none', borderRadius: RADIUS.lg },
          rounded: { borderRadius: RADIUS.lg },
          outlined: { borderColor: palette.border.subtle },
          elevation0: { boxShadow: 'none' },
          elevation1: { boxShadow: softShadow, border: `1px solid ${palette.border.subtle}` },
          elevation2: { boxShadow: softShadow, border: `1px solid ${palette.border.subtle}` },
          elevation3: { boxShadow: softShadow, border: `1px solid ${palette.border.subtle}` },
          elevation8: { boxShadow: popShadow, border: `1px solid ${palette.border.subtle}` },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.lg,
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.background.paper,
            boxShadow: softShadow,
            transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease',
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: 20,
            '&:last-child': { paddingBottom: 20 },
            [breakpoints.down('sm')]: { padding: 16, '&:last-child': { paddingBottom: 16 } },
          },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: { padding: '18px 20px 0' },
          title: { fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.01em' },
          subheader: { fontSize: '0.8125rem', color: palette.text.secondary },
        },
      },
      MuiCardActionArea: {
        styleOverrides: { focusHighlight: { backgroundColor: 'transparent' } },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${palette.border.subtle}`,
            borderRadius: RADIUS.md,
            '&:before': { display: 'none' },
            '&:not(:last-of-type)': { marginBottom: 8 },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: { root: { minHeight: 52, padding: '0 16px' }, content: { fontWeight: 600 } },
      },

      /* ---------- Inputs ---------- */
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiInputBase: {
        styleOverrides: {
          // Placeholder colour lives in App.css: a `::placeholder` rule here breaks the RTL
          // emotion cache (stylis prefixer expands it and crashes stylis-plugin-rtl).
          root: { fontSize: '0.9rem' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm + 2,
            backgroundColor: palette.background.paper,
            transition: 'box-shadow 160ms ease, border-color 160ms ease',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border.subtle, transition: 'border-color 160ms ease' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: borderStrong },
            '&.Mui-focused': { boxShadow: focusRing },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: palette.primary.main, borderWidth: 1 },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: palette.error.main },
            '&.Mui-disabled': { backgroundColor: palette.background.muted },
          },
          input: { padding: '11px 14px' },
          inputSizeSmall: { padding: '8px 12px' },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { color: palette.text.secondary, fontSize: '0.875rem', '&.Mui-focused': { color: palette.primary.main }, '&.Mui-disabled': { color: palette.text.secondary } },
          sizeSmall: { fontSize: '0.8125rem' },
        },
      },
      // Required marker: the asterisk MUI adds for `required`, in the error colour.
      MuiFormLabel: {
        styleOverrides: { asterisk: { color: palette.error.main, '&.Mui-error': { color: palette.error.main } } },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { fontSize: '0.75rem', marginLeft: 2, marginRight: 2, '&.Mui-disabled': { color: palette.text.secondary } } },
      },
      MuiSelect: {
        styleOverrides: { icon: { color: palette.text.secondary } },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: { borderRadius: RADIUS.md, boxShadow: popShadow, border: `1px solid ${palette.border.subtle}` },
          option: { fontSize: '0.875rem', borderRadius: RADIUS.xs, margin: '1px 6px' },
          listbox: { padding: 6 },
        },
      },
      MuiCheckbox: { styleOverrides: { root: { color: borderStrong, borderRadius: RADIUS.xs } } },
      MuiRadio: { styleOverrides: { root: { color: borderStrong } } },
      MuiSwitch: {
        styleOverrides: {
          root: { padding: 8 },
          track: { borderRadius: 11, opacity: 1, backgroundColor: isDark ? '#3a443e' : '#d3d9d3' },
          thumb: { boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
          switchBase: {
            '&.Mui-checked + .MuiSwitch-track': { opacity: 1, backgroundColor: palette.primary.main },
          },
        },
      },
      MuiSlider: { styleOverrides: { root: { color: palette.primary.main } } },

      /* ---------- Menus & overlays ---------- */
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: RADIUS.md,
            border: `1px solid ${palette.border.subtle}`,
            boxShadow: popShadow,
            marginTop: 4,
          },
          list: { padding: 6 },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { borderRadius: RADIUS.md, border: `1px solid ${palette.border.subtle}`, boxShadow: popShadow },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.xs + 1,
            fontSize: '0.875rem',
            minHeight: 36,
            padding: '7px 10px',
            gap: 6,
            '&:hover': { backgroundColor: hoverBg },
            '&.Mui-selected': {
              backgroundColor: alpha(palette.primary.main, isDark ? 0.16 : 0.08),
              color: isDark ? palette.primary.light : palette.primary.dark,
              fontWeight: 500,
              '&:hover': { backgroundColor: alpha(palette.primary.main, isDark ? 0.22 : 0.12) },
            },
            [breakpoints.down('sm')]: { minHeight: 44 },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: RADIUS.xl,
            border: `1px solid ${palette.border.subtle}`,
            boxShadow: popShadow,
            backgroundColor: palette.background.paper,
            [breakpoints.down('sm')]: { margin: 12, width: 'calc(100% - 24px)', maxHeight: 'calc(100% - 24px)' },
          },
          paperFullScreen: { borderRadius: 0, margin: 0, width: '100%', maxHeight: '100%' },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? 'rgba(4,7,5,0.66)' : 'rgba(18,23,20,0.32)',
            backdropFilter: 'blur(2px)',
            '&.MuiBackdrop-invisible': { backgroundColor: 'transparent', backdropFilter: 'none' },
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.015em', padding: '22px 24px 10px' } },
      },
      MuiDialogContent: { styleOverrides: { root: { padding: '10px 24px' } } },
      MuiDialogActions: {
        styleOverrides: { root: { padding: '14px 24px 20px', gap: 8, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: palette.background.paper,
            borderRight: `1px solid ${palette.border.subtle}`,
            borderLeft: 0,
            boxShadow: 'none',
            borderRadius: 0,
          },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 300 },
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#e9eee9' : '#121714',
            color: isDark ? '#121714' : '#f5f6f3',
            borderRadius: RADIUS.xs + 1,
            fontSize: '0.75rem',
            padding: '6px 10px',
            fontWeight: 500,
            boxShadow: popShadow,
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { borderRadius: RADIUS.md, boxShadow: popShadow } },
      },

      /* ---------- Navigation ---------- */
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: {
          root: {
            backgroundColor: alpha(palette.background.paper, isDark ? 0.8 : 0.82),
            backdropFilter: 'saturate(180%) blur(14px)',
            color: palette.text.primary,
            borderBottom: `1px solid ${palette.border.subtle}`,
            boxShadow: 'none',
            borderRadius: 0,
          },
        },
      },
      MuiTabs: {
        // Scroll instead of clipping when tabs outgrow narrow screens.
        defaultProps: { variant: 'scrollable', scrollButtons: 'auto', allowScrollButtonsMobile: true },
        styleOverrides: {
          root: { minHeight: 44 },
          indicator: { backgroundColor: palette.primary.main, height: 2, borderRadius: 2 },
          scrollButtons: { '&.Mui-disabled': { opacity: 0.25 } },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
            minHeight: 44,
            padding: '10px 16px',
            minWidth: 0,
            color: palette.text.secondary,
            letterSpacing: '-0.005em',
            transition: 'color 160ms ease',
            '&:hover': { color: palette.text.primary },
            '&.Mui-selected': { color: palette.text.primary, fontWeight: 600 },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm + 2,
            '&:hover': { backgroundColor: hoverBg },
            '&.Mui-selected': {
              backgroundColor: alpha(palette.primary.main, isDark ? 0.14 : 0.08),
              '&:hover': { backgroundColor: alpha(palette.primary.main, isDark ? 0.2 : 0.12) },
            },
          },
        },
      },
      MuiListItemIcon: { styleOverrides: { root: { color: palette.text.secondary, minWidth: 34 } } },
      MuiBreadcrumbs: {
        styleOverrides: { root: { fontSize: '0.8125rem' }, separator: { color: palette.text.disabled } },
      },
      MuiPaginationItem: {
        styleOverrides: { root: { borderRadius: RADIUS.sm, fontWeight: 500 } },
      },
      MuiStepIcon: {
        styleOverrides: { root: { '&.Mui-completed, &.Mui-active': { color: palette.primary.main } } },
      },
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { color: palette.primary.main, fontWeight: 500 } },
      },

      /* ---------- Data display ---------- */
      MuiTableContainer: {
        // Scrollable regions must be keyboard-reachable (WCAG 2.1.1 / axe scrollable-region-focusable).
        defaultProps: { tabIndex: 0 },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            maxWidth: '100%',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 600,
              fontSize: '0.71875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: palette.text.secondary,
              backgroundColor: palette.background.muted,
              borderBottom: `1px solid ${palette.border.subtle}`,
              padding: '11px 16px',
              // Long titles wrap to a second line rather than widening the column.
              whiteSpace: 'normal',
              minWidth: 88,
              lineHeight: 1.35,
              verticalAlign: 'bottom',
              '&:empty, &.MuiTableCell-paddingCheckbox': { minWidth: 0 },
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 120ms ease',
            '&.MuiTableRow-hover:hover': { backgroundColor: palette.table.rowHover },
            '&:last-child td': { borderBottom: 0 },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { padding: '12px 16px', fontSize: '0.84375rem', borderBottom: `1px solid ${palette.border.subtle}` },
          sizeSmall: { padding: '8px 12px' },
          stickyHeader: { backgroundColor: palette.background.muted },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: { borderTop: `1px solid ${palette.border.subtle}` },
          toolbar: { minHeight: 52, flexWrap: 'wrap' },
          selectLabel: { fontSize: '0.8125rem' },
          displayedRows: { fontSize: '0.8125rem' },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, fontSize: '0.75rem', borderRadius: RADIUS.pill, height: 26, letterSpacing: '0.005em' },
          sizeSmall: { height: 22, fontSize: '0.71875rem' },
          label: { paddingLeft: 10, paddingRight: 10 },
          labelSmall: { paddingLeft: 8, paddingRight: 8 },
          filled: { border: 'none' },
          outlined: { borderColor: palette.border.subtle, backgroundColor: palette.background.paper },
          colorDefault: { backgroundColor: palette.background.muted, color: palette.text.primary },
          // Amber is the one status hue that fails 4.5:1 at chip size; use its deeper shade.
          outlinedWarning: { color: isDark ? palette.warning.light : palette.warning.dark, borderColor: alpha(palette.warning.main, 0.5) },
          filledWarning: { backgroundColor: isDark ? palette.warning.main : palette.warning.dark, color: isDark ? palette.warning.contrastText : '#fff' },
        },
      },
      MuiBadge: {
        styleOverrides: { badge: { fontWeight: 600, fontSize: '0.65rem', minWidth: 18, height: 18, padding: '0 5px' } },
      },
      MuiAvatar: {
        styleOverrides: { root: { fontWeight: 600, fontSize: '0.875rem' } },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: RADIUS.md, fontSize: '0.84375rem', border: '1px solid', alignItems: 'flex-start', padding: '8px 14px' },
          icon: { opacity: 0.9, padding: '8px 0' },
          message: { padding: '8px 0' },
          standardSuccess: { backgroundColor: isDark ? alpha('#4cb27e', 0.1) : '#f1f8f3', borderColor: isDark ? alpha('#4cb27e', 0.25) : '#cfe6d7', color: isDark ? '#9bdab8' : '#14532f' },
          standardError: { backgroundColor: isDark ? alpha('#ef7d6d', 0.1) : '#fdf3f1', borderColor: isDark ? alpha('#ef7d6d', 0.28) : '#f3cfc8', color: isDark ? '#f6b2a8' : '#8a2418' },
          standardWarning: { backgroundColor: isDark ? alpha('#e5a24f', 0.1) : '#fdf7ec', borderColor: isDark ? alpha('#e5a24f', 0.28) : '#f0dcb5', color: isDark ? '#f0c88e' : '#7a4808' },
          standardInfo: { backgroundColor: isDark ? alpha('#6aa6e6', 0.1) : '#f2f6fc', borderColor: isDark ? alpha('#6aa6e6', 0.28) : '#cddcf0', color: isDark ? '#a9cbf2' : '#1d4670' },
          filled: { border: 0 },
          // Filled alerts carry white text; use the deeper shade so it stays ≥ 4.5:1.
          filledWarning: { backgroundColor: isDark ? '#8a5310' : palette.warning.dark, color: '#fff' },
          filledSuccess: { backgroundColor: isDark ? '#1f6b45' : palette.success.dark, color: '#fff' },
          filledError: { backgroundColor: isDark ? '#a8382a' : palette.error.dark, color: '#fff' },
          filledInfo: { backgroundColor: isDark ? '#2c5f95' : palette.info.dark, color: '#fff' },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: palette.border.subtle } } },
      MuiLinearProgress: {
        defaultProps: { 'aria-label': 'Progress' },
        styleOverrides: {
          root: { borderRadius: 4, height: 4, backgroundColor: alpha(palette.primary.main, 0.12) },
          bar: { borderRadius: 4 },
        },
      },
      MuiCircularProgress: { defaultProps: { thickness: 4, 'aria-label': 'Loading' } },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { root: { borderRadius: RADIUS.sm, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,23,20,0.06)' } },
      },
      MuiSvgIcon: { styleOverrides: { fontSizeSmall: { fontSize: '1.125rem' } } },
    },
  });
}

const theme = createAppTheme('light');
export default theme;
