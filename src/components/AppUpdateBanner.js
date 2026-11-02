import { useEffect, useState, useCallback } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { SystemUpdateAlt } from '@mui/icons-material';
import { API_BASE } from '../config/api';

export const SW_UPDATE_EVENT = 'app:sw-update';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const CLIENT_VERSION = process.env.REACT_APP_VERSION || '0.1.0';

export default function AppUpdateBanner() {
  const [open, setOpen] = useState(false);
  const [swRegistration, setSwRegistration] = useState(null);

  const applyUpdate = useCallback(() => {
    setOpen(false);
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });
    } else {
      window.location.reload();
    }
  }, [swRegistration]);

  useEffect(() => {
    const onSwUpdate = (e) => {
      setSwRegistration(e.detail);
      setOpen(true);
    };
    window.addEventListener(SW_UPDATE_EVENT, onSwUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onSwUpdate);
  }, []);

  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) return;
        const json = await res.json();
        const serverVersion = json?.data?.version;
        if (serverVersion && serverVersion !== CLIENT_VERSION) {
          setOpen(true);
        }
      } catch {
        // Server unreachable — skip
      }
    }

    checkVersion();
    const id = setInterval(checkVersion, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ mb: 8 }}
    >
      <Alert
        severity="info"
        icon={<SystemUpdateAlt />}
        sx={{ width: '100%', alignItems: 'center' }}
        action={(
          <>
            <Button color="inherit" size="small" onClick={() => setOpen(false)}>
              Later
            </Button>
            <Button color="inherit" size="small" variant="outlined" onClick={applyUpdate} sx={{ ml: 1 }}>
              Refresh
            </Button>
          </>
        )}
      >
        A new version is available. Refresh to update.
      </Alert>
    </Snackbar>
  );
}
