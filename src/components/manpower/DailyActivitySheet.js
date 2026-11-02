import { useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Autocomplete,
  CircularProgress, Alert, IconButton, Tooltip, Chip,
  Card, CardContent, Divider, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText,
} from '@mui/material';
import { Delete, ContentCopy, Save, Add, Remove } from '@mui/icons-material';
import {
  blockIsBlank,
  blockMeetsRequiredFields,
  getBlockValidationError,
  getBlockMandatoryErrors,
} from '../../utils/manpowerOptionalFields';
import ManpowerOptionalValue, { ManpowerOptionalHoursChip } from './ManpowerOptionalValue';
import { applyReferenceToBlock } from '../../utils/matchActivityReference';

const MAX_BLOCKS = 8;

const SECTION_OPTIONS = [
  'All', 'V1', 'V2', 'V3', 'V4',
  'V1,2', 'V2,3', 'V3,4', 'V1,4',
  'V1,2,3', 'V2,3,4', 'V1,2,3,4',
];

const createEmptyBlock = () => ({
  activity: '', unit: '', location: '', variety: '', section: '',
  startTime: '', endTime: '', target: '', actual: '', targetLocked: false,
});

const DEFAULT_WORKER_ROWS = 3;

const createEmptyRow = () => ({
  rowKey: crypto.randomUUID(),
  workerId: null,
  workerName: '',
  workerObj: null,
  blocks: [{ ...createEmptyBlock(), startTime: '07:00', endTime: '12:00' }],
});

const initialRows = () => Array.from({ length: DEFAULT_WORKER_ROWS }, createEmptyRow);

const rowHasNonBlankBlock = (row) => row.blocks.some((blk) => !blockIsBlank(blk));

function overlapStatusLabel(status) {
  return status === 'approved' ? 'already approved' : 'still pending';
}

function uniqueOverlaps(overlaps) {
  const seen = new Set();
  return (overlaps || []).filter((row) => {
    if (!row?.workerId || seen.has(row.workerId)) return false;
    seen.add(row.workerId);
    return true;
  });
}

