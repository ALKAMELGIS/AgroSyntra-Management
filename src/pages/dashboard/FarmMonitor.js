import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Chip, Grid, ToggleButton, ToggleButtonGroup,
  Typography, Tooltip, IconButton, CircularProgress,
} from '@mui/material';
import {
  BugReportOutlined as BugIcon,
  OpacityOutlined as SprayIcon,
  CloudQueueOutlined as CloudIcon,
  RefreshOutlined as RefreshIcon,
} from '@mui/icons-material';
import FieldWeatherStrip from '../../components/dashboard/FieldWeatherStrip';
import DashboardSection from '../../components/dashboard/DashboardSection';

function getEcPhColor(value, threshold) {
  if (value == null) return '#9e9e9e';
  if (!threshold) return '#9e9e9e';
  const v = Number(value);
  if (isNaN(v)) return '#9e9e9e';
  const wMin = threshold.warningMin != null ? Number(threshold.warningMin) : null;
  const wMax = threshold.warningMax != null ? Number(threshold.warningMax) : null;
  const cMin = threshold.criticalMin != null ? Number(threshold.criticalMin) : null;
  const cMax = threshold.criticalMax != null ? Number(threshold.criticalMax) : null;
  if (wMin == null && wMax == null && cMin == null && cMax == null) return '#9e9e9e';
  // Critical check first (red wins)
  if (cMin != null && v < cMin) return '#f44336';
  if (cMax != null && v > cMax) return '#f44336';
  // Warning check (yellow/orange)
  if (wMin != null && v < wMin) return '#ff9800';
  if (wMax != null && v > wMax) return '#ff9800';
  return '#4caf50';
}

function isStale(dateStr, refDate) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  const ref = refDate ? new Date(refDate) : new Date();
  return (ref - d) / (1000 * 60 * 60 * 24) > 3;
}

