import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Snackbar, Alert } from '@mui/material';

const NotificationContext = createContext(null);

/**
 * Global notification provider – replaces per-page Snackbar boilerplate.
 *
 * Usage:
 *   const notify = useNotification();
 *   notify.success('Saved!');
 *   notify.error('Something went wrong');
 *   notify.warning('Check your input');
 *   notify.info('Processing…');
 */
export function NotificationProvider({ children }) {
  const [queue, setQueue] = useState([]);      // queued messages
  const [current, setCurrent] = useState(null); // currently shown
  const [open, setOpen] = useState(false);

  const showNext = useCallback((q) => {
    if (q.length > 0) {
      setCurrent(q[0]);
      setOpen(true);
      setQueue(q.slice(1));
    }
  }, []);

  const enqueue = useCallback((message, severity = 'success') => {
    const item = { message, severity, key: Date.now() + Math.random() };
    setQueue((prev) => {
      if (!open) {
        // Show immediately if nothing is showing
        setCurrent(item);
        setOpen(true);
        return prev;
      }
      return [...prev, item];
    });
  }, [open]);

  const handleClose = useCallback((_event, reason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  }, []);

  const handleExited = useCallback(() => {
    setCurrent(null);
    setQueue((prev) => {
      if (prev.length > 0) {
        setCurrent(prev[0]);
        setOpen(true);
        return prev.slice(1);
      }
      return prev;
    });
  }, []);

  const notify = useMemo(() => ({
    success: (message) => enqueue(message, 'success'),
    error: (message) => enqueue(message, 'error'),
    warning: (message) => enqueue(message, 'warning'),
    info: (message) => enqueue(message, 'info'),
    show: (message, severity) => enqueue(message, severity),
  }), [enqueue]);

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <Snackbar
        key={current?.key}
        open={open}
        autoHideDuration={4000}
        onClose={handleClose}
        TransitionProps={{ onExited: handleExited }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {current ? (
          <Alert
            onClose={handleClose}
            severity={current.severity}
            variant="filled"
            sx={{ width: '100%', minWidth: 280 }}
          >
            {current.message}
          </Alert>
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

export default NotificationContext;
