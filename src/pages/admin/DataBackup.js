import { useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Alert, Chip, Divider, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  DownloadOutlined as Download, StorageOutlined as Storage, CloudDoneOutlined as CloudDone, CloudUploadOutlined as CloudUpload, CloudOffOutlined as CloudOff, PlayArrow, WarningOutlined as Warning, BugReportOutlined as BugReport, InventoryOutlined as Inventory,
  RestoreOutlined as Restore,
} from '@mui/icons-material';

import { API_BASE, getAuthHeaders } from '../../config/api';
import api from '../../utils/api';
import InfoNote from '../../components/InfoNote';

// Remembers the last time a CSV backup was downloaded so we can nudge the
// user if too much time has passed. Prototype-level mitigation for the
// single-instance Postgres risk: even if the DB evaporates, a weekly
// offline CSV means at most one week of data is lost.
const CSV_REMINDER_KEY = 'alMaha.lastCsvBackupAt';
const CSV_REMINDER_THRESHOLD_DAYS = 7;

function daysSince(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

export default function DataBackup() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [backupStatus, setBackupStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [runningBackup, setRunningBackup] = useState(false);

  const [observability, setObservability] = useState(null);
  const [lastCsvAt, setLastCsvAt] = useState(() => {
    try { return localStorage.getItem(CSV_REMINDER_KEY); } catch { return null; }
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/backup/status');
        setBackupStatus(res.data?.data || res.data);
      } catch (err) {
        // 403 for non-CEO — hide the off-site section rather than erroring.
        if (err?.response?.status !== 403) {
          setStatusError(err.message || 'Could not load backup status');
        }
      }
    })();

    (async () => {
      try {
        const res = await api.get('/admin/observability');
        setObservability(res.data?.data || res.data);
      } catch {
        // Non-CEO or endpoint missing — ok, we just hide the card.
      }
    })();
  }, []);

  const handleFullBackup = async () => {
    setDownloading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE}/export/full-backup`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?(.+?)"?$/);
      a.download = match ? match[1] : `al-maha-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      try { localStorage.setItem(CSV_REMINDER_KEY, now); } catch { /* private mode */ }
      setLastCsvAt(now);
      setSuccess('Backup downloaded successfully');
    } catch (err) {
      setError(err.message || 'Backup failed');
    } finally {
      setDownloading(false);
    }
  };

  // ---- Import (restore) state ----
  const importInputRef = useRef(null);
  const [importFile, setImportFile] = useState(null);
  const [importPlan, setImportPlan] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resetImport = () => {
    setImportFile(null);
    setImportPlan(null);
    setImportError('');
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const pickImportFile = (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setImportFile(f);
    setImportPlan(null);
    setImportError('');
  };

  const postImport = async (dryRun) => {
    if (!importFile) return null;
    setImportBusy(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('file', importFile, importFile.name);
      const res = await fetch(`${API_BASE}/export/import-backup?dryRun=${dryRun}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || 'Import failed');
      }
      return json.data;
    } catch (err) {
      setImportError(err.message || 'Import failed');
      return null;
    } finally {
      setImportBusy(false);
    }
  };

  const handleDryRun = async () => {
    const data = await postImport(true);
    if (data) setImportPlan(data);
  };

  const handleConfirmRestore = async () => {
    setConfirmOpen(false);
    const data = await postImport(false);
    if (data) {
      setImportPlan(data);
      setSuccess(
        `Restore complete — ${data.summary.newRows} row(s) inserted across ${data.summary.tables} table(s). ${data.summary.skippedExistingRows} existing row(s) left untouched.`,
      );
    }
  };

  const handleRunS3Backup = async () => {
    setRunningBackup(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/admin/backup/run');
      const filename = res.data?.data?.filename || res.data?.filename;
      setSuccess(
        filename
          ? `Off-site backup uploaded: ${filename}`
          : 'Off-site backup completed',
      );
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Off-site backup failed');
    } finally {
      setRunningBackup(false);
    }
  };

  const tables = [
    'Zones', 'Sites', 'Farm Areas', 'Crops & Varieties', 'Fields',
    'Recipes & Fertilizers', 'Harvests', 'Fertigation Entries',
    'EC/PH Entries & Valve Readings', 'Tasks', 'Workers',
    'Manpower Records & Activities', 'Users',
  ];

  const offsiteConfigured = backupStatus?.configured === true;
  const csvAgeDays = daysSince(lastCsvAt);
  const csvOverdue = csvAgeDays === null || csvAgeDays >= CSV_REMINDER_THRESHOLD_DAYS;

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>Data Backup</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Protect your farm data with multiple backup methods.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {statusError && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setStatusError('')}>{statusError}</Alert>}

      {/* Weekly CSV reminder — prototype-scale DR mitigation */}
      {csvOverdue && (
        <Alert
          severity={csvAgeDays === null ? 'info' : 'warning'}
          icon={<Warning />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={handleFullBackup} disabled={downloading}>
              Download now
            </Button>
          }
        >
          {csvAgeDays === null
            ? 'No CSV backup has been downloaded yet from this browser. Consider downloading one weekly.'
            : `Last CSV download was ${csvAgeDays} day${csvAgeDays === 1 ? '' : 's'} ago. Aim for at least one offline copy every week.`}
        </Alert>
      )}

      {/* Observability status card — CEO-only. Shows at a glance which
          production-safety integrations are live. */}
      {observability && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <BugReport color="primary" sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h6" fontWeight={600}>Production safety status</Typography>
              <Typography variant="body2" color="text.secondary">
                Which hardening integrations are configured right now.
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 160 }}>
                <strong>Error tracking</strong> (Sentry)
              </Typography>
              <Chip
                size="small"
                label={observability.sentry?.configured ? 'Configured' : 'Not configured'}
                color={observability.sentry?.configured ? 'success' : 'warning'}
              />
              {!observability.sentry?.configured && (
                <Typography variant="caption" color="text.secondary">
                  Set <code>SENTRY_DSN</code> on the backend service.
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 160 }}>
                <strong>Photo / file storage</strong>
              </Typography>
              <Chip
                size="small"
                label={(() => {
                  // Be explicit about which adapter is live so the operator
                  // can immediately tell what surfaces their photo bytes.
                  const provider = observability.storage?.provider;
                  if (provider === 'db') return 'Postgres (persistent)';
                  if (provider === 's3') return 'S3 / R2 (persistent)';
                  return 'Local disk (wiped on redeploy)';
                })()}
                color={observability.storage?.persistent ? 'success' : 'warning'}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 160 }}>
                <strong>Off-site DB backup</strong>
              </Typography>
              <Chip
                size="small"
                label={observability.backup?.configured ? 'Configured' : 'Not configured'}
                color={observability.backup?.configured ? 'success' : 'warning'}
              />
            </Box>
          </Stack>
        </Paper>
      )}

      {/* CSV ZIP export (available to admins/managers who see this page) */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Storage color="primary" sx={{ fontSize: 40 }} />
          <Box>
            <Typography variant="h6" fontWeight={600}>CSV Export (ZIP)</Typography>
            <Typography variant="body2" color="text.secondary">
              All tables exported as CSV files in a single ZIP archive.
              Good for spreadsheet review or a quick manual snapshot.
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" color="text.secondary" mb={1}>Included tables:</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 3 }}>
          {tables.map((t) => <Chip key={t} label={t} size="small" variant="outlined" />)}
        </Box>

        <Button
          variant="contained"
          size="large"
          startIcon={downloading ? <CircularProgress size={20} color="inherit" /> : <Download />}
          onClick={handleFullBackup}
          disabled={downloading}
          fullWidth
        >
          {downloading ? 'Preparing backup...' : 'Download CSV Backup'}
        </Button>
      </Paper>

      {/* Off-site pg_dump → S3 — CEO only */}
      {backupStatus && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            {offsiteConfigured
              ? <CloudUpload color="success" sx={{ fontSize: 40 }} />
              : <CloudOff color="disabled" sx={{ fontSize: 40 }} />}
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={600}>
                Off-site Database Backup
                {offsiteConfigured && (
                  <Chip
                    label="Active"
                    color="success"
                    size="small"
                    sx={{ ml: 1, verticalAlign: 'middle' }}
                  />
                )}
                {!offsiteConfigured && (
                  <Chip
                    label="Not configured"
                    color="warning"
                    size="small"
                    sx={{ ml: 1, verticalAlign: 'middle' }}
                  />
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Full <code>pg_dump</code> snapshot streamed directly to S3.
                This is the recommended way to recover from a Railway outage
                or accidental data loss.
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          {offsiteConfigured ? (
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Schedule:</strong> {backupStatus.scheduleDescription}
              </Typography>
              <Typography variant="body2">
                <strong>Retention:</strong> {backupStatus.retentionDays} days
              </Typography>
              <Typography variant="body2">
                <strong>Bucket:</strong> <code>{backupStatus.bucketMasked}</code>
              </Typography>
            </Stack>
          ) : (
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                Ask your deployer to set these environment variables on the backend service:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                <li><code>BACKUP_S3_BUCKET</code> — bucket name (S3 or R2)</li>
                <li>
                  <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code>
                  {' '}— credentials
                </li>
                <li><code>BACKUP_RETENTION_DAYS</code> (optional, default 30)</li>
              </Box>
              <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                For Cloudflare R2 (recommended for prototypes — free tier):
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                <li><code>BACKUP_S3_ENDPOINT</code>=<code>https://&lt;accountid&gt;.r2.cloudflarestorage.com</code></li>
                <li><code>BACKUP_S3_FORCE_PATH_STYLE</code>=<code>true</code></li>
                <li><code>AWS_REGION</code>=<code>auto</code></li>
              </Box>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Once set, a nightly backup runs at <strong>02:00 UTC</strong> automatically,
                and you'll be able to trigger one manually from this page.
              </Typography>
            </InfoNote>
          )}

          <Button
            variant="contained"
            color="secondary"
            startIcon={runningBackup ? <CircularProgress size={20} color="inherit" /> : <PlayArrow />}
            onClick={handleRunS3Backup}
            disabled={runningBackup || !offsiteConfigured}
            fullWidth
          >
            {runningBackup ? 'Running backup…' : 'Run off-site backup now'}
          </Button>
        </Paper>
      )}

      <Paper sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <CloudDone color="success" />
        <Box>
          <Typography variant="body2" fontWeight={600}>Railway Database Snapshots</Typography>
          <Typography variant="caption" color="text.secondary">
            Railway also maintains automatic volume snapshots for your Postgres service.
            The CSV export above and the off-site pg_dump are additional layers of
            defence so you always have an independent copy.
          </Typography>
        </Box>
      </Paper>

      {/* Short restore runbook — stored here so whoever has access to
          backups also has documented recovery steps right next to them. */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Inventory color="primary" />
          <Typography variant="h6" fontWeight={600}>Restore runbook</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Scenario 1 — <strong>Accidental delete of a few rows</strong>:
          restore from the Railway Postgres snapshot (Railway → Postgres → Backups → Restore).
          Don't restore the whole DB; instead spin up a second Postgres from the snapshot
          and <code>pg_dump</code> just the affected tables back into production.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Scenario 2 — <strong>Railway outage / project corruption</strong>:
          if off-site backup is configured, download the latest <code>.sql.gz</code>
          from your S3/R2 bucket, then run{' '}
          <code>gunzip -c dump.sql.gz | psql "$NEW_DATABASE_URL"</code> against a fresh Postgres.
          Redeploy the backend pointed at the new DB.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Scenario 3 — <strong>No off-site backup, no snapshot</strong>:
          import the weekly CSV ZIP (above) into a fresh database using the
          <strong> Import CSV backup</strong> card below. You lose up to 7 days
          of entries — which is why the weekly reminder banner above matters.
        </Typography>
      </Paper>

      {/* CSV backup import — disaster recovery tool. CEO-only on the backend. */}
      <Paper sx={{ p: 3, mt: 3, borderTop: '3px solid', borderColor: 'warning.main' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Restore color="warning" sx={{ fontSize: 40 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={600}>Import CSV backup</Typography>
            <Typography variant="body2" color="text.secondary">
              Re-hydrate a ZIP produced by <code>Download CSV Backup</code> above
              into this database. Strictly additive — rows whose <code>id</code> already
              exists are left untouched.
            </Typography>
          </Box>
        </Box>

        <Alert severity="warning" sx={{ mb: 2 }}>
          This is a disaster-recovery tool. Always run a <strong>Dry run</strong> first
          to preview what would change, then execute the real restore.
        </Alert>

        {importError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportError('')}>
            {importError}
          </Alert>
        )}

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            component="label"
            startIcon={<CloudUpload />}
            disabled={importBusy}
          >
            {importFile ? 'Change file' : 'Choose ZIP file'}
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={pickImportFile}
            />
          </Button>
          {importFile && (
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {importFile.name} ({(importFile.size / (1024 * 1024)).toFixed(1)} MB)
            </Typography>
          )}
          {importFile && !importBusy && (
            <Button size="small" onClick={resetImport}>Clear</Button>
          )}
        </Stack>

        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            color="primary"
            disabled={!importFile || importBusy}
            onClick={handleDryRun}
            startIcon={importBusy ? <CircularProgress size={18} /> : null}
          >
            Dry run
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!importPlan || importBusy || importPlan.dryRun === false}
            onClick={() => setConfirmOpen(true)}
          >
            Execute restore
          </Button>
        </Stack>

        {importPlan && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {importPlan.dryRun ? 'Preview (nothing changed):' : 'Restore result:'}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Table</TableCell>
                  <TableCell align="right">Rows in ZIP</TableCell>
                  <TableCell align="right">Already exist</TableCell>
                  <TableCell align="right">
                    {importPlan.dryRun ? 'Would insert' : 'Inserted'}
                  </TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {importPlan.plan.map((row) => (
                  <TableRow key={row.table}>
                    <TableCell>{row.table}</TableCell>
                    <TableCell align="right">{row.totalRows}</TableCell>
                    <TableCell align="right">{row.existingIds}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" label={row.newRows}
                        color={row.newRows > 0 ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="error">
                        {row.firstError || ''}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Totals — rows in ZIP: {importPlan.summary.totalRows} ·
              {' '}already in DB: {importPlan.summary.skippedExistingRows} ·
              {' '}{importPlan.dryRun ? 'would insert' : 'inserted'}: {importPlan.summary.newRows}
            </Typography>
          </Box>
        )}
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Execute restore?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            About to insert{' '}
            <strong>{importPlan?.summary.newRows ?? 0}</strong> new row(s) across{' '}
            <strong>{importPlan?.summary.tables ?? 0}</strong> table(s).
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Existing rows (matched by id) are <strong>not</strong> modified.
            This action is logged in the audit trail.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmRestore}
            disabled={importBusy}>
            Yes, restore now
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
