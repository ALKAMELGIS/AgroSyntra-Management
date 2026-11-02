import { useCallback, useRef, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText,
} from '@mui/material';
import api from '../../utils/api';
import { fetchSameDaySprays, formatSameDaySprayLine, sprayAppId } from '../../utils/spraySameDay';

export default function useSameDaySprayWarn() {
  const resolverRef = useRef(null);
  const [existing, setExisting] = useState(null);

  const close = (ok) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setExisting(null);
    resolve?.(ok);
  };

  const confirmIfSameDay = useCallback(async ({ fieldId, dateYmd, excludeId } = {}) => {
    let hits = [];
    try {
      hits = await fetchSameDaySprays(api, { fieldId, dateYmd, excludeId });
    } catch {
      hits = [];
    }
    if (!hits.length) return true;
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setExisting(hits);
    });
  }, []);

  const dialog = (
    <Dialog open={!!existing} onClose={() => close(false)} maxWidth="xs" fullWidth>
      <DialogTitle>This field already has a spray on this date</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Morning and afternoon sprays are both valid. Save anyway if this is a real second application.
        </Alert>
        <List dense>
          {(existing || []).map((app, idx) => (
            <ListItem key={sprayAppId(app) || idx} disableGutters>
              <ListItemText primary={formatSameDaySprayLine(app)} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={() => close(true)}>
          Save anyway
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { confirmIfSameDay, dialog };
}
