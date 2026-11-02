import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import { CloudUpload as UploadIcon, Check as CheckIcon } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { apiRequest } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { canWriteWeatherLogs } from '../utils/weatherLogAccess';
import ReadOnlyBanner from './ReadOnlyBanner';

const ENTITY_ENDPOINTS = {
  harvest: '/harvests',
  fertigation: '/fertigation',
  ecph: '/ecph',
  weather: '/weather-logs',
};

const steps = ['Upload File', 'Map Columns', 'Preview & Import'];

/**
 * Generic CSV/Excel data importer.
 * Props:
 *   open       – dialog open state
 *   onClose    – close callback
 *   entity     – entity type ('harvest', 'fertigation', 'ecph', 'weather')
 *   onComplete – callback after successful import
 */
export default function DataImporter({ open, onClose, entity = 'harvest', onComplete }) {
  const [step, setStep] = useState(0);
  const [rawData, setRawData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const fileRef = useRef(null);
  const notify = useNotification();
  const { user } = useAuth();
  // Weather logs can only be written by the worker and the operation manager.
  const importBlocked = entity === 'weather' && !canWriteWeatherLogs(user?.role);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (json.length === 0) {
          notify.warning('File is empty');
          return;
        }

        setRawData(json);
        setHeaders(Object.keys(json[0]));

        // Auto-map columns by name similarity
        const autoMap = {};
        Object.keys(json[0]).forEach((h) => {
          autoMap[h] = h.toLowerCase().replace(/\s+/g, '_');
        });
        setColumnMap(autoMap);
        setStep(1);
      } catch (err) {
        notify.error('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [notify]);

  const handleImport = async () => {
    if (importBlocked) return;
    setImporting(true);
    const endpoint = ENTITY_ENDPOINTS[entity];
    let success = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const mapped = {};
      Object.entries(columnMap).forEach(([fileCol, dbCol]) => {
        if (dbCol && row[fileCol] !== undefined) {
          mapped[dbCol] = row[fileCol];
        }
      });

      try {
        await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(mapped),
        });
        success++;
      } catch (err) {
        failed++;
        if (errors.length < 5) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }
    }

    setResults({ success, failed, errors });
    setImporting(false);
    if (success > 0) {
      notify.success(`Imported ${success} records`);
      if (onComplete) onComplete();
    }
    if (failed > 0) {
      notify.warning(`${failed} records failed`);
    }
    setStep(2);
  };

  const handleClose = () => {
    setStep(0);
    setRawData([]);
    setHeaders([]);
    setColumnMap({});
    setResults(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Data ({entity})</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {importBlocked && <ReadOnlyBanner />}

        {step === 0 && !importBlocked && (
          <Paper
            variant="outlined"
            sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}
          >
            <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography>Click to upload CSV or Excel file</Typography>
            <Typography variant="caption" color="text.secondary">
              Supported formats: .csv, .xlsx, .xls
            </Typography>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
            />
          </Paper>
        )}

        {step === 1 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Map file columns to database fields ({rawData.length} rows detected)
            </Typography>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>File Column</TableCell>
                    <TableCell>Maps To</TableCell>
                    <TableCell>Sample</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {headers.map((h) => (
                    <TableRow key={h}>
                      <TableCell>{h}</TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={columnMap[h] || ''}
                          onChange={(e) => setColumnMap({ ...columnMap, [h]: e.target.value })}
                          placeholder="field_name"
                          sx={{ minWidth: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{String(rawData[0]?.[h] || '')}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {step === 2 && results && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
            <Typography variant="h6" gutterBottom>Import Complete</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2 }}>
              <Chip label={`${results.success} imported`} color="success" />
              {results.failed > 0 && <Chip label={`${results.failed} failed`} color="error" />}
            </Box>
            {results.errors.length > 0 && (
              <Alert severity="warning" sx={{ textAlign: 'left' }}>
                {results.errors.map((e, i) => <div key={i}>{e}</div>)}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        {step === 1 && !importBlocked && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importing}
            startIcon={importing ? <CircularProgress size={18} /> : null}
          >
            {importing ? 'Importing...' : `Import ${rawData.length} records`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
