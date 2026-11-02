import { createTheme } from '@mui/material/styles';

const lightPalette = {
  primary: {
    main: '#3d7c4f',
    light: '#5a9e6b',
    dark: '#2d6a3f',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#6366f1',
    light: '#818cf8',
    dark: '#4f46e5',
    contrastText: '#ffffff',
  },
  success: {
    main: '#3d7c4f',
    light: '#d4edda',
    dark: '#2d6a3f',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#e8913a',
    light: '#fef3cd',
    dark: '#c6772e',
    contrastText: '#ffffff',
  },
  error: {
    main: '#dc3545',
    light: '#f8d7da',
    dark: '#b02a37',
    contrastText: '#ffffff',
  },
  info: {
    main: '#3b82f6',
    light: '#dbeafe',
    dark: '#2563eb',
    contrastText: '#ffffff',
  },
  background: {
    default: '#faf8f5',
    paper: '#ffffff',
  },
  text: {
    primary: '#1a1a1a',
    secondary: '#6b7280',
    disabled: '#9ca3af',
  },
  divider: '#e8e5e0',
  // Spreadsheet-style data tables. Saturated colour stays at the edges (header,
  // gutter, totals) so body cells keep carrying semantic row colour.
  table: {
    headerBg: '#3d7c4f',
    headerText: '#ffffff',
    gutterBg: '#e9e5e0',
    gutterText: '#6b7280',
    gridline: '#dcd8d2',
    sectionBg: 'rgba(61,124,79,0.10)',
    sectionText: '#2d6a3f',
    totalBg: '#fef3cd',
    totalText: '#7a5a00',
    selection: '#3d7c4f',
    selectionRange: 'rgba(61,124,79,0.06)',
    rowHover: '#f0ede8',
    errorBg: '#f8d7da',
    errorAccent: '#b02a37',
  },
};

const darkPalette = {
  primary: {
    main: '#5a9e6b',
    light: '#7dc08d',
    dark: '#3d7c4f',
    contrastText: '#052e16',
  },
  secondary: {
    main: '#818cf8',
    light: '#a5b4fc',
    dark: '#6366f1',
    contrastText: '#1e1b4b',
  },
  success: {
    main: '#5a9e6b',
    light: '#7dc08d',
    dark: '#3d7c4f',
    contrastText: '#052e16',
  },
  warning: {
    main: '#f0a858',
    light: '#f5c78a',
    dark: '#e8913a',
    contrastText: '#451a03',
  },
  error: {
    main: '#f87171',
    light: '#fca5a5',
    dark: '#ef4444',
    contrastText: '#450a0a',
  },
  info: {
    main: '#60a5fa',
    light: '#93bbfd',
    dark: '#3b82f6',
    contrastText: '#1e3a5f',
  },
  background: {
    default: '#1a1714',
    paper: '#262320',
  },
  text: {
    primary: '#f5f0eb',
    secondary: '#a8a29e',
    disabled: '#78716c',
  },
  divider: '#3d3a36',
  // Header and gutter go darker than background.paper here, not lighter — that
  // inversion is what keeps them reading as chrome rather than as data.
  table: {
    headerBg: '#3d7c4f',
    headerText: '#ffffff',
    gutterBg: '#332f2b',
    gutterText: '#a8a29e',
    gridline: '#413d38',
    sectionBg: 'rgba(90,158,107,0.16)',
    sectionText: '#7dc08d',
    totalBg: 'rgba(254,243,205,0.14)',
    totalText: '#e8d9a8',
    selection: '#5a9e6b',
    selectionRange: 'rgba(90,158,107,0.08)',
    rowHover: 'rgba(255,255,255,0.05)',
    errorBg: 'rgba(248,215,218,0.14)',
    errorAccent: '#fca5a5',
  },
};