export default function FarmMonitor({
  fieldOverview,
  onFieldSelect,
  selectedFieldId,
  agronomicThresholds,
  onTabSwitch,
  dateTo,
  weatherByFieldId = {},
  weatherLoading = false,
  weatherFetching = false,
  onRefreshWeather,
}) {
  const navigate = useNavigate();
  const [fieldSummary, setFieldSummary] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');

  const fieldTypes = useMemo(() => {
    const types = new Set();
    (fieldOverview || []).forEach(f => { if (f.field_type_name) types.add(f.field_type_name); });
    return ['All', ...Array.from(types).sort()];
  }, [fieldOverview]);

  const visibleFields = useMemo(() => {
    if (!fieldOverview) return [];
    if (typeFilter === 'All') return fieldOverview;
    return fieldOverview.filter(f => f.field_type_name === typeFilter);
  }, [fieldOverview, typeFilter]);

  const thresholdMap = useMemo(() => {
    const map = {};
    (agronomicThresholds || []).forEach(t => {
      if (!map[t.cropId]) map[t.cropId] = {};
      map[t.cropId][t.parameter] = {
        warningMin: t.warningMin, warningMax: t.warningMax,
        criticalMin: t.criticalMin, criticalMax: t.criticalMax,
      };
    });
    return map;
  }, [agronomicThresholds]);

  const handleTypeChange = (_, value) => {
    if (!value) return;
    setTypeFilter(value);
    if (fieldSummary && value !== 'All' && fieldSummary.field_type_name !== value) {
      setFieldSummary(null);
      if (onFieldSelect) onFieldSelect(null);
    }
  };

  if (!fieldOverview || fieldOverview.length === 0) return null;

  return (
    <DashboardSection
      title="Farm Monitor"
      action={(
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {onRefreshWeather && (
            <Tooltip title="Refresh weather from OpenWeatherMap" arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={onRefreshWeather}
                  disabled={weatherFetching}
                  aria-label="Refresh weather"
                  sx={{ color: 'inherit' }}
                >
                  {weatherFetching ? (
                    <CircularProgress size={18} sx={{ color: 'inherit' }} />
                  ) : (
                    <RefreshIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
          {fieldTypes.length > 2 && (
            <ToggleButtonGroup
              value={typeFilter}
              exclusive
              onChange={handleTypeChange}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  color: 'inherit',
                  borderColor: 'rgba(255,255,255,0.35)',
                  textTransform: 'none',
                  px: 1.5,
                  py: 0.25,
                  fontSize: '0.75rem',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(255,255,255,0.22)',
                    color: 'inherit',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' },
                  },
                },
              }}
            >
              {fieldTypes.map((t) => (
                <ToggleButton key={t} value={t}>{t}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
        </Box>
      )}
    >
      <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f44336' }} />
            <Typography variant="caption" color="text.secondary">PHI (red &gt;1d / orange last day)</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <BugIcon sx={{ fontSize: 14, color: '#d32f2f' }} />
            <Typography variant="caption" color="text.secondary">Pest found</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <SprayIcon sx={{ fontSize: 14, color: '#1976d2' }} />
            <Typography variant="caption" color="text.secondary">Sprayed today</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4caf50', border: '1px solid #388e3c' }} />
            <Typography variant="caption" color="text.secondary">EC/pH normal</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ff9800', border: '1px solid #e65100' }} />
            <Typography variant="caption" color="text.secondary">EC/pH warning</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f44336', border: '1px solid #c62828' }} />
            <Typography variant="caption" color="text.secondary">EC/pH critical</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#9e9e9e', border: '1px solid #757575' }} />
            <Typography variant="caption" color="text.secondary">No data / not configured</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CloudIcon sx={{ fontSize: 14, color: '#0288d1' }} />
            <Typography variant="caption" color="text.secondary">Live weather (OpenWeather)</Typography>
          </Box>
        </Box>

      <Grid container spacing={1.5}>
        {visibleFields.map((field) => {
          const hasPHI = field.active_phi_count > 0;
          const refDateObj = dateTo ? new Date(dateTo) : new Date();
          const phiDays = hasPHI
            ? Math.max(0, Math.ceil((new Date(field.nearest_phi_end) - refDateObj) / (1000 * 60 * 60 * 24)))
            : 0;
          const phiEndingSoon = hasPHI && phiDays > 0 && phiDays <= 1;

          const hasUnresolvedPest = field.latest_scouting?.id && field.latest_scouting?.status !== 'resolved';
          const sprayedToday = !!field.spray_today;

          const cropThresholds = thresholdMap[field.current_crop_id] || {};
          const ecInThreshold = cropThresholds.ec_in || cropThresholds.ec;
          const ecOutThreshold = cropThresholds.ec_out || cropThresholds.ec;
          const phInThreshold = cropThresholds.ph_in || cropThresholds.ph;
          const phOutThreshold = cropThresholds.ph_out || cropThresholds.ph;

          const ecIn = field.latest_ecph?.ec_in;
          const ecOut = field.latest_ecph?.ec_out;
          const phIn = field.latest_ecph?.ph_in;
          const phOut = field.latest_ecph?.ph_out;
          const ecphDate = field.latest_ecph?.date;
          const stale = isStale(ecphDate, dateTo);

          const ecInColor = getEcPhColor(ecIn, ecInThreshold);
          const ecOutColor = getEcPhColor(ecOut, ecOutThreshold);
          const phInColor = getEcPhColor(phIn, phInThreshold);
          const phOutColor = getEcPhColor(phOut, phOutThreshold);

          const worstEc = (ecInColor === '#f44336' || ecOutColor === '#f44336') ? '#f44336'
            : (ecInColor === '#ff9800' || ecOutColor === '#ff9800') ? '#ff9800'
            : ecInColor;
          const worstPh = (phInColor === '#f44336' || phOutColor === '#f44336') ? '#f44336'
            : (phInColor === '#ff9800' || phOutColor === '#ff9800') ? '#ff9800'
            : phInColor;
          const ecColor = stale ? '#9e9e9e' : worstEc;
          const phColor = stale ? '#9e9e9e' : worstPh;

          const isAlert = (c) => c === '#f44336' || c === '#ff9800';
          const ecLabel = (isAlert(ecInColor) && isAlert(ecOutColor)) ? 'EC In/Out'
            : isAlert(ecInColor) ? 'EC In'
            : isAlert(ecOutColor) ? 'EC Out'
            : 'EC';
          const phLabel = (isAlert(phInColor) && isAlert(phOutColor)) ? 'pH In/Out'
            : isAlert(phInColor) ? 'pH In'
            : isAlert(phOutColor) ? 'pH Out'
            : 'pH';

          const selected = (selectedFieldId || fieldSummary?.id) === field.id;

          return (
            <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={field.id}>
              <Card
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'visible',
                  boxShadow: 'none',
                  borderWidth: 2,
                  borderColor: selected ? 'table.selection' : 'table.gridline',
                  bgcolor: selected ? 'table.selectionRange' : 'background.paper',
                  '&:hover': { borderColor: 'table.selection' },
                }}
                onClick={() => {
                  const deselect = (selectedFieldId || fieldSummary?.id) === field.id;
                  setFieldSummary(deselect ? null : field);
                  if (onFieldSelect) onFieldSelect(deselect ? null : field);
                }}
              >
                {/* PHI Ribbon(s) — per-segment when available */}
                {hasPHI && phiDays > 0 && (() => {
                  const details = field.active_phi_details || [];
                  const validDetails = details.filter(d => d && d.days > 0);
                  if (validDetails.length === 0) {
                    return (
                      <Box sx={{
                        position: 'absolute', top: -6, left: -6, zIndex: 1,
                        bgcolor: phiEndingSoon ? '#ff9800' : '#f44336',
                        color: '#fff', borderRadius: '4px',
                        px: 0.7, py: 0.2, fontSize: '0.6rem', fontWeight: 700,
                        lineHeight: 1.2, boxShadow: 1,
                      }}>
                        PHI {phiDays}d
                      </Box>
                    );
                  }
                  const allWholeField = validDetails.every(d => !d.segment);
                  if (allWholeField) {
                    return (
                      <Box sx={{
                        position: 'absolute', top: -6, left: -6, zIndex: 1,
                        bgcolor: phiEndingSoon ? '#ff9800' : '#f44336',
                        color: '#fff', borderRadius: '4px',
                        px: 0.7, py: 0.2, fontSize: '0.6rem', fontWeight: 700,
                        lineHeight: 1.2, boxShadow: 1,
                      }}>
                        PHI {phiDays}d
                      </Box>
                    );
                  }
                  return (
                    <Box sx={{
                      position: 'absolute', top: -6, left: -6, zIndex: 1,
                      display: 'flex', flexDirection: 'column', gap: '2px',
                    }}>
                      {validDetails.map((d, idx) => (
                        <Box key={idx} sx={{
                          bgcolor: d.days <= 1 ? '#ff9800' : '#f44336',
                          color: '#fff', borderRadius: '4px',
                          px: 0.7, py: 0.15, fontSize: '0.55rem', fontWeight: 700,
                          lineHeight: 1.2, boxShadow: 1, whiteSpace: 'nowrap',
                        }}>
                          {d.segment ? `${d.segment}: ${d.days}d` : `PHI ${d.days}d`}
                        </Box>
                      ))}
                    </Box>
                  );
                })()}

                {/* Top-right icons: Pest + Spray */}
                <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.3, zIndex: 2 }}>
                  {hasUnresolvedPest && (
                    <Tooltip title={`Pest: ${field.latest_scouting.pest || 'Unresolved'} (${field.latest_scouting.pct || 0}%)`} arrow>
                      <IconButton
                        size="small"
                        sx={{ p: 0.3 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ipm/scouting-reports?highlight=${field.latest_scouting.id}`);
                        }}
                      >
                        <BugIcon sx={{ fontSize: 16, color: '#ffcdd2' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {sprayedToday && (
                    <Tooltip title={`Sprayed: ${field.spray_today.product || 'Application'}`} arrow>
                      <IconButton
                        size="small"
                        sx={{ p: 0.3 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ipm/pesticide-applications?highlight=${field.spray_today.id}`);
                        }}
                      >
                        <SprayIcon sx={{ fontSize: 16, color: '#1976d2' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                <Box
                  sx={{
                    bgcolor: 'table.headerBg',
                    color: 'table.headerText',
                    px: 1.5,
                    py: 0.75,
                    pr: 4.5,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                  }}
                >
                  <Typography variant="subtitle2" noWrap fontWeight={700} sx={{ color: 'inherit' }}>
                    {field.name}
                  </Typography>
                </Box>

                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Chip
                    label={field.field_type_name || 'Field'}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: 10 }}
                  />
                  {field.crop_name && (
                    <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                      {field.crop_name}
                    </Typography>
                  )}
                  {field.last_bumble_bee_inspection && (
                    <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                      Bee insp: {field.last_bumble_bee_inspection.total_boxes ?? 0} boxes
                      {' · '}
                      {new Date(String(field.last_bumble_bee_inspection.inspection_date).split('T')[0]).toLocaleDateString()}
                    </Typography>
                  )}

                  {/* EC/pH indicator bars */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.8 }}>
                    <Tooltip title={ecIn != null || ecOut != null ? `EC In: ${ecIn != null ? Number(ecIn).toFixed(2) : '-'} | Out: ${ecOut != null ? Number(ecOut).toFixed(2) : '-'}` : 'No EC data'} arrow>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.3, cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onFieldSelect) onFieldSelect(field);
                          if (onTabSwitch) onTabSwitch(0);
                        }}
                      >
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ecColor, border: `1px solid ${ecColor === '#9e9e9e' ? '#757575' : ecColor === '#4caf50' ? '#388e3c' : ecColor === '#ff9800' ? '#e65100' : '#c62828'}` }} />
                        <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600, color: ecColor === '#f44336' ? '#c62828' : ecColor === '#ff9800' ? '#e65100' : 'text.secondary' }}>{ecLabel}</Typography>
                      </Box>
                    </Tooltip>
                    <Tooltip title={phIn != null || phOut != null ? `pH In: ${phIn != null ? Number(phIn).toFixed(2) : '-'} | Out: ${phOut != null ? Number(phOut).toFixed(2) : '-'}` : 'No pH data'} arrow>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.3, cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onFieldSelect) onFieldSelect(field);
                          if (onTabSwitch) onTabSwitch(0);
                        }}
                      >
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: phColor, border: `1px solid ${phColor === '#9e9e9e' ? '#757575' : phColor === '#4caf50' ? '#388e3c' : phColor === '#ff9800' ? '#e65100' : '#c62828'}` }} />
                        <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 600, color: phColor === '#f44336' ? '#c62828' : phColor === '#ff9800' ? '#e65100' : 'text.secondary' }}>{phLabel}</Typography>
                      </Box>
                    </Tooltip>
                  </Box>

                  <FieldWeatherStrip
                    weather={weatherByFieldId[field.id]}
                    loading={weatherLoading && !weatherByFieldId[field.id]}
                  />
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Field Summary Popup */}
      {fieldSummary && (
        <Card variant="outlined" sx={{ mt: 2, overflow: 'hidden', borderColor: 'table.gridline' }}>
          <Box
            sx={{
              bgcolor: 'table.headerBg',
              color: 'table.headerText',
              px: 2,
              py: 1,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'inherit' }}>
              {fieldSummary.name} Summary
            </Typography>
            <Chip
              label={fieldSummary.active_phi_count > 0 ? 'PHI Active' : 'Clear'}
              size="small"
              sx={{
                bgcolor: fieldSummary.active_phi_count > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.22)',
                color: 'inherit',
                fontWeight: 600,
              }}
            />
          </Box>
          <Box sx={{ p: 2 }}>
          {fieldSummary.active_phi_count > 0 && fieldSummary.nearest_phi_end && (
            <Typography variant="caption" display="block" color="error.main" sx={{ mb: 1.5, fontWeight: 600 }}>
              Clear to Harvest: {new Date(fieldSummary.nearest_phi_end).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </Typography>
          )}
          <Grid container spacing={3}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">EC In</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ec_in != null ? Number(fieldSummary.latest_ecph.ec_in).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">EC Out</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ec_out != null ? Number(fieldSummary.latest_ecph.ec_out).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">pH In</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ph_in != null ? Number(fieldSummary.latest_ecph.ph_in).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">pH Out</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ph_out != null ? Number(fieldSummary.latest_ecph.ph_out).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">Harvest (7d)</Typography>
              <Typography variant="body1" fontWeight={600}>{Number(fieldSummary.harvest_this_week || 0).toFixed(1)} kg</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">Water (7d)</Typography>
              <Typography variant="body1" fontWeight={600}>{Number(fieldSummary.water_this_week || 0).toFixed(1)} m3</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">Latest Scouting</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_scouting?.pest
                  ? `${fieldSummary.latest_scouting.pest} (${fieldSummary.latest_scouting.pct}%)`
                  : 'None'}
              </Typography>
            </Grid>
            {fieldSummary.last_bumble_bee_inspection && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Latest Bumble Bee Inspection</Typography>
                <Typography variant="body1" fontWeight={600}>
                  {new Date(String(fieldSummary.last_bumble_bee_inspection.inspection_date).split('T')[0]).toLocaleDateString()}
                  {' · '}
                  {fieldSummary.last_bumble_bee_inspection.total_boxes ?? 0} boxes
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  100%: {fieldSummary.last_bumble_bee_inspection.boxes_100 ?? 0}
                  {' · '}80%: {fieldSummary.last_bumble_bee_inspection.boxes_80 ?? 0}
                  {' · '}60%: {fieldSummary.last_bumble_bee_inspection.boxes_60 ?? 0}
                  {' · '}40%: {fieldSummary.last_bumble_bee_inspection.boxes_40 ?? 0}
                  {' · '}20%: {fieldSummary.last_bumble_bee_inspection.boxes_20 ?? 0}
                  {' · '}0%: {fieldSummary.last_bumble_bee_inspection.boxes_0 ?? 0}
                </Typography>
              </Grid>
            )}
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">Current Weather</Typography>
              <FieldWeatherStrip
                weather={weatherByFieldId[fieldSummary.id]}
                loading={weatherLoading && !weatherByFieldId[fieldSummary.id]}
                variant="detail"
              />
              {!weatherLoading && !weatherByFieldId[fieldSummary.id] && (
                <Typography variant="body2" color="text.secondary">No live weather (check coordinates or API key)</Typography>
              )}
            </Grid>
          </Grid>
          </Box>
        </Card>
      )}
      </Box>
    </DashboardSection>
  );
}
