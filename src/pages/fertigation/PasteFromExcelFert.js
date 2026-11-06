import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Alert, Chip,
} from '@mui/material';
import { ContentPasteOutlined as PasteIcon } from '@mui/icons-material';

const KNOWN_HEADERS = {
  'field id': 'fieldName', 'field': 'fieldName', 'field name': 'fieldName',
  'nh location': 'fieldName', 'gh location': 'fieldName', 'location': 'fieldName',
  'number of valves': 'valves', 'valves': 'valves', 'no. of valves': 'valves',
  'flow rate': 'flowRate', 'flow rate ( m3/hr. )': 'flowRate', 'flow rate (m3/hr)': 'flowRate',
  'water qty. ( m3/valve)': 'waterQty', 'water qty': 'waterQty', 'water qty (m3/valve)': 'waterQty',
  'frequency': 'frequency', 'freq': 'frequency',
  'daily total (m3)': 'dailyTotal', 'daily total': 'dailyTotal',
  'crop': 'crop', 'crop name': 'crop',
};

function normalizeHeader(raw) {
  const lower = raw.trim().toLowerCase();
  return KNOWN_HEADERS[lower] || null;
}

function parseTSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const sep = headerLine.includes('\t') ? '\t' : ',';
  const rawHeaders = headerLine.split(sep).map((h) => h.trim());
  const mappedHeaders = rawHeaders.map(normalizeHeader);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const row = {};
    mappedHeaders.forEach((key, ci) => {
      if (key && cols[ci] !== undefined) {
        row[key] = cols[ci].trim();
      }
    });
    if (Object.keys(row).length > 0) rows.push(row);
  }

  return rows;
}

export default function PasteFromExcelFert({ open, onClose, onPaste }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const handlePreview = () => {
    try {
      const rows = parseTSV(text);
      if (rows.length === 0) {
        setError('No data detected. Make sure the first row is headers.');
        setPreview(null);
        return;
      }
      setPreview(rows);
      setError('');
    } catch (err) {
      setError(`Parse error: ${err.message}`);
      setPreview(null);
    }
  };

  const handleSubmit = () => {
    if (preview && preview.length > 0) {
      onPaste(preview);
      setText('');
      setPreview(null);
      setError('');
      onClose();
    }
  };

  const handleClose = () => {
    setText('');
    setPreview(null);
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Paste Fertigation from Excel</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Copy rows from your fertigation Excel sheet (including the header row) and paste them below.
          Tab-separated or comma-separated values are both supported.
        </Typography>

        <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Recognized headers:</Typography>
          {['Field ID', 'Valves', 'Flow Rate', 'Water Qty', 'Frequency', 'Daily Total', 'Crop'].map((h) => (
            <Chip key={h} label={h} size="small" variant="outlined" sx={{ fontSize: '0.6875rem', height: 22 }} />
          ))}
        </Box>

        <TextField
          multiline rows={10} fullWidth variant="outlined"
          placeholder="Paste Excel data here..."
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); setError(''); }}
          sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', '& textarea': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.8125rem' } }}
        />

        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}

        {preview && (
          <Alert severity="success" sx={{ mt: 1 }}>
            Parsed {preview.length} row(s) with fields:{' '}
            {[...new Set(preview.flatMap(Object.keys))].join(', ')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {!preview ? (
          <Button variant="outlined" onClick={handlePreview} disabled={!text.trim()} startIcon={<PasteIcon />}>
            Preview
          </Button>
        ) : (
          <Button variant="contained" color="primary" onClick={handleSubmit}>
            Apply {preview.length} Row(s)
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
