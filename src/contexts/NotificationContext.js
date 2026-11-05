import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Snackbar, Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import {
  CheckCircleOutlineRounded as SuccessIcon,
  ErrorOutlineRounded as ErrorIcon,
  WarningAmberRounded as WarningIcon,
  InfoOutlined as InfoIcon,
  CloseRounded as CloseIcon,
} from '@mui/icons-material';

const NotificationContext = createContext(null);

/** Errors and warnings stay long enough to be read; the timer pauses on hover / focus. */
const DURATION = { success: 4000, info: 5000, warning: 7000, error: 9000 };
const ICONS = { success: SuccessIcon, info: InfoIcon, warning: WarningIcon, error: ErrorIcon };

/**
 * Global notification provider – replaces per-page Snackbar boilerplate.
 *
 * Usage:
 *   const notify = useNotification();
 *   notify.success('Saved!');
 *   notify.error('Something went wrong');
 *   notify.warning('Check your input');
 *   notify.info('Processing…');
 *
 * Messages are queued strictly in order (none are dropped when several fire at
 * once). Toasts sit at the bottom inline-end corner (mirrors in Arabic) and
 * centred on phones, above the phone navigation bar.
 */
export function NotificationProvider({ children }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [queue, setQueue] = useState([]); // queue[0] is the toast on screen
  const [open, setOpen] = useState(true);

  const current = queue[0] || null;

  const enqueue = useCallback((message, severity = 'success') => {
    if (message == null || message === '') return;
    const sev = ICONS[severity] ? severity : 'info';
    setQueue((prev) => {
      // Collapse an identical message that is already waiting (e.g. double clicks).
      if (prev.some((p, i) => i > 0 && p.message === message && p.severity === sev)) return prev;
      return [...prev, { message, severity: sev, key: `${Date.now()}-${Math.random()}` }];
    });
  }, []);

  const handleClose = useCallback((_event, reason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  }, []);

  const handleExited = useCallback(() => {
    setQueue((prev) => prev.slice(1));
    setOpen(true);
  }, []);

  const notify = useMemo(() => ({
    success: (message) => enqueue(message, 'success'),
    error: (message) => enqueue(message, 'error'),
    warning: (message) => enqueue(message, 'warning'),
    info: (message) => enqueue(message, 'info'),
    show: (message, severity) => enqueue(message, severity),
  }), [enqueue]);

  // 'right' is mirrored to the left by the RTL style plugin, i.e. always the inline-end corner.
  const horizontal = isPhone ? 'center' : 'right';
  const Icon = current ? ICONS[current.severity] : null;
  const tone = current ? theme.palette[current.severity] : null;

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <Snackbar
        key={current?.key}
        open={Boolean(current) && open}
        autoHideDuration={current ? DURATION[current.severity] : null}
        onClose={handleClose}
        TransitionProps={{ onExited: handleExited }}
        anchorOrigin={{ vertical: 'bottom', horizontal }}
        sx={{ '@media (max-width: 599.95px)': { left: 12, right: 12 } }}
      >
        {current ? (
          <Box
            role={current.severity === 'error' || current.severity === 'warning' ? 'alert' : 'status'}
            aria-live={current.severity === 'error' ? 'assertive' : 'polite'}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 2.5,
              width: { xs: '100%', sm: 'auto' },
              minWidth: { sm: 320 },
              maxWidth: { sm: 440 },
              py: 2.5,
              pl: 3.5,
              pr: 1.5,
              borderRadius: 3,
              bgcolor: 'background.paper',
              color: 'text.primary',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: theme.shadows[8],
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha(tone.main, theme.palette.mode === 'dark' ? 0.18 : 0.1),
                color: theme.palette.mode === 'dark' ? tone.light : tone.dark,
              }}
            >
              <Icon sx={{ fontSize: 18 }} />
            </Box>
            <Typography sx={{ flex: 1, fontSize: '0.875rem', lineHeight: 1.5, pt: 0.5, color: 'text.primary', wordBreak: 'break-word' }}>
              {current.message}
            </Typography>
            <IconButton size="small" onClick={handleClose} aria-label="Close notification" sx={{ mt: -0.25 }}>
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        ) : undefined}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
