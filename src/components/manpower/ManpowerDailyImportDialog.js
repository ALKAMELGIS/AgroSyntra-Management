import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, List, ListItem, ListItemText, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { canImportCorrectManpowerRecord } from '../../utils/roleAccess';
import {
  activityNameMapFromResolution,
  allUnmatchedResolved,
  attachWorkerIds,
  chunkItems,
  classifySheetActivities,
  formatImportDateSummary,
  mappingsPayload,
  normalizeActivityAliasKey,
  recordsPayloadFromBlocks,
  reviewDailyImport,
  uniqueSheetActivities,
  updatesPayloadFromBlocks,
} from '../../utils/manpowerDailyExcel';
import { loadDailyImportFiles } from '../../utils/manpowerDailyZip';

async function fetchAllWorkers() {
  return apiRequest('/manpower/workers?active_only=false') || [];
}

async function fetchExistingActivities(dates) {
  if (!dates?.length) return [];
  const sorted = [...dates].filter(Boolean).sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  return apiRequest(
    `/manpower/admin/records/worker-dates?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`,
  ) || [];
}

function previewList(items, labelFn, max = 8) {
  const shown = items.slice(0, max).map(labelFn);
  if (items.length > max) shown.push(`…and ${items.length - max} more`);
  return shown;
}

function emptyChoice(suggestedName) {
  if (suggestedName) {
    return { action: 'connect', catalogName: suggestedName };
  }
  return { action: '', catalogName: '' };
}

