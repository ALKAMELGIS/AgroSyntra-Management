import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Divider,
  Stack,
} from '@mui/material';
import {
  SearchOutlined as SearchIcon,
  PrintOutlined as PrintIcon,
  AgricultureOutlined as AgricultureIcon,
  GroupsOutlined as GroupsIcon,
  PestControlOutlined as PestControlIcon,
  AssignmentOutlined as AssignmentIcon,
} from '@mui/icons-material';
import api from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import InfoNote from '../../components/InfoNote';

// Unified with the app font (theme FONT_SANS via CSS variable).
const FONT = 'var(--font-sans, Inter, "IBM Plex Sans Arabic", system-ui, sans-serif)';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString();
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  return String(timeStr).slice(0, 5);
}

function asText(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function InfoRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.5 }}>
      <Typography variant="body2" sx={{ minWidth: 140, color: 'text.secondary', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="body2">{asText(value)}</Typography>
    </Box>
  );
}

function TraceMatchCard({ match, index, total }) {
  const { harvest, varieties, workforce, phiConflicts, scoutingReports } = match;
  const hasPhi = phiConflicts.length > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid #BDBDBD',
        borderRadius: 1,
        overflow: 'hidden',
        mb: 3,
        breakInside: 'avoid',
      }}
    >
      <Box sx={{ bgcolor: '#165c3a', color: '#fff', px: 2, py: 1.5 }}>
        <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 700, color: '#fff' }}>
          {total > 1 ? `Match ${index + 1} of ${total}` : 'Batch Trace Report'}
        </Typography>
        <Typography variant="body2" sx={{ color: '#fff', opacity: 0.85 }}>
          Batch {asText(harvest.batchNumber)} · {formatDate(harvest.date)} · {asText(harvest.fieldName)}
        </Typography>
      </Box>

      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <AgricultureIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Harvest Info</Typography>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1, mb: 2 }}>
          <InfoRow label="Harvest Date" value={formatDate(harvest.date)} />
          <InfoRow label="Field" value={harvest.fieldName} />
          <InfoRow label="Site" value={harvest.siteName} />
          <InfoRow label="Segment" value={harvest.segmentId} />
          <InfoRow label="Packhouse" value={harvest.packhouse} />
          <InfoRow label="Shift" value={harvest.shiftNumber} />
          <InfoRow label="Start Time" value={formatTime(harvest.startTime)} />
          <InfoRow label="End Time" value={formatTime(harvest.endTime)} />
          <InfoRow label="Authorized By" value={harvest.authorizedBy} />
          <InfoRow label="Total Quantity" value={harvest.totalQuantity} />
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Varieties</Typography>
        {varieties.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No variety lines recorded.</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.muted' }}>
                  <TableCell>Variety</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell>Grade</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {varieties.map((v) => (
                  <TableRow key={`${v.variety}-${v.grade ?? 'na'}`}>
                    <TableCell>{v.variety}</TableCell>
                    <TableCell align="right">{v.quantity}</TableCell>
                    <TableCell>{asText(v.grade)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <GroupsIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Workforce</Typography>
        </Stack>
        {workforce.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No matching manpower harvesting records for this field and date.
          </Typography>
        ) : (
          workforce.map((team) => (
            <Box key={team.teamLeaderId ?? 'no-leader'} sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Team Leader: {asText(team.teamLeaderName)}
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'background.muted' }}>
                      <TableCell>Worker</TableCell>
                      <TableCell>Employee ID</TableCell>
                      <TableCell>Section</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell align="right">Actual</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {team.workers.map((worker) => (
                      <TableRow key={`${worker.workerId}-${worker.startTime ?? 'na'}`}>
                        <TableCell>{worker.workerName}</TableCell>
                        <TableCell>{worker.employeeId}</TableCell>
                        <TableCell>{asText(worker.section)}</TableCell>
                        <TableCell>
                          {formatTime(worker.startTime)} – {formatTime(worker.endTime)}
                        </TableCell>
                        <TableCell align="right">{asText(worker.actual)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))
        )}

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <PestControlIcon color={hasPhi ? 'error' : 'success'} fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>PHI Status</Typography>
          {!hasPhi && <Chip size="small" label="No PHI conflict" color="success" variant="outlined" />}
        </Stack>
        {hasPhi ? (
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#ffebee' }}>
                  <TableCell>Product</TableCell>
                  <TableCell>Spray Date</TableCell>
                  <TableCell>PHI Days</TableCell>
                  <TableCell>PHI End</TableCell>
                  <TableCell>Days Violated</TableCell>
                  <TableCell>Segment</TableCell>
                  <TableCell>Operator</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {phiConflicts.map((conflict) => (
                  <TableRow key={conflict.applicationId}>
                    <TableCell>{conflict.productName}</TableCell>
                    <TableCell>{formatDate(conflict.sprayDate)}</TableCell>
                    <TableCell>{conflict.phiDays}</TableCell>
                    <TableCell>{formatDate(conflict.phiEndDate)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={conflict.daysViolated}
                        color={conflict.daysViolated > 3 ? 'error' : conflict.daysViolated >= 1 ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell>{asText(conflict.segmentId)}</TableCell>
                    <TableCell>{asText(conflict.operatorName)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No approved spray applications had an active PHI window on the harvest date.
          </Typography>
        )}

        {hasPhi && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <AssignmentIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Scouting Reports</Typography>
              <Chip size="small" label="PHI linked" color="warning" variant="outlined" />
            </Stack>
            {scoutingReports.length === 0 ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                PHI conflict detected but no scouting reports found for this field in the 30 days before harvest.
              </Alert>
            ) : (
              scoutingReports.map((report) => (
                <Paper key={report.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatDate(report.reportDate)} {report.reportTime ? `· ${formatTime(report.reportTime)}` : ''}
                    {report.scoutName ? ` · Scout: ${report.scoutName}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {asText(report.cropName)}{report.variety ? ` · ${report.variety}` : ''}
                  </Typography>
                  {report.comments && (
                    <Typography variant="body2" sx={{ mb: 1 }}>{report.comments}</Typography>
                  )}
                  {report.observations.length > 0 && (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Pest / Disease</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell align="right">%</TableCell>
                          <TableCell align="right">Avg</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {report.observations.map((obs) => (
                          <TableRow key={`${report.id}-${obs.pestName}-${obs.category}`}>
                            <TableCell>{obs.pestName}</TableCell>
                            <TableCell>{obs.category}</TableCell>
                            <TableCell align="right">{asText(obs.percent)}</TableCell>
                            <TableCell align="right">{asText(obs.average)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Paper>
              ))
            )}
          </>
        )}

        {harvest.notes && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Notes</Typography>
            <Typography variant="body2">{harvest.notes}</Typography>
          </>
        )}
      </Box>
    </Paper>
  );
}

export default function BatchTrace() {
  const notify = useNotification();
  const [batchNumber, setBatchNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState(null);
  const reportRef = useRef(null);

  const handleSearch = useCallback(async () => {
    const trimmed = batchNumber.trim();
    if (!trimmed) {
      notify.error('Enter a batch number to search.');
      return;
    }

    try {
      setLoading(true);
      setSearched(true);
      const res = await api.get(`/batch-trace?batch_number=${encodeURIComponent(trimmed)}`);
      setResult(res.data?.data ?? res.data);
    } catch (err) {
      notify.error(err.message || 'Failed to trace batch number.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [batchNumber, notify]);

  const handlePrint = () => {
    window.print();
  };

  const matches = result?.matches ?? [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, fontFamily: FONT }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #batch-trace-report, #batch-trace-report * { visibility: visible; }
          #batch-trace-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <Box className="no-print" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          Batch Trace
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Trace harvest, workforce, PHI, and scouting data from a batch number for complaint investigation.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
          <TextField
            label="Batch Number"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            size="small"
            sx={{ minWidth: 280 }}
            autoFocus
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            onClick={handleSearch}
            disabled={loading}
          >
            Search
          </Button>
          {matches.length > 0 && (
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>
              Print / Export
            </Button>
          )}
        </Stack>
      </Box>

      <Box id="batch-trace-report" ref={reportRef}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && searched && matches.length === 0 && (
          <InfoNote mode="line" severity="info">
            No harvest records found for batch number &quot;{batchNumber.trim()}&quot;.
          </InfoNote>
        )}

        {!loading && matches.length > 0 && (
          <>
            <Box className="no-print" sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Found {matches.length} harvest record{matches.length === 1 ? '' : 's'} for batch {result.batchNumber}.
              </Typography>
            </Box>
            {matches.map((match, index) => (
              <TraceMatchCard
                key={match.harvest.id}
                match={match}
                index={index}
                total={matches.length}
              />
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
