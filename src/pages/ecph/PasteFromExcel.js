import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Alert, Chip,
} from '@mui/material';
import { ContentPasteOutlined as PasteIcon } from '@mui/icons-material';

const KNOWN_HEADERS = {
  'nh location': 'field_name', 'gh location': 'field_name', 'field': 'field_name',
  'field name': 'field_name', 'location': 'field_name',
  'valve': 'valve', 'valve no': 'valve', 'valve number': 'valve',
  'time': 'time',
  'ec in': 'ecIn', 'ec out': 'ecOut',
  'ph in': 'phIn', 'ph out': 'phOut',
  'drip volume': 'dripVolume', 'drip vol': 'dripVolume',
  'drain volume': 'drainVolume', 'drain vol': 'drainVolume',
  'qty of water': 'qtyOfWater', 'qty of water (m3)': 'qtyOfWater', 'qty water': 'qtyOfWater',
  'cycle': 'cycle',
  'weather': 'weatherCondition', 'weather type': 'weatherCondition', 'weather condition': 'weatherCondition',
  'status': 'irrigationStatus', 'irrigation status': 'irrigationStatus',
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

export default function PasteFromExcel({ open, onClose, onPaste }) {
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
      <DialogTitle>Paste from Excel</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Copy rows from your Excel sheet (including the header row) and paste them below.
          Tab-separated or comma-separated values are both supported.
        </Typography>

        <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Recognized headers:</Typography>
          {['Field', 'Valve', 'Time', 'EC In', 'EC Out', 'pH In', 'pH Out', 'Drip Volume', 'Drain Volume', 'Qty Of Water', 'Cycle', 'Weather', 'Status'].map((h) => (
            <Chip key={h} label={h} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
          ))}
        </Box>

        <TextField
          multiline rows={10} fullWidth variant="outlined"
          placeholder="Paste Excel data here..."
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); setError(''); }}
          sx={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', '& textarea': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.8rem' } }}
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