export function createAppTheme(mode = 'light', direction = 'ltr') {
  const isDark = mode === 'dark';
  const palette = isDark ? darkPalette : lightPalette;

  return createTheme({
    direction,
    palette: { mode, ...palette },
    typography: {
      fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.025em', color: palette.text.primary },
      h2: { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.025em', color: palette.text.primary },
      h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.02em', color: palette.text.primary },
      h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.015em', color: palette.text.primary },
      h5: { fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.01em', color: palette.text.primary },
      h6: { fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.5, color: palette.text.primary },
      body1: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.6, color: palette.text.primary },
      body2: { fontSize: '0.8125rem', fontWeight: 400, lineHeight: 1.55, color: palette.text.secondary },
      caption: { fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.5, color: palette.text.secondary, letterSpacing: '0.01em' },
      button: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.75, textTransform: 'none' },
      overline: { fontSize: '0.6875rem', fontWeight: 600, lineHeight: 1.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: palette.text.secondary },
    },
    spacing: 4,
    shape: { borderRadius: 8 },
    shadows: [
      'none',
      '0 1px 2px 0 rgba(0,0,0,0.04)',
      '0 1px 3px 0 rgba(0,0,0,0.05)',
      '0 2px 4px -1px rgba(0,0,0,0.05)',
      '0 4px 6px -2px rgba(0,0,0,0.04)',
      '0 6px 8px -2px rgba(0,0,0,0.05)',
      '0 8px 16px -4px rgba(0,0,0,0.06)',
      '0 12px 24px -6px rgba(0,0,0,0.08)',
      ...Array(17).fill('0 12px 24px -6px rgba(0,0,0,0.08)'),
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { scrollBehavior: 'smooth' },
          '::selection': {
            backgroundColor: isDark ? 'rgba(90,158,107,0.3)' : 'rgba(61,124,79,0.15)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 500,
            fontSize: '0.8125rem',
            textTransform: 'none',
            transition: 'all 150ms ease',
          },
          contained: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            border: '1px solid',
            borderColor: palette.divider,
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f3f0',
              borderColor: isDark ? '#57534e' : '#d6d3ce',
              boxShadow: 'none',
            },
          },
          containedPrimary: {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
            borderColor: 'transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': {
              backgroundColor: palette.primary.dark,
              borderColor: 'transparent',
            },
          },
          containedError: {
            backgroundColor: palette.error.main,
            color: '#fff',
            borderColor: 'transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': {
              backgroundColor: palette.error.dark,
              borderColor: 'transparent',
            },
          },
          containedWarning: {
            backgroundColor: palette.warning.main,
            color: '#fff',
            borderColor: 'transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': {
              backgroundColor: palette.warning.dark,
              borderColor: 'transparent',
            },
          },
          containedSuccess: {
            backgroundColor: palette.success.main,
            color: '#fff',
            borderColor: 'transparent',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { color: 'inherit' },
            '&:hover': {
              backgroundColor: palette.success.dark,
              borderColor: 'transparent',
            },
          },
          outlined: {
            borderColor: palette.divider,
            color: palette.text.primary,
            '&:hover': {
              borderColor: isDark ? '#57534e' : '#d6d3ce',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f3f0',
            },
          },
          text: {
            color: palette.text.secondary,
            '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f3f0' },
          },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${palette.divider}`,
            boxShadow: 'none',
            transition: 'border-color 150ms ease',
            '&:hover': { borderColor: isDark ? '#57534e' : '#d6d3ce' },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: 12, backgroundImage: 'none' },
          elevation0: { boxShadow: 'none' },
          elevation1: { boxShadow: '0 1px 2px 0 rgba(0,0,0,0.04)', border: `1px solid ${palette.divider}` },
          elevation2: { boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)', border: `1px solid ${palette.divider}` },
          elevation3: { boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05)', border: `1px solid ${palette.divider}` },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              fontSize: '0.875rem',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.divider },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#57534e' : '#d6d3ce' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: palette.primary.main,
                borderWidth: '1.5px',
              },
              '&.Mui-focused': { boxShadow: `0 0 0 3px ${isDark ? 'rgba(90,158,107,0.15)' : 'rgba(61,124,79,0.1)'}` },
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 600,
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: palette.text.secondary,
              backgroundColor: isDark ? '#262320' : '#f5f3f0',
              borderBottom: `1px solid ${palette.divider}`,
              padding: '10px 16px',
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#faf8f5' },
            '&:last-child td': { borderBottom: 0 },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            padding: '12px 16px',
            fontSize: '0.8125rem',
            borderBottom: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, fontSize: '0.75rem', borderRadius: 6, height: 24 },
          filled: { border: 'none' },
          outlined: { borderColor: palette.divider },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#262320' : '#ffffff',
            color: palette.text.primary,
            borderBottom: `1px solid ${palette.divider}`,
            boxShadow: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#1a1714' : '#ffffff',
            borderRight: `1px solid ${palette.divider}`,
            boxShadow: 'none',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8, fontSize: '0.8125rem', border: '1px solid' },
          standardSuccess: { backgroundColor: isDark ? 'rgba(90,158,107,0.1)' : '#f0f9f2', borderColor: isDark ? '#2d6a3f' : '#d4edda', color: isDark ? '#7dc08d' : '#2d6a3f' },
          standardError: { backgroundColor: isDark ? 'rgba(248,113,113,0.1)' : '#fef2f2', borderColor: isDark ? '#991b1b' : '#f8d7da', color: isDark ? '#fca5a5' : '#b02a37' },
          standardWarning: { backgroundColor: isDark ? 'rgba(240,168,88,0.1)' : '#fff8f0', borderColor: isDark ? '#92400e' : '#fef3cd', color: isDark ? '#f0a858' : '#92400e' },
          standardInfo: { backgroundColor: isDark ? 'rgba(96,165,250,0.1)' : '#eff6ff', borderColor: isDark ? '#1e40af' : '#bfdbfe', color: isDark ? '#93c5fd' : '#1e40af' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16, border: `1px solid ${palette.divider}` },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? '#3d3a36' : '#1a1a1a',
            color: '#f5f0eb',
            borderRadius: 6,
            fontSize: '0.75rem',
            padding: '6px 10px',
            fontWeight: 500,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: palette.primary.main, height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8125rem',
            color: palette.text.secondary,
            '&.Mui-selected': { color: palette.primary.main, fontWeight: 600 },
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: palette.divider } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 4, height: 4 } },
      },
      MuiSkeleton: {
        styleOverrides: { root: { borderRadius: 8 } },
      },
      MuiSelect: {
        styleOverrides: {
          outlined: { fontSize: '0.875rem' },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.Mui-selected': {
              backgroundColor: isDark ? 'rgba(90,158,107,0.1)' : 'rgba(61,124,79,0.08)',
              '&:hover': { backgroundColor: isDark ? 'rgba(90,158,107,0.15)' : 'rgba(61,124,79,0.12)' },
            },
          },
        },
      },
    },
  });
}

const theme = createAppTheme('light');
export default theme;
