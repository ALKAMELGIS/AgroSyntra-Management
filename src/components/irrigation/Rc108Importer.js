import { useMemo, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, MenuItem, Select, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, ListSubheader, Paper,
} from '@mui/material';
import { defaultRc108Assignments, parseRc108Workbook, remapImportedDays } from '../../utils/rc108ImportParser';
import { RC108_STRUCTURE_ORDER } from '../../utils/rc108Locations';

const STRUCTURE_LABEL = {
  nethouse: 'Nethouse',
  greenhouse: 'Greenhouse',
  openfield: 'Open Field',
};

const hdrStyle = {
  bgcolor: '#1f7a4d',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.75rem',
  py: 0.75,
};

function assignmentValue(a) {
  if (!a?.structure || !a?.locLabel) return '';
  return `${a.structure}::${a.locLabel}`;
}

function parseAssignmentValue(value) {
  if (!value) return null;
  const i = value.indexOf('::');
  if (i < 0) return null;
  return { structure: value.slice(0, i), locLabel: value.slice(i + 2) };
}

function splitSummary(counts) {
  return [
    `${counts.nethouse} nethouse`,
    `${counts.openfield} open-field`,
    `${counts.greenhouse} greenhouse`,
  ].join(', ');
}

export default function Rc108Importer({
  open, onClose, locations, structureLocations, onApply,
}) {
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [applying, setApplying] = useState(false);

  const groups = useMemo(() => structureLocations || {
    nethouse: locations || [],
    greenhouse: [],
    openfield: [],
  }, [structureLocations, locations]);

  const remapped = useMemo(
    () => (preview ? remapImportedDays(preview.days, groups, assignments) : null),
    [preview, groups, assignments],
  );

  const matchedCount = remapped
    ? remapped.counts.nethouse + remapped.counts.openfield + remapped.counts.greenhouse
    : 0;

  const excelLabels = preview?.locations || [];

  const handleFile = async (file) => {
    setError('');
    setPreview(null);
    setAssignments({});
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseRc108Workbook(buf, file.name);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      setAssignments(defaultRc108Assignments(parsed.locations, groups));
      setPreview(parsed);
    } catch (e) {
      setError(e.message || 'Could not read workbook');
    }
  };

  const handleAssign = (excelLabel, value) => {
    setAssignments((prev) => ({
      ...prev,
      [excelLabel]: parseAssignmentValue(value),
    }));
  };

  const handleApply = async () => {
    if (!preview || !remapped || matchedCount === 0) return;
    setApplying(true);
    try {
      await onApply({ ...preview, remapped });
      setPreview(null);
      setAssignments({});
      onClose();
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    if (applying) return;
    setPreview(null);
    setAssignments({});
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1f7a4d', color: '#fff', fontWeight: 700 }}>
        Import RC-108 Excel
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
          Upload the workbook, then match Excel columns to Nethouse, Greenhouse, or Open Field plots. Unmatched columns are skipped.
        </Typography>
        <Button variant="outlined" component="label" sx={{ textTransform: 'none', mb: 2 }}>
          Choose file
          <input
            type="file"
            hidden
            accept=".xlsx,.xls"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </Button>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {preview && remapped && (
          <>
            <Alert severity={matchedCount > 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
              {preview.days.length} days from {preview.filename}. {splitSummary(remapped.counts)} columns matched
              {remapped.counts.unmatched > 0
                ? `; ${remapped.counts.unmatched} skipped.`
                : '.'}
            </Alert>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={hdrStyle}>Excel column</TableCell>
                    <TableCell sx={hdrStyle}>Maps to</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {excelLabels.map((label) => (
                    <TableRow key={label} hover>
                      <TableCell sx={{ fontWeight: assignments[label] ? 400 : 700, fontSize: '0.8rem' }}>
                        {label}
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={assignmentValue(assignments[label])}
                            onChange={(e) => handleAssign(label, e.target.value)}
                            displayEmpty
                            sx={{ fontSize: '0.8rem' }}
                          >
                            <MenuItem value=""><em>Skip</em></MenuItem>
                            {RC108_STRUCTURE_ORDER.map((structure) => {
                              const locs = groups[structure] || [];
                              if (locs.length === 0) return null;
                              return [
                                <ListSubheader key={`${structure}-h`} sx={{ lineHeight: 2, fontWeight: 700 }}>
                                  {STRUCTURE_LABEL[structure]}
                                </ListSubheader>,
                                ...locs.map((loc) => (
                                  <MenuItem
                                    key={`${structure}::${loc.label}`}
                                    value={`${structure}::${loc.label}`}
                                    sx={{ fontSize: '0.8rem' }}
                                  >
                                    {loc.label}
                                  </MenuItem>
                                )),
                              ];
                            })}
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={applying} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!preview || matchedCount === 0 || applying}
          onClick={handleApply}
          sx={{ textTransform: 'none' }}
        >
          {applying ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
