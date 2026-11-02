import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import rtlPlugin from 'stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { createAppTheme } from '../theme';
import i18n from '../i18n';

const ThemeContext = createContext(null);

const THEME_KEY = 'almaha_theme_mode';

// Emotion caches for LTR and RTL
const ltrCache = createCache({ key: 'mui' });
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });

/**
 * ThemeProvider that supports light/dark/system modes AND RTL.
 * Wraps MUI ThemeProvider and persists preference to localStorage.
 */
export function AppThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored || 'light';
  });

  const [direction, setDirection] = useState(() => (i18n.language === 'ar' ? 'rtl' : 'ltr'));

  // Sync direction when language changes
  useEffect(() => {
    const handleLangChange = (lng) => {
      const dir = lng === 'ar' ? 'rtl' : 'ltr';
      setDirection(dir);
      document.documentElement.dir = dir;
      document.documentElement.lang = lng;
    };
    // Set initial
    handleLangChange(i18n.language);
    i18n.on('languageChanged', handleLangChange);
    return () => i18n.off('languageChanged', handleLangChange);
  }, []);

  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Follow OS theme changes live (used when mode === 'system').
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedMode = useMemo(() => {
    if (mode === 'system') {
      return prefersDark ? 'dark' : 'light';
    }
    return mode;
  }, [mode, prefersDark]);

  // Expose the resolved mode to plain CSS (html[data-theme]) and the browser UI.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedMode);
    document.documentElement.style.colorScheme = resolvedMode;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', resolvedMode === 'dark' ? '#0c100e' : '#f5f6f3');
    });
  }, [resolvedMode]);

  const theme = useMemo(
    () => createAppTheme(resolvedMode, direction),
    [resolvedMode, direction]
  );

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light';
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const setThemeMode = useCallback((newMode) => {
    setMode(newMode);
    localStorage.setItem(THEME_KEY, newMode);
  }, []);

  const value = useMemo(
    () => ({ mode, resolvedMode, direction, toggleTheme, setThemeMode }),
    [mode, resolvedMode, direction, toggleTheme, setThemeMode]
  );

  const cache = direction === 'rtl' ? rtlCache : ltrCache;

  return (
    <ThemeContext.Provider value={value}>
      <CacheProvider value={cache}>
        <MuiThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within an AppThemeProvider');
  }
  return context;
}

export default ThemeContext;
