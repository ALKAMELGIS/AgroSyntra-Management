import { useState, useEffect, useCallback } from 'react';
import { Snackbar, Alert, Badge, Button, Box, Typography } from '@mui/material';
import { WifiOff, Sync as SyncIcon, CloudDone } from '@mui/icons-material';
import { getPendingCount, syncPendingEntries } from '../utils/offlineQueue';
import { apiRequest } from '../utils/api';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch { /* indexedDB may not be available */ }
  }, []);

  const doSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncPendingEntries(apiRequest);
      if (result.synced > 0) {
        setSyncResult(`${result.synced} entries synced successfully`);
      }
      await refreshCount();
    } catch { /* handled internally */ }
    finally { setSyncing(false); }
  }, [syncing, refreshCount]);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => { setOffline(false); doSync(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    refreshCount();
    const interval = setInterval(refreshCount, 10000);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearInterval(interval);
    };
  }, [doSync, refreshCount]);

  return (
    <>
      <Snackbar open={offline} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="warning" icon={<WifiOff />} variant="filled" sx={{ width: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span>You are offline.</span>
            {pendingCount > 0 && (
              <Badge badgeContent={pendingCount} color="info">
                <Typography variant="body2" sx={{ ml: 1 }}>
                  {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending sync
                </Typography>
              </Badge>
            )}
          </Box>
        </Alert>
      </Snackbar>

      {!offline && pendingCount > 0 && (
        <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          <Alert severity="info" icon={<SyncIcon />} variant="filled"
            action={<Button color="inherit" size="small" onClick={doSync} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>}
          >
            {pendingCount} offline {pendingCount === 1 ? 'entry' : 'entries'} pending
          </Alert>
        </Snackbar>
      )}

      <Snackbar
        open={!!syncResult}
        autoHideDuration={4000}
        onClose={() => setSyncResult(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" icon={<CloudDone />} onClose={() => setSyncResult(null)}>
          {syncResult}
        </Alert>
      </Snackbar>
    </>
  );
}
