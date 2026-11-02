import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';

/**
 * Reusable confirmation dialog to replace window.confirm()
 *
 * Usage:
 *   const [confirm, ConfirmDialog] = useConfirmDialog();
 *   const ok = await confirm('Delete this item?');
 *   if (ok) { ... }
 */

export function ConfirmDialogComponent({ open, title, message, confirmLabel, cancelLabel, severity, onConfirm, onCancel }) {
  const color = severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'primary';

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {(severity === 'error' || severity === 'warning') && (
          <WarningIcon color={color} />
        )}
        {title || 'Confirm'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} color="inherit">
          {cancelLabel || 'Cancel'}
        </Button>
        <Button onClick={onConfirm} variant="contained" color={color} autoFocus>
          {confirmLabel || 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Hook for easy usage
export function useConfirmDialog() {
  const [state, setState] = useState({ open: false, title: '', message: '', severity: 'warning', confirmLabel: 'Delete', cancelLabel: 'Cancel' });
  const resolveRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        message,
        title: options.title || 'Confirm',
        severity: options.severity || 'warning',
        confirmLabel: options.confirmLabel || 'Delete',
        cancelLabel: options.cancelLabel || 'Cancel',
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(false);
  }, []);

  const dialog = (
    <ConfirmDialogComponent
      open={state.open}
      title={state.title}
      message={state.message}
      severity={state.severity}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return [confirm, dialog];
}
