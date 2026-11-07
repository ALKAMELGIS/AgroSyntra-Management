import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem, Switch, IconButton,
  Chip, Alert, Snackbar, Tooltip, FormControlLabel,
} from '@mui/material';
import {
  AddOutlined as AddIcon, DeleteOutlined as DeleteIcon, EditOutlined as EditIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { excelTableSx, GutterCell } from '../components/table/ExcelTable';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { canEditThresholds } from '../utils/roleAccess';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';

const PARAMETER_LABELS = {
  temperature: { label: 'Temperature', unit: '°C' },
  humidity: { label: 'Humidity', unit: '%' },
  ec: { label: 'EC (both In & Out)', unit: 'dS/m' },
  ec_in: { label: 'EC In', unit: 'dS/m' },
  ec_out: { label: 'EC Out', unit: 'dS/m' },
  ph: { label: 'pH (both In & Out)', unit: '' },
  ph_in: { label: 'pH In', unit: '' },
  ph_out: { label: 'pH Out', unit: '' },
  soil_moisture: { label: 'Soil Moisture', unit: '%' },
  wind_speed: { label: 'Wind Speed', unit: 'km/h' },
  solar_radiation: { label: 'Solar Radiation', unit: 'W/m²' },
};

export default function AgronomicReference() {
  const { t: tr } = useTranslation();
  // CEO and operation manager set thresholds; farm manager views only.
  const canEdit = canEditThresholds(useAuth().user);
  const [thresholds, setThresholds] = useState([]);
  const [crops, setCrops] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const [filterCrop, setFilterCrop] = useState('');

  const notify = useCallback((message, severity = 'success') => setSnack({ open: true, message, severity }), []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [thRes, cropsRes, paramsRes] = await Promise.all([
        apiRequest('/agronomic/thresholds'),
        apiRequest('/crops?limit=10000'),
        apiRequest('/agronomic/parameters'),
      ]);
      setThresholds(Array.isArray(thRes) ? thRes : thRes.data || []);
      setCrops(Array.isArray(cropsRes) ? cropsRes : cropsRes.data || []);
      setParameters(Array.isArray(paramsRes) ? paramsRes : paramsRes.data || []);
    } catch (err) {
      notify(err.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      await apiRequest('/agronomic/thresholds', {
        method: 'POST',
        body: JSON.stringify({
          cropId: dialog.cropId,
          parameter: dialog.parameter,
          warningMin: dialog.warningMin === '' ? null : Number(dialog.warningMin),
          warningMax: dialog.warningMax === '' ? null : Number(dialog.warningMax),
          criticalMin: dialog.criticalMin === '' ? null : Number(dialog.criticalMin),
          criticalMax: dialog.criticalMax === '' ? null : Number(dialog.criticalMax),
          enabled: dialog.enabled,
        }),
      });
      notify('Threshold saved');
      setDialog(null);
      load();
    } catch (err) {
      notify(err.message || 'Failed to save', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this threshold?')) return;
    try {
      await apiRequest(`/agronomic/thresholds/${id}`, { method: 'DELETE' });
      notify('Deleted');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const openAdd = () => setDialog({
    cropId: crops[0]?.id || '', parameter: parameters[0] || 'temperature',
    warningMin: '', warningMax: '', criticalMin: '', criticalMax: '', enabled: true,
  });

  const openEdit = (t) => setDialog({
    id: t.id, cropId: t.cropId, parameter: t.parameter,
    warningMin: t.warningMin ?? '', warningMax: t.warningMax ?? '',
    criticalMin: t.criticalMin ?? '', criticalMax: t.criticalMax ?? '',
    enabled: t.enabled,
  });

  const filtered = filterCrop
    ? thresholds.filter((t) => t.cropId === filterCrop)
    : thresholds;

  const grouped = {};
  for (const t of filtered) {
    const key = t.cropName || t.cropId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <PageTitle>
            Agronomic Reference
          </PageTitle>
          <Typography variant="body2" color="text.secondary">
            Set environmental thresholds per crop. Warning (yellow) and Critical (red) alerts fire when readings exceed these values.
          </Typography>
        </Box>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} disabled={crops.length === 0}>
            Add Threshold
          </Button>
        )}
      </Box>
      {!canEdit && (
        <ReadOnlyBanner message={tr('adminAccess.thresholdsViewOnly')} />
      )}

      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="agronomicreference-filter-by-crop-label-1">Filter by Crop</InputLabel>
          <Select labelId="agronomicreference-filter-by-crop-label-1" value={filterCrop} onChange={(e) => setFilterCrop(e.target.value)} label="Filter by Crop">
            <MenuItem value="">All Crops</MenuItem>
            {crops.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : Object.keys(grouped).length === 0 ? (
        <InfoNote mode="line" severity="info">No thresholds configured yet. Click "Add Threshold" to get started.</InfoNote>
      ) : (
        Object.entries(grouped).map(([cropName, items]) => (
          <Paper key={cropName} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: 'table.headerBg', color: 'table.headerText', px: 2, py: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'inherit' }}>{cropName}</Typography>
            </Box>
            <TableContainer>
              <Table size="small" sx={excelTableSx}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell>Parameter</TableCell>
                    <TableCell className="col-numeric">Warning Min</TableCell>
                    <TableCell className="col-numeric">Warning Max</TableCell>
                    <TableCell className="col-numeric">Critical Min</TableCell>
                    <TableCell className="col-numeric">Critical Max</TableCell>
                    <TableCell>Enabled</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((t, idx) => {
                    const info = PARAMETER_LABELS[t.parameter] || { label: t.parameter, unit: '' };
                    return (
                      <TableRow key={t.id} hover>
                        <GutterCell index={idx + 1} />
                        <TableCell>{info.label}</TableCell>
                        <TableCell className="col-numeric">
                          {t.warningMin != null ? `${t.warningMin} ${info.unit}` : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">
                          {t.warningMax != null ? `${t.warningMax} ${info.unit}` : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">
                          {t.criticalMin != null ? `${t.criticalMin} ${info.unit}` : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">
                          {t.criticalMax != null ? `${t.criticalMax} ${info.unit}` : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip label={t.enabled ? 'On' : 'Off'} color={t.enabled ? 'success' : 'default'} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {canEdit && (<>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(t)}><EditIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          </>)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ))
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog?.id ? 'Edit Threshold' : 'Add Threshold'}</DialogTitle>
        {dialog && (
          <DialogContent sx={{ pt: '16px !important' }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="agronomicreference-crop-label-2">Crop</InputLabel>
              <Select labelId="agronomicreference-crop-label-2" value={dialog.cropId} onChange={(e) => setDialog({ ...dialog, cropId: e.target.value })} label="Crop">
                {crops.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="agronomicreference-parameter-label-3">Parameter</InputLabel>
              <Select labelId="agronomicreference-parameter-label-3" value={dialog.parameter} onChange={(e) => setDialog({ ...dialog, parameter: e.target.value })} label="Parameter">
                {parameters.map((p) => (
                  <MenuItem key={p} value={p}>{PARAMETER_LABELS[p]?.label || p}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="subtitle2" color="warning.main" sx={{ mb: 1 }}>Warning Range (yellow)</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label={`Min ${PARAMETER_LABELS[dialog.parameter]?.unit ? `(${PARAMETER_LABELS[dialog.parameter].unit})` : ''}`}
                type="number" fullWidth
                value={dialog.warningMin} onChange={(e) => setDialog({ ...dialog, warningMin: e.target.value })}
              />
              <TextField
                label={`Max ${PARAMETER_LABELS[dialog.parameter]?.unit ? `(${PARAMETER_LABELS[dialog.parameter].unit})` : ''}`}
                type="number" fullWidth
                value={dialog.warningMax} onChange={(e) => setDialog({ ...dialog, warningMax: e.target.value })}
              />
            </Box>
            <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>Critical Range (red)</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label={`Min ${PARAMETER_LABELS[dialog.parameter]?.unit ? `(${PARAMETER_LABELS[dialog.parameter].unit})` : ''}`}
                type="number" fullWidth
                value={dialog.criticalMin} onChange={(e) => setDialog({ ...dialog, criticalMin: e.target.value })}
              />
              <TextField
                label={`Max ${PARAMETER_LABELS[dialog.parameter]?.unit ? `(${PARAMETER_LABELS[dialog.parameter].unit})` : ''}`}
                type="number" fullWidth
                value={dialog.criticalMax} onChange={(e) => setDialog({ ...dialog, criticalMax: e.target.value })}
              />
            </Box>
            <FormControlLabel
              control={<Switch checked={dialog.enabled} onChange={(e) => setDialog({ ...dialog, enabled: e.target.checked })} />}
              label="Enabled"
            />
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!dialog?.cropId || !dialog?.parameter}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity} onClose={() => setSnack({ ...snack, open: false })}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
