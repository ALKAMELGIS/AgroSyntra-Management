import { useEffect, useState } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { InstallMobile } from '@mui/icons-material';

/**
 * Lightweight "Install this app" surface.
 *
 * The browser fires `beforeinstallprompt` when the PWA criteria are met
 * (HTTPS + valid manifest + active service worker). We capture the event,
 * suppress the browser's default mini-infobar, and surface our own button
 * inside a dismissible Snackbar so the user can install when *we* choose
 * rather than whenever the browser feels like nagging.
 *
 * Dismissals are remembered for 30 days so we don't pester anyone.
 */
const DISMISS_KEY = 'alMaha.pwaInstallDismissedAt';
const DISMISS_WINDOW_DAYS = 30;

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();

      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      const ageDays = (Date.now() - dismissedAt) / (24 * 60 * 60 * 1000);
      if (dismissedAt && ageDays < DISMISS_WINDOW_DAYS) return;

      setDeferredPrompt(e);
      setOpen(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installed = () => {
      setOpen(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // Browser-dependent — user dismissed or something timed out.
    }
    setDeferredPrompt(null);
    setOpen(false);
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setOpen(false);
  };

  if (!deferredPrompt) return null;

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      onClose={handleDismiss}
    >
      <Alert
        severity="info"
        icon={<InstallMobile />}
        onClose={handleDismiss}
        action={
          <Button color="inherit" size="small" onClick={handleInstall}>
            Install
          </Button>
        }
        sx={{ alignItems: 'center' }}
      >
        Add Al Maha Farm to your home screen for faster access and an app-like experience.
      </Alert>
    </Snackbar>
  );
}