export default function DailyActivitySheet({
  activities = [],
  references = [],
  fields = [],
  workers = [],
  onSubmit,
  checkOverlaps,
  submitting = false,
}) {
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState(() => initialRows());
  const [showMandatoryErrors, setShowMandatoryErrors] = useState(false);
  const [overlapDialog, setOverlapDialog] = useState({ open: false, overlaps: [], records: null, workerCount: 0 });

  const locationOptions = useMemo(() => fields.map((f) => f.name).filter(Boolean), [fields]);

  const getVarietiesForLocation = useCallback((loc) => {
    const field = fields.find((f) => f.name === loc);
    return field?.varieties || [];
  }, [fields]);

  const getCropForLocation = useCallback((loc) => {
    const field = fields.find((f) => f.name === loc);
    return field?.crop_name || '';
  }, [fields]);

  const resolveVarietyOnLocationChange = useCallback((location, currentVariety) => {
    const options = getVarietiesForLocation(location);
    if (options.length === 1) return options[0];
    if (currentVariety && options.includes(currentVariety)) return currentVariety;
    return '';
  }, [getVarietiesForLocation]);

  const getUnitForActivity = useCallback((actName) => {
    const act = activities.find((a) => a.name === actName);
    return act?.default_unit || '';
  }, [activities]);

  const assignWorker = (rowIdx, workerObj) => {
    setRows((prev) => {
      if (workerObj && prev.some((r, i) => i !== rowIdx && r.workerId === workerObj.id)) {
        setError(`${workerObj.name} is already on another row`);
        return prev;
      }
      setError('');
      return prev.map((r, i) => {
        if (i !== rowIdx) return r;
        if (!workerObj) {
          return { ...r, workerId: null, workerName: '', workerObj: null };
        }
        return {
          ...r,
          workerId: workerObj.id,
          workerName: workerObj.name,
          workerObj,
        };
      });
    });
  };

  const addEmptyRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (idx) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const workerOptionsForRow = useCallback((rowIdx) => {
    const taken = new Set(
      rows.filter((_, i) => i !== rowIdx).map((r) => r.workerId).filter(Boolean),
    );
    return workers.filter((w) => !taken.has(w.id));
  }, [workers, rows]);

  const assignedCount = useMemo(
    () => rows.filter((r) => r.workerId).length,
    [rows],
  );

  const addBlock = (rowIdx) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx || r.blocks.length >= MAX_BLOCKS) return r;
      const lastBlock = r.blocks[r.blocks.length - 1];
      return { ...r, blocks: [...r.blocks, { ...createEmptyBlock(), startTime: lastBlock?.endTime || '13:00', endTime: '18:00' }] };
    }));
  };

  const removeBlock = (rowIdx, blkIdx) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx || r.blocks.length <= 1) return r;
      return { ...r, blocks: r.blocks.filter((_, bi) => bi !== blkIdx) };
    }));
  };

  const updateBlock = (rowIdx, blkIdx, field, value) => {
    setRows((prev) => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const newBlocks = r.blocks.map((b, bi) => {
        if (bi !== blkIdx) return b;
        let updated = { ...b, [field]: value };
        if (field === 'location') {
          updated.variety = resolveVarietyOnLocationChange(value, b.variety);
        }
        if (field === 'activity' || field === 'location' || field === 'variety') {
          const loc = field === 'location' ? value : updated.location;
          const crop = getCropForLocation(loc);
          updated = applyReferenceToBlock(
            updated,
            references,
            crop,
            getUnitForActivity(updated.activity),
          );
        }
        return updated;
      });
      return { ...r, blocks: newBlocks };
    }));
  };

  const calcBlockHours = (blk) => {
    if (!blk.startTime || !blk.endTime) return null;
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const hrs = +(((toMin(blk.endTime) - toMin(blk.startTime)) / 60).toFixed(2));
    return hrs > 0 ? hrs : null;
  };

  const calcRowTotal = (blocks) => {
    const sum = blocks.reduce((s, b) => s + (calcBlockHours(b) || 0), 0);
    return sum;
  };

  const applyFirstBlockToAll = () => {
    if (rows.length === 0 || rows[0].blocks.length === 0) return;
    const src = rows[0].blocks[0];
    setRows((prev) => prev.map((r) => ({
      ...r,
      blocks: r.blocks.map((b, i) => i === 0
        ? { ...b, activity: b.activity || src.activity, unit: b.unit || src.unit, startTime: src.startTime, endTime: src.endTime }
        : b
      ),
    })));
  };

  const buildRecordsOrError = () => {
    if (!date) { setError('Select a date'); return null; }

    setShowMandatoryErrors(true);

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const hasData = rowHasNonBlankBlock(row);
      if (!row.workerId && hasData) {
        setError(`Row ${ri + 1}: select a worker`);
        return null;
      }
    }

    let hasSubmittable = false;
    for (const row of rows) {
      if (!row.workerId) continue;
      for (let bi = 0; bi < row.blocks.length; bi++) {
        const blk = row.blocks[bi];
        if (blockIsBlank(blk)) continue;
        if (!blockMeetsRequiredFields(blk)) {
          setError(`${row.workerName}, Activity ${bi + 1}: ${getBlockValidationError(blk)}`);
          return null;
        }
        hasSubmittable = true;
      }
    }
    if (!hasSubmittable) {
      setError('Complete at least one activity block (location, section, variety, start and end times required)');
      return null;
    }

    const records = [];
    const submittedWorkerIds = new Set();
    for (const row of rows) {
      if (!row.workerId) continue;
      const totalHrs = calcRowTotal(row.blocks);
      let seq = 1;
      let rowHadRecord = false;
      for (const blk of row.blocks) {
        if (blockIsBlank(blk) || !blockMeetsRequiredFields(blk)) continue;
        const hrs = calcBlockHours(blk);
        records.push({
          recordDate: date, workerId: row.workerId, taskSequence: seq,
          activity: blk.activity?.trim() || null,
          unit: blk.unit || '', variety: blk.variety || '',
          location: blk.location || '', section: blk.section || '',
          startTime: blk.startTime || null, endTime: blk.endTime || null,
          target: blk.target !== '' && blk.target != null ? Number(blk.target) : null,
          actual: blk.actual !== '' && blk.actual != null ? Number(blk.actual) : null,
          workHours: hrs, overtime: 0, totalHours: totalHrs,
        });
        seq++;
        rowHadRecord = true;
      }
      if (rowHadRecord) submittedWorkerIds.add(row.workerId);
    }

    if (records.length === 0) {
      setError('No complete activity blocks to submit');
      return null;
    }

    return { records, workerCount: submittedWorkerIds.size, workerIds: [...submittedWorkerIds] };
  };

  const finishSubmit = async (records, workerCount) => {
    setError('');
    setSuccess('');
    try {
      await onSubmit(records);
      setSuccess(`${workerCount} worker record${workerCount !== 1 ? 's' : ''} submitted for approval!`);
      setRows(initialRows());
      setShowMandatoryErrors(false);
    } catch (err) {
      setError(err.message || 'Failed to submit records');
    }
  };

  const handleSubmit = async () => {
    const built = buildRecordsOrError();
    if (!built) return;

    if (checkOverlaps) {
      try {
        const overlaps = uniqueOverlaps(await checkOverlaps(date, built.workerIds));
        if (overlaps.length > 0) {
          setOverlapDialog({ open: true, overlaps, records: built.records, workerCount: built.workerCount });
          return;
        }
      } catch {
        // Overlap check is advisory; continue if the lookup fails.
      }
    }

    await finishSubmit(built.records, built.workerCount);
  };

  const confirmOverlapSubmit = async () => {
    const { records, workerCount } = overlapDialog;
    setOverlapDialog({ open: false, overlaps: [], records: null, workerCount: 0 });
    if (records) await finishSubmit(records, workerCount);
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" type="date" label="Date" value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
          />
          <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={applyFirstBlockToAll}
            disabled={rows.length === 0}>
            Apply 1st Block Times to All
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {assignedCount} of {rows.length} workers selected
          </Typography>
        </Box>
      </Paper>

      {rows.map((row, rowIdx) => {
        const totalHrs = calcRowTotal(row.blocks);
        return (
          <Card key={row.rowKey} sx={{ mb: 2 }} variant="outlined">
            <CardContent sx={{ pb: '12px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Chip label={rowIdx + 1} size="small" color="primary" />
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 220, flex: 1 }}
                  options={workerOptionsForRow(rowIdx)}
                  getOptionLabel={(opt) => `${opt.name} (${opt.employee_id})`}
                  filterOptions={(options, { inputValue }) => {
                    const lower = inputValue.toLowerCase();
                    return options.filter((o) =>
                      o.name.toLowerCase().includes(lower) || String(o.employee_id || '').includes(lower),
                    );
                  }}
                  value={row.workerObj}
                  onChange={(_, val) => assignWorker(rowIdx, val)}
                  isOptionEqualToValue={(opt, val) => opt.id === val.id}
                  renderInput={(params) => (
                    <TextField {...params} label="Worker" placeholder="Search worker…" />
                  )}
                />
                {row.workerObj?.employee_id && (
                  <Chip label={row.workerObj.employee_id} size="small" variant="outlined" />
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Chip label={`Total: ${totalHrs.toFixed(1)} hrs`} color={totalHrs > 0 ? 'success' : 'default'} size="small" />
                <Tooltip title="Remove row">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeRow(rowIdx)}
                      disabled={rows.length <= 1}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              {row.blocks.map((blk, blkIdx) => {
                const hrs = calcBlockHours(blk);
                const mErr = showMandatoryErrors ? getBlockMandatoryErrors(blk) : {};
                return (
                  <Box key={blkIdx}>
                    {blkIdx > 0 && <Divider sx={{ my: 1 }} />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        Activity {blkIdx + 1}
                      </Typography>
                      {row.blocks.length > 1 && (
                        <Tooltip title="Remove this activity block">
                          <IconButton size="small" onClick={() => removeBlock(rowIdx, blkIdx)}>
                            <Remove fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Box sx={{ flexGrow: 1 }} />
                      <ManpowerOptionalHoursChip
                        startTime={blk.startTime}
                        endTime={blk.endTime}
                        workHours={hrs}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <Box sx={{ minWidth: 200, flex: 2 }}>
                        <Autocomplete size="small" freeSolo
                          options={activities.map((a) => a.name)}
                          value={blk.activity}
                          onInputChange={(_, v) => updateBlock(rowIdx, blkIdx, 'activity', v)}
                          renderInput={(params) => <TextField {...params} label="Activity (optional)" />}
                        />
                        {!blk.activity?.trim() && (
                          <Box sx={{ mt: 0.5 }}>
                            <ManpowerOptionalValue field="activity" value={blk.activity} />
                          </Box>
                        )}
                      </Box>
                      <TextField
                        size="small"
                        label={blk.activity?.trim() ? 'Unit *' : 'Unit'}
                        value={blk.unit}
                        sx={{ width: 70 }}
                        InputProps={{ readOnly: true }}
                        error={Boolean(mErr.unit)}
                        helperText={mErr.unit || ' '}
                        FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                      />
                      <Autocomplete size="small" freeSolo sx={{ minWidth: 120, flex: 1 }}
                        options={locationOptions}
                        value={blk.location}
                        onInputChange={(_, v) => updateBlock(rowIdx, blkIdx, 'location', v)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Location *"
                            error={Boolean(mErr.location)}
                            helperText={mErr.location || ' '}
                            FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                          />
                        )}
                      />
                      <TextField
                        size="small"
                        label="Crop"
                        value={getCropForLocation(blk.location) || '—'}
                        sx={{ width: 130 }}
                        InputProps={{ readOnly: true }}
                        helperText={blk.location ? 'From field' : 'Select location first'}
                        FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                      />
                      <Autocomplete size="small" freeSolo={false} sx={{ width: 140 }}
                        options={getVarietiesForLocation(blk.location)}
                        value={blk.variety || null}
                        disabled={!blk.location || getVarietiesForLocation(blk.location).length === 0}
                        onChange={(_, v) => updateBlock(rowIdx, blkIdx, 'variety', v || '')}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Variety *"
                            error={Boolean(mErr.variety)}
                            helperText={
                              mErr.variety
                              || (!blk.location
                                ? 'Select location first'
                                : getVarietiesForLocation(blk.location).length === 0
                                  ? 'No varieties for this field'
                                  : ' ')
                            }
                            FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                          />
                        )}
                      />
                      <Autocomplete size="small" freeSolo sx={{ width: 100 }}
                        options={SECTION_OPTIONS}
                        value={blk.section}
                        onInputChange={(_, v) => updateBlock(rowIdx, blkIdx, 'section', v)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Section *"
                            error={Boolean(mErr.section)}
                            helperText={mErr.section || ' '}
                            FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                          />
                        )}
                      />
                      <TextField size="small" type="time" label="Start *" value={blk.startTime}
                        onChange={(e) => updateBlock(rowIdx, blkIdx, 'startTime', e.target.value)}
                        InputLabelProps={{ shrink: true }} sx={{ width: 100 }} inputProps={{ step: 300 }}
                        error={Boolean(mErr.startTime)}
                        helperText={mErr.startTime || ' '}
                        FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                      />
                      <TextField size="small" type="time" label="End *" value={blk.endTime}
                        onChange={(e) => updateBlock(rowIdx, blkIdx, 'endTime', e.target.value)}
                        InputLabelProps={{ shrink: true }} sx={{ width: 100 }} inputProps={{ step: 300 }}
                        error={Boolean(mErr.endTime)}
                        helperText={mErr.endTime || ' '}
                        FormHelperTextProps={{ sx: { minHeight: 20, mx: 0 } }}
                      />
                      <Box sx={{ width: 70 }}>
                        <TextField
                          size="small"
                          type="number"
                          label={blk.targetLocked ? 'Target' : 'Target (optional)'}
                          value={blk.target}
                          onChange={(e) => updateBlock(rowIdx, blkIdx, 'target', e.target.value)}
                          fullWidth
                          inputProps={{ min: 0, readOnly: Boolean(blk.targetLocked) }}
                          InputProps={{ readOnly: Boolean(blk.targetLocked) }}
                        />
                        {!blk.targetLocked && (blk.target === '' || blk.target == null) && (
                          <Box sx={{ mt: 0.5 }}><ManpowerOptionalValue field="target" value={blk.target} /></Box>
                        )}
                      </Box>
                      <Box sx={{ width: 70 }}>
                        <TextField size="small" type="number" label="Actual (optional)" value={blk.actual}
                          onChange={(e) => updateBlock(rowIdx, blkIdx, 'actual', e.target.value)}
                          fullWidth inputProps={{ min: 0 }} />
                        {(blk.actual === '' || blk.actual == null) && (
                          <Box sx={{ mt: 0.5 }}><ManpowerOptionalValue field="actual" value={blk.actual} /></Box>
                        )}
                      </Box>
                    </Box>
                  </Box>
                );
              })}

              {row.blocks.length < MAX_BLOCKS && (
                <Box sx={{ mt: 1 }}>
                  <Button size="small" startIcon={<Add />} onClick={() => addBlock(rowIdx)} variant="text">
                    Add Activity ({row.blocks.length}/{MAX_BLOCKS})
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Box sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<Add />} onClick={addEmptyRow}>
          Add row
        </Button>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
        <Button variant="contained" size="large" startIcon={<Save />}
          onClick={handleSubmit} disabled={submitting || !date}>
          {submitting ? <CircularProgress size={24} /> : 'Submit records'}
        </Button>
      </Box>

      <Dialog
        open={overlapDialog.open}
        onClose={() => setOverlapDialog({ open: false, overlaps: [], records: null, workerCount: 0 })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>These workers already have hours on this date</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            You can still submit. The operation manager will see a clash warning and can approve one set and reject the extra.
          </Alert>
          <List dense>
            {overlapDialog.overlaps.map((row) => (
              <ListItem key={row.workerId} disableGutters>
                <ListItemText
                  primary={row.workerName}
                  secondary={`Also submitted by ${row.otherSubmitterName} (${overlapStatusLabel(row.approvalStatus)})`}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverlapDialog({ open: false, overlaps: [], records: null, workerCount: 0 })}>
            Cancel
          </Button>
          <Button variant="contained" color="warning" onClick={confirmOverlapSubmit} disabled={submitting}>
            Submit anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
