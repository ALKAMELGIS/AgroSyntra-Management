import { useMemo } from 'react';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import { createAppTheme } from '../theme';

/**
 * Excel-style entry sheets are drawn with fixed paper colours (white cells, grey
 * gridlines, pastel status fills). In dark mode the surrounding theme would give
 * their labels and alerts light text on those light fills, so sheets render as a
 * light "paper document" island inside the dark app instead.
 */
export default function SheetSurface({ children }) {
  const outer = useTheme();
  const light = useMemo(
    () => (outer.palette.mode === 'dark' ? createAppTheme('light', outer.direction) : null),
    [outer.palette.mode, outer.direction],
  );
  if (!light) return children;
  return (
    <ThemeProvider theme={light}>
      <div style={{ background: light.palette.background.paper, color: light.palette.text.primary, borderRadius: 12, colorScheme: 'light' }}>
        {children}
      </div>
    </ThemeProvider>
  );
}