export default function ManpowerDailyImportDialog({
  source,
  open,
  onClose,
  activeSiteId,
  onImported,
}) {
  const notify = useNotification();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [existingActivities, setExistingActivities] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [userMappings, setUserMappings] = useState({});
  const [progress, setProgress] = useState(null);
  const [failedFiles, setFailedFiles] = useState([]);
  const [zipWarning, setZipWarning] = useState('');
  const [fileCount, setFileCount] = useState(1);

  useEffect(() => {
    if (!open || !source?.files?.length) {
      setParsed(null);
      setWorkers([]);
      setExistingActivities([]);
      setError('');
      setUserMappings({});
      setProgress(null);
      setFailedFiles([]);
      setZipWarning('');
      setFileCount(1);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      setParsed(null);
      setUserMappings({});
      setProgress(null);
      setFailedFiles([]);
      setZipWarning('');
      try {
        const loaded = await loadDailyImportFiles(source.files, (next) => {
          if (!cancelled) setProgress(next);
        });
        if (loaded.error && !loaded.parsed) {
          if (!cancelled) setError(loaded.error);
          return;
        }
        const nextParsed = loaded.parsed;
        const [nextWorkers, nextExisting, activities, savedAliases] = await Promise.all([
          fetchAllWorkers(),
          fetchExistingActivities(nextParsed.dates),
          apiRequest('/manpower/admin/activities').catch(() => []),
          apiRequest('/manpower/admin/activity-aliases').catch(() => []),
        ]);
        if (!cancelled) {
          setCatalog(activities || []);
          setAliases(savedAliases || []);
          setWorkers(nextWorkers || []);
          setExistingActivities(nextExisting || []);
          setFailedFiles(loaded.failedFiles || []);
          setZipWarning(loaded.warning || '');
          setFileCount(loaded.fileCount || nextParsed.fileCount || 1);
          setParsed(nextParsed);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not read this Excel file.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, source, activeSiteId]);

  const classified = useMemo(() => {
    if (!parsed) return { matched: [], unmatched: [] };
    return classifySheetActivities({
      sheetActivities: uniqueSheetActivities(parsed.blocks),
      catalog,
      aliases,
    });
  }, [parsed, catalog, aliases]);

  const nameMap = useMemo(
    () => activityNameMapFromResolution(classified.matched, userMappings),
    [classified, userMappings],
  );

  const review = useMemo(() => {
    if (!parsed) return null;
    return reviewDailyImport({
      parsed,
      existingWorkers: workers,
      existingActivities,
      activityNameMap: nameMap,
      activeSiteId,
    });
  }, [parsed, workers, existingActivities, nameMap, activeSiteId]);

  useEffect(() => {
    if (!classified.unmatched.length) return;
    setUserMappings((prev) => {
      const next = { ...prev };
      classified.unmatched.forEach((item) => {
        const key = normalizeActivityAliasKey(item.sourceName);
        if (!next[key]?.action) {
          next[key] = emptyChoice(item.suggestedName);
        }
      });
      return next;
    });
  }, [classified]);

  const persistMappings = useMemo(
    () => mappingsPayload(classified.matched, classified.unmatched, userMappings),
    [classified, userMappings],
  );
  const unmatchedReady = allUnmatchedResolved(classified.unmatched, userMappings);
  const hasInserts = Boolean(review?.importableBlocks.length);
  const hasUpdates = Boolean(review?.updatableBlocks.length);
  const hasMappingWork = persistMappings.length > 0;

  const handleClose = () => {
    if (importing) return;
    onClose();
  };

  const canConfirm = Boolean(
    review
    && unmatchedReady
    && !review.needsSiteForNewWorkers
    && !importing
    && (hasInserts || hasUpdates || hasMappingWork),
  );

  const setChoice = (sourceName, patch) => {
    const key = normalizeActivityAliasKey(sourceName);
    setUserMappings((prev) => {
      const current = prev[key] || emptyChoice('');
      return { ...prev, [key]: { ...current, ...patch } };
    });
  };

  const handleConfirm = async () => {
    if (!parsed || !review) return;
    setImporting(true);
    setError('');
    try {
      let mappingResult = { recordsUpdated: 0, created: [], aliasesSaved: 0 };
      if (persistMappings.length > 0) {
        mappingResult = await apiRequest('/manpower/admin/activity-import-mappings', {
          method: 'POST',
          body: JSON.stringify({ mappings: persistMappings }),
        }) || mappingResult;
      }
      if (review.newWorkers.length > 0) {
        await apiRequest('/manpower/workers/bulk', {
          method: 'POST',
          body: JSON.stringify({
            workers: review.newWorkers,
            siteId: activeSiteId || undefined,
          }),
        });
      }
      const [freshWorkers, freshExisting] = await Promise.all([
        fetchAllWorkers(),
        fetchExistingActivities(parsed.dates),
      ]);
      const rematch = reviewDailyImport({
        parsed,
        existingWorkers: freshWorkers,
        existingActivities: freshExisting,
        activityNameMap: nameMap,
        activeSiteId,
      });
      let inserted = 0;
      let hoursUpdated = 0;
      let sentForApproval = 0;
      let failedChunks = 0;
      let lastChunkError = '';

      // Hours corrections only on the importer's own pending / Excel-imported
      // records (the API refuses the rest: approved typed days and other
      // people's records need a change request). Skip and report those.
      const existingById = new Map((freshExisting || []).map((rec) => [rec.id, rec]));
      const candidateUpdates = updatesPayloadFromBlocks(rematch.updatableBlocks).filter((row) => row.id);
      const updateRecords = candidateUpdates.filter(
        (row) => canImportCorrectManpowerRecord(user, existingById.get(row.id)),
      );
      const lockedUpdates = candidateUpdates.length - updateRecords.length;
      for (const chunk of chunkItems(updateRecords, 400)) {
        try {
          const result = await apiRequest('/manpower/admin/records/bulk-update', {
            method: 'POST',
            body: JSON.stringify({ records: chunk }),
          });
          hoursUpdated += Number(result?.updated) || chunk.length;
          sentForApproval += Number(result?.sentForApproval) || 0;
        } catch (chunkErr) {
          failedChunks += 1;
          lastChunkError = chunkErr.message || 'Chunk update failed';
        }
      }

      if (rematch.importableBlocks.length > 0) {
        const attached = attachWorkerIds(rematch.importableBlocks, freshWorkers);
        if (attached.missing.length > 0) {
          throw new Error(`Could not match employee IDs after create: ${attached.missing.join(', ')}`);
        }
        const records = recordsPayloadFromBlocks(attached.records);
        for (const chunk of chunkItems(records, 400)) {
          try {
            await apiRequest('/manpower/admin/records/import', {
              method: 'POST',
              body: JSON.stringify({ records: chunk }),
            });
            inserted += chunk.length;
          } catch (chunkErr) {
            failedChunks += 1;
            lastChunkError = chunkErr.message || 'Chunk import failed';
          }
        }
      }

      const intendedWrites = rematch.importableBlocks.length + updateRecords.length;
      if (intendedWrites > 0 && inserted === 0 && hoursUpdated === 0) {
        throw new Error(lastChunkError || 'Import failed');
      }

      const renamed = mappingResult.recordsUpdated || 0;
      const parts = [];
      if (inserted) parts.push(`Imported ${inserted} activities`);
      if (hoursUpdated) parts.push(`updated hours on ${hoursUpdated}`);
      if (sentForApproval) {
        parts.push(t('dataEntryAccess.manpowerCorrectionsSentForApproval', { count: sentForApproval }));
      }
      if (lockedUpdates) parts.push(t('dataEntryAccess.manpowerCorrectionsSkipped', { count: lockedUpdates }));
      if (review.newWorkers.length) parts.push(`added ${review.newWorkers.length} workers`);
      if (rematch.skippedExisting.length) {
        parts.push(`skipped ${rematch.skippedExisting.length} duplicate activities in this import`);
      }
      if (renamed) parts.push(`renamed ${renamed} existing records`);
      if (mappingResult.created?.length) {
        parts.push(`created ${mappingResult.created.length} catalog ${mappingResult.created.length === 1 ? 'activity' : 'activities'}`);
      }
      if (failedFiles.length) parts.push(`${failedFiles.length} file${failedFiles.length === 1 ? '' : 's'} failed to parse`);
      if (failedChunks) parts.push(`${failedChunks} chunk${failedChunks === 1 ? '' : 's'} failed`);
      notify.success(parts.join(', ') || 'Import complete.');
      if (failedChunks) {
        setError(lastChunkError || 'Some record chunks failed. Re-import to retry remaining activities.');
        onImported?.();
        return;
      }
      onImported?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const catalogNames = (catalog || []).map((row) => row.name).filter(Boolean);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import daily manpower</DialogTitle>
      <DialogContent>
        {source?.label && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {source.label}
          </Typography>
        )}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 1 }}>
            <CircularProgress size={28} />
            {progress?.total > 1 && (
              <Typography variant="body2" color="text.secondary">
                Reading {progress.current} / {progress.total}
              </Typography>
            )}
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!loading && review && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2">
              Date{review.dates.length === 1 ? '' : 's'}: <strong>{formatImportDateSummary(review.dates, fileCount)}</strong>
              {fileCount === 1 && review.sheetName ? ` · sheet ${review.sheetName}` : ''}
            </Typography>
            {zipWarning && <Alert severity="warning">{zipWarning}</Alert>}
            {failedFiles.length > 0 && (
              <Alert severity="warning">
                {failedFiles.length} file{failedFiles.length === 1 ? '' : 's'} in this import could not be parsed. The rest will still import.
                <List dense disablePadding>
                  {previewList(failedFiles, (item) => (
                    `${item.name}: ${item.reason}`
                  )).map((label) => (
                    <ListItem key={label} disableGutters sx={{ py: 0 }}>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={label} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {review.importableBlocks.length > 0 && (
                <Chip size="small" label={`${review.importableBlocks.length} to add`} color="primary" />
              )}
              {review.updatableBlocks.length > 0 && (
                <Chip size="small" label={`${review.updatableBlocks.length} to update`} color="secondary" />
              )}
              <Chip size="small" label={`${review.workerCount} workers in file`} />
              {fileCount > 1 && (
                <Chip size="small" label={`${fileCount} files`} />
              )}
              {review.generalBlockCount > 0 && (
                <Chip size="small" label={`${review.generalBlockCount} general (no crop)`} />
              )}
            </Box>
            {(review.newCasualCount > 0 || review.newPermanentCount > 0) && (
              <Alert severity="info">
                Will add {review.newWorkers.length} workers
                {review.newCasualCount ? ` · ${review.newCasualCount} Casual` : ''}
                {review.newPermanentCount ? ` · ${review.newPermanentCount} Permanent (EAG)` : ''}
                . Data entry can deactivate people who have left.
              </Alert>
            )}
            {review.needsSiteForNewWorkers && (
              <Alert severity="warning">Choose an active site before importing new workers.</Alert>
            )}
            {classified.unmatched.length > 0 && (
              <Alert severity="warning" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  {classified.unmatched.length} sheet
                  {classified.unmatched.length === 1 ? ' activity does' : ' activities do'} not match the app.
                  Connect to the correctly spelled catalog name, or create a new activity (the operation manager can set the target later on Reference).
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {classified.unmatched.map((item) => {
                    const key = normalizeActivityAliasKey(item.sourceName);
                    const choice = userMappings[key] || emptyChoice(item.suggestedName);
                    return (
                      <Box
                        key={key}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          p: 1.25,
                          borderRadius: 1,
                          bgcolor: 'background.paper',
                        }}
                      >
                        <Typography variant="body2">
                          Sheet: <strong>{item.sourceName}</strong>
                          {item.suggestedName ? ` · suggested “${item.suggestedName}”` : ''}
                        </Typography>
                        <ToggleButtonGroup
                          exclusive
                          size="small"
                          value={choice.action || null}
                          onChange={(_event, value) => {
                            if (!value) return;
                            if (value === 'connect') {
                              setChoice(item.sourceName, {
                                action: 'connect',
                                catalogName: choice.catalogName || item.suggestedName || '',
                              });
                              return;
                            }
                            setChoice(item.sourceName, {
                              action: 'create',
                              catalogName: choice.action === 'create' ? choice.catalogName : item.sourceName,
                            });
                          }}
                        >
                          <ToggleButton value="connect">Connect</ToggleButton>
                          <ToggleButton value="create">Create new</ToggleButton>
                        </ToggleButtonGroup>
                        {choice.action === 'connect' && (
                          <Autocomplete
                            size="small"
                            options={catalogNames}
                            value={choice.catalogName || null}
                            onChange={(_event, value) => setChoice(item.sourceName, {
                              action: 'connect',
                              catalogName: value || '',
                            })}
                            renderInput={(params) => (
                              <TextField {...params} label="Catalog activity" placeholder="Choose the correct spelling" />
                            )}
                          />
                        )}
                        {choice.action === 'create' && (
                          <TextField
                            size="small"
                            label="New activity name"
                            value={choice.catalogName}
                            onChange={(event) => setChoice(item.sourceName, {
                              action: 'create',
                              catalogName: event.target.value,
                            })}
                            helperText="Added to the catalog. Set the Workers count column and Reference target later."
                          />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Alert>
            )}
            {review.skippedExisting.length > 0 && (
              <Alert severity="warning">
                Skipping {review.skippedExisting.length} worker-day
                {review.skippedExisting.length === 1 ? '' : 's'} duplicated in this import.
                The first file keeps those hours.
                <List dense disablePadding>
                  {previewList(review.skippedExisting, (item) => (
                    `${item.employeeId} ${item.name} (${item.recordDate})${item.sourceFile ? ` · ${item.sourceFile}` : ''}${item.reason ? ` · ${item.reason}` : ''}`
                  )).map((label) => (
                    <ListItem key={label} disableGutters sx={{ py: 0 }}>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={label} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            {review.nameMismatches.length > 0 && (
              <Alert severity="warning">
                Employee ID already exists under a different name. Records will attach to the person in the app; names are not changed.
                <List dense disablePadding>
                  {previewList(review.nameMismatches, (item) => (
                    `ID ${item.employeeId}: file “${item.excelName}” / app “${item.appName}”`
                  )).map((label) => (
                    <ListItem key={label} disableGutters sx={{ py: 0 }}>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={label} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            {review.siteMismatches.length > 0 && (
              <Alert severity="warning">
                {review.siteMismatches.length} existing worker
                {review.siteMismatches.length === 1 ? '' : 's'} belong to another site.
                Their site is not changed; hours will show on their home site.
              </Alert>
            )}
            {review.incomplete.length > 0 && (
              <Alert severity="warning">
                {review.incomplete.length} incomplete block
                {review.incomplete.length === 1 ? '' : 's'} skipped (need location, section, and times).
                <List dense disablePadding>
                  {previewList(review.incomplete, (item) => (
                    `${item.sourceFile ? `${item.sourceFile} · ` : ''}Row ${item.rowIndex}${item.employeeId ? ` · ${item.employeeId}` : ''}: ${item.reason}`
                  )).map((label) => (
                    <ListItem key={label} disableGutters sx={{ py: 0 }}>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={label} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            {review.unmatched.length > 0 && (
              <Alert severity="warning">
                {review.unmatched.length} worker
                {review.unmatched.length === 1 ? '' : 's'} could not be matched.
                <List dense disablePadding>
                  {previewList(review.unmatched, (item) => (
                    `${item.name || item.employeeId}: ${item.reason}`
                  )).map((label) => (
                    <ListItem key={label} disableGutters sx={{ py: 0 }}>
                      <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={label} />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
            {review.importableBlocks.length === 0 && review.updatableBlocks.length === 0 && !hasMappingWork && (
              <Alert severity="info">Nothing to import.</Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={importing}>Cancel</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
          {importing ? 'Importing…' : hasInserts || hasUpdates ? 'Import' : 'Apply mappings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
