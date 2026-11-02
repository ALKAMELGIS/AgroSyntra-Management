import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Snackbar, Alert, Button, Box, Typography, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText,
} from '@mui/material';
import {
  CloudOffOutlined as OfflineIcon,
  CloudSyncOutlined as SyncIcon,
} from '@mui/icons-material';
import { listQueue, deleteQueueItem, updateQueueItem, subscribe } from '../utils/offlineQueue';
import { API_BASE } from '../config/api';

const TOKEN_KEY = 'almaha_access_token';

/**
 * Persistent pill + dialog that surfaces the offline-mutation queue.
 *
 * Behaviour:
 *   - Invisible when online AND queue is empty.
 *   - Shows a small pill at the bottom-right with "N pending" and a
 *     colour that reflects online/offline state.
 *   - Listens to window online/offline events and auto-drains the
 *     queue whenever we come back online.
 *   - Clicking the pill opens a dialog that lists each queued
 *     mutation, lets the user manually retry, or drop entries that
 *     keep failing (e.g. deleted record, permissions changed).
 *
 * Auth behaviour:
 *   - Drain reads the current access token from localStorage at the
 *     time of retry, so if the user refreshed their session between
 *     queueing and draining the replay still works. 401 marks the
 *     entry as "needs login" instead of discarding it.
 *
 * Why keep 4xx failures in the queue:
 *   - 4xx usually means validation/permission issues that a human
 *     should resolve (e.g. field was deleted, role changed). Silent
 *     discard would hide real problems. The user sees the error and
 *     decides whether to drop.
 */
export default function OfflineQueueBanner() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [draining, setDraining] = useState(false);
  const [lastDrainResult, setLastDrainResult] = useState(null);
  // Used to coalesce concurrent drain triggers (online event +
  // user manual click). Without this, two drain loops could race
  // and send duplicate replays for the same entry.
  const drainingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const items = await listQueue();
      setCount(items.length);
      setEntries(items);
    } catch {
      setCount(0);
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    return unsub;
  }, [refresh]);

  // Drain in sequence so a burst of queued mutations hits the
  // server one after another. Parallel replay could exhaust the
  // backend's per-user rate limit or create duplicate parent/child
  // orderings in the rare case where two queued writes depend on
  // each other.
  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setDraining(true);
    setLastDrainResult(null);
    let ok = 0;
    let failed = 0;
    try {
      const items = await listQueue();
      for (const item of items) {
        try {
          const token = localStorage.getItem(TOKEN_KEY);
          const res = await fetch(`${API_BASE}${item.endpoint}`, {
            method: item.method,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: item.body ?? undefined,
          });
          if (res.ok || res.status === 409) {
            // 409 means "already exists" — a partial drain from an
            // earlier attempt. Safe to remove as done.
            await deleteQueueItem(item.id);
            ok += 1;
            continue;
          }
          const text = await res.text().catch(() => '');
          await updateQueueItem(item.id, {
            retries: (item.retries || 0) + 1,
            lastError: `HTTP ${res.status} ${text.slice(0, 200)}`,
          });
          failed += 1;
          if (res.status >= 400 && res.status < 500) {
            // Client errors (bad request / forbidden / not found)
            // won't recover by retrying, so stop the drain so the
            // user can decide what to do.
            break;
          }
        } catch (networkErr) {
          await updateQueueItem(item.id, {
            retries: (item.retries || 0) + 1,
            lastError: networkErr?.message || 'Network error',
          });
          failed += 1;
          // Abort drain: if one request hits a network error, the
          // rest almost certainly will too. We'll retry on the
          // next online event.
          break;
        }
      }
    } catch (err) {
      // IndexedDB can briefly reject while the connection is closing
      // (e.g. tab backgrounded on mobile). Retry on the next online event.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Offline queue drain aborted:', err);
      }
    } finally {
      drainingRef.current = false;
      setDraining(false);
      setLastDrainResult({ ok, failed });
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      // Small grace period — captive portals sometimes fire
      // "online" before DNS is actually resolving.
      setTimeout(() => drain(), 1500);
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [drain]);

  // Nothing to show when everything is calm.
  if (online && count === 0) return null;

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 2000,
        }}
      >
        <Chip
          icon={online ? <SyncIcon /> : <OfflineIcon />}
          label={
            online
              ? (count === 0 ? 'Online' : `${count} pending`)
              : `Offline${count ? ` · ${count} pending` : ''}`
          }
          color={online ? (count > 0 ? 'warning' : 'success') : 'error'}
          onClick={() => setOpen(true)}
          sx={{ boxShadow: 3, cursor: 'pointer' }}
        />
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Offline queue
        </DialogTitle>
        <DialogContent>
          <Alert severity={online ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {online
              ? 'You are online. The queue will drain automatically.'
              : 'You are currently offline. New saves are stored locally and will sync when you reconnect.'}
          </Alert>
          {lastDrainResult && (
            <Alert severity={lastDrainResult.failed > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
              Last sync: {lastDrainResult.ok} succeeded
              {lastDrainResult.failed > 0 ? `, ${lastDrainResult.failed} failed` : ''}.
            </Alert>
          )}
          {entries.length === 0 ? (
            <Typography color="text.secondary">Nothing pending.</Typography>
          ) : (
            <List dense>
              {entries.map((e) => (
                <ListItem
                  key={e.id}
                  divider
                  secondaryAction={
                    <Button
                      size="small"
                      color="error"
                      onClick={async () => {
                        if (window.confirm('Drop this queued item? Any unsaved data in it will be lost.')) {
                          await deleteQueueItem(e.id);
                        }
                      }}
                    >
                      Drop
                    </Button>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" label={e.method} />
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                        >
                          {e.endpoint}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        Queued {new Date(e.createdAt).toLocaleString()}
                        {e.retries > 0 && ` · ${e.retries} retry attempts`}
                        {e.lastError && (
                          <Box component="span" sx={{ color: 'error.main', display: 'block' }}>
                            {e.lastError}
                          </Box>
                        )}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
          <Button
            onClick={drain}
            variant="contained"
            disabled={draining || !online || entries.length === 0}
            startIcon={<SyncIcon />}
          >
            {draining ? 'Syncing…' : 'Retry now'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!online}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="warning" icon={<OfflineIcon />} variant="filled">
          You're offline. New saves are stored locally and will sync when you reconnect.
        </Alert>
      </Snackbar>
    </>
  );
}
