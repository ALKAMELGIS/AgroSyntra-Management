import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Alert, CircularProgress, Paper, ButtonBase,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ShieldOutlined as PhiIcon, AgricultureOutlined as HarvestIcon,
  BugReportOutlined as PestIcon, WbSunnyOutlined as WeatherIcon,
  NotificationsActiveOutlined as AlertIcon, AssignmentOutlined as WorkOrderIcon,
  RateReviewOutlined as ReviewIcon,
} from '@mui/icons-material';
import { apiRequest } from '../utils/api';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import { excelTableSx, GutterCell } from '../components/table/ExcelTable';
import PageTitle from '../components/PageTitle';

const SEVERITY_COLORS = { critical: 'error', high: 'error', medium: 'warning', warning: 'warning', info: 'info' };

const WORK_ORDER_STATUS_LABELS = {
  issued: 'Awaiting operator',
  in_progress: 'In progress',
  completed: 'Awaiting approval',
};

function formatPhiEndDate(phiEndDate) {
  const d = new Date(phiEndDate);
  const dateStr = d.toLocaleDateString('en-GB');
  if (d.getHours() || d.getMinutes()) {
    return `${dateStr}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return dateStr;
}

function alertPath(alert) {
  switch (alert.entityType) {
    case 'ecph_reading':
      return '/ecph/reports';
    case 'harvest':
      return '/harvest/dashboard';
    case 'fertigation':
      return '/fertigation/dashboard';
    default:
      return '/notifications';
  }
}

function clickableRow(onClick) {
  return {
    onClick,
    sx: { cursor: 'pointer' },
  };
}

function BriefSection({ icon, title, count, children }) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', boxShadow: 1, height: '100%' }}>
      <Box
        sx={{
          px: { xs: 4, sm: 5 },
          py: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '& .MuiSvgIcon-root': { color: 'primary.main', fontSize: 20 },
        }}
      >
        {icon}
        <Typography component="h2" sx={{ flexGrow: 1, fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.01em' }}>
          {title}
        </Typography>
        {count != null && count !== '' && (
          <Chip size="small" label={count} sx={{ fontWeight: 600 }} />
        )}
      </Box>
      {children}
    </Paper>
  );
}

/** One "at a glance" number: icon, count and label; tinted and clickable when non-zero. */
function GlanceTile({ icon, value, label, tone, onClick }) {
  const active = Boolean(value);
  return (
    <ButtonBase
      onClick={active ? onClick : undefined}
      disabled={!active}
      sx={(t) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 3,
        p: 3.5,
        textAlign: 'start',
        borderRadius: 2,
        border: '1px solid',
        borderColor: active ? alpha(t.palette[tone].main, 0.35) : 'divider',
        bgcolor: active ? alpha(t.palette[tone].main, t.palette.mode === 'dark' ? 0.14 : 0.07) : 'background.paper',
        '&.Mui-disabled': { opacity: 1 },
        '&:hover': active ? { borderColor: `${tone}.main` } : undefined,
      })}
    >
      <Box
        sx={(t) => ({
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
          bgcolor: active ? alpha(t.palette[tone].main, 0.15) : 'action.hover',
          color: active ? `${tone}.main` : 'text.secondary',
          '& .MuiSvgIcon-root': { fontSize: 20 },
        })}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: active ? 'text.primary' : 'text.secondary' }}>
          {value || 0}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>{label}</Typography>
      </Box>
    </ButtonBase>
  );
}

function BriefEmpty({ children }) {
  return <Box sx={{ p: 2 }}>{children}</Box>;
}

function BriefTable({ children }) {
  return (
    <TableContainer>
      <Table size="small" sx={excelTableSx}>
        {children}
      </Table>
    </TableContainer>
  );
}

export default function DailyBrief() {
  const navigate = useNavigate();
  const readOnly = useReadOnlyMode(PAGE_KEYS.DAILY_BRIEF);
  const { activeSiteId, activeSite } = useActiveSite();
  const [data, setData] = useState(null);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const siteQuery = activeSiteId ? `?site_id=${activeSiteId}` : '';
        const [briefRes, weatherRes] = await Promise.allSettled([
          apiRequest(`/analytics/daily-brief${siteQuery}`),
          apiRequest(`/weather/current${siteQuery}`),
        ]);
        if (briefRes.status === 'fulfilled') setData(briefRes.value);
        if (weatherRes.status === 'fulfilled') setWeather(weatherRes.value);
      } catch { /* handled per-request */ }
      finally { setLoading(false); }
    };
    load();
  }, [activeSiteId]);

  const go = useCallback((path) => () => navigate(path), [navigate]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const summary = data?.summary || {};

  return (
    <Box>
      <PageTitle sx={{ mb: 0.5 }}>Daily Farm Brief</PageTitle>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>{today}</Typography>
      {activeSite?.name && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Site: <strong>{activeSite.name}</strong>
        </Typography>
      )}

      {readOnly && <Box sx={{ mb: 3 }}><ReadOnlyBanner message="View only — daily brief is read-only for your role." /></Box>}

      <Box
        component="section"
        aria-label="At a glance"
        sx={{ display: 'grid', gap: 3, mb: 5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, '& > :last-child': { gridColumn: { xs: '1 / -1', sm: 'auto' } } }}
      >
        <GlanceTile icon={<PhiIcon />} value={summary.phiBlocked} label="Fields blocked (PHI)" tone="error" onClick={go('/ipm/pesticide-applications')} />
        <GlanceTile icon={<PestIcon />} value={summary.pestAlerts} label="Pest alerts" tone="warning" onClick={go('/ipm/scouting-reports')} />
        <GlanceTile icon={<AlertIcon />} value={summary.recentAlerts} label="System alerts (48h)" tone="warning" onClick={go('/notifications')} />
        <GlanceTile icon={<ReviewIcon />} value={summary.pendingChangeRequests} label="Change requests" tone="info" onClick={go('/audit/change-requests')} />
        <GlanceTile icon={<WorkOrderIcon />} value={summary.openWorkOrders} label="Open work orders" tone="info" onClick={go('/ipm/pesticide-applications?tab=work-orders')} />
      </Box>

      <Box sx={{ display: 'grid', gap: 4, alignItems: 'stretch', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' } }}>
      <BriefSection icon={<PhiIcon />} title="Active PHI — Cannot Harvest" count={data?.phiFields?.length || 0}>
        {!data?.phiFields?.length ? (
          <BriefEmpty>
            <Alert severity="success" variant="outlined">No active PHI restrictions. All fields are clear for harvest.</Alert>
          </BriefEmpty>
        ) : (
          <BriefTable>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Field</TableCell>
                <TableCell>Zone</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>PHI Ends</TableCell>
                <TableCell>Days Left</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.phiFields.map((f, idx) => (
                <TableRow
                  key={f.applicationId || f.fieldId}
                  hover
                  {...clickableRow(go(`/ipm/pesticide-applications?applicationId=${f.applicationId}`))}
                >
                  <GutterCell index={idx + 1} />
                  <TableCell sx={{ fontWeight: 600 }}>{f.fieldName}</TableCell>
                  <TableCell>{f.zoneName || '-'}</TableCell>
                  <TableCell>{f.productName}</TableCell>
                  <TableCell>{formatPhiEndDate(f.phiEndDate)}</TableCell>
                  <TableCell>
                    <Chip
                      label={`${f.daysRemaining}d`}
                      color={f.daysRemaining <= 1 ? 'warning' : 'error'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </BriefTable>
        )}
      </BriefSection>

      {(data?.pendingChangeRequests?.length > 0) && (
        <BriefSection icon={<ReviewIcon />} title="Pending IPM Change Requests" count={data.pendingChangeRequests.length}>
          <BriefTable>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Action</TableCell>
                <TableCell>Requested by</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.pendingChangeRequests.map((cr, idx) => (
                <TableRow key={cr.id} hover {...clickableRow(go('/audit/change-requests'))}>
                  <GutterCell index={idx + 1} />
                  <TableCell sx={{ fontWeight: 600 }}>{cr.action}</TableCell>
                  <TableCell>{cr.requestedByName || '-'}</TableCell>
                  <TableCell>{new Date(cr.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </BriefTable>
        </BriefSection>
      )}

      {(data?.openWorkOrders?.length > 0) && (
        <BriefSection icon={<WorkOrderIcon />} title="Open Spray Work Orders" count={data.openWorkOrders.length}>
          <BriefTable>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>WO #</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell>Issued</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.openWorkOrders.map((wo, idx) => (
                <TableRow key={wo.id} hover {...clickableRow(go('/ipm/pesticide-applications?tab=work-orders'))}>
                  <GutterCell index={idx + 1} />
                  <TableCell sx={{ fontWeight: 600 }}>#{wo.workOrderNumber}</TableCell>
                  <TableCell>{wo.applicationType}</TableCell>
                  <TableCell>
                    <Chip
                      label={WORK_ORDER_STATUS_LABELS[wo.status] || wo.status}
                      size="small"
                      color={wo.status === 'completed' ? 'warning' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{wo.assignedToName || '-'}</TableCell>
                  <TableCell>{new Date(wo.dateIssued).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </BriefTable>
        </BriefSection>
      )}

      {(data?.recentAlerts?.length > 0) && (
        <BriefSection icon={<AlertIcon />} title="Recent System Alerts (48h)" count={data.recentAlerts.length}>
          <BriefTable>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Alert</TableCell>
                <TableCell>Field</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recentAlerts.map((a, idx) => (
                <TableRow key={a.id} hover {...clickableRow(go(alertPath(a)))}>
                  <GutterCell index={idx + 1} />
                  <TableCell sx={{ fontWeight: 600 }}>{a.title}</TableCell>
                  <TableCell>{a.fieldName || '-'}</TableCell>
                  <TableCell>
                    <Chip label={a.severity} color={SEVERITY_COLORS[a.severity] || 'default'} size="small" />
                  </TableCell>
                  <TableCell>{new Date(a.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </BriefTable>
        </BriefSection>
      )}

      <BriefSection
        icon={<HarvestIcon />}
        title="Yesterday's Harvest"
        count={`${(data?.yesterdayHarvest?.totalKg || 0).toLocaleString()} kg`}
      >
        {!data?.yesterdayHarvest?.byField?.length ? (
          <BriefEmpty>
            <Alert severity="info" variant="outlined">No harvest recorded yesterday{activeSite?.name ? ` at ${activeSite.name}` : ''}.</Alert>
          </BriefEmpty>
        ) : (
          <BriefTable>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Field</TableCell>
                <TableCell>Crop</TableCell>
                <TableCell>Zone</TableCell>
                <TableCell className="col-numeric">Quantity (kg)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.yesterdayHarvest.byField.map((h, idx) => (
                <TableRow
                  key={`${h.fieldName}-${h.zoneName}`}
                  hover
                  {...clickableRow(go('/harvest/dashboard'))}
                >
                  <GutterCell index={idx + 1} />
                  <TableCell sx={{ fontWeight: 600 }}>{h.fieldName}</TableCell>
                  <TableCell>{h.cropName || '-'}</TableCell>
                  <TableCell>{h.zoneName || '-'}</TableCell>
                  <TableCell className="col-numeric">{Number(h.totalKg).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </BriefTable>
        )}
      </BriefSection>

      <BriefSection icon={<WeatherIcon />} title="Weather Today">
        {!(weather && (weather.temperature != null || weather.humidity != null || weather.windSpeed != null || weather.description)) ? (
          <BriefEmpty>
            <Alert severity="info" variant="outlined">No weather data available. Connect a weather station in API Integrations.</Alert>
          </BriefEmpty>
        ) : (
          <BriefEmpty>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {weather.temperature != null && (
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="h4">{weather.temperature}°C</Typography>
                  <Typography variant="caption">Temperature</Typography>
                </Paper>
              )}
              {weather.humidity != null && (
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="h4">{weather.humidity}%</Typography>
                  <Typography variant="caption">Humidity</Typography>
                </Paper>
              )}
              {weather.windSpeed != null && (
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="h4">{weather.windSpeed}</Typography>
                  <Typography variant="caption">Wind (km/h)</Typography>
                </Paper>
              )}
              {weather.description && (
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', minWidth: 100 }}>
                  <Typography variant="h6" fontWeight={600}>{weather.description}</Typography>
                  <Typography variant="caption">Conditions</Typography>
                </Paper>
              )}
            </Box>
          </BriefEmpty>
        )}
      </BriefSection>

      <BriefSection icon={<PestIcon />} title="Active Pest Alerts" count={data?.pestAlerts?.length || 0}>
        {!data?.pestAlerts?.length ? (
          <BriefEmpty>
            <Alert severity="success" variant="outlined">No active pest alerts. All clear.</Alert>
          </BriefEmpty>
        ) : (
          <BriefTable>
            <TableHead>
              <TableRow>
                <GutterCell />
                <TableCell>Field</TableCell>
                <TableCell>Pest</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Reported</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.pestAlerts.map((p, idx) => (
                <TableRow key={p.reportId} hover {...clickableRow(go('/ipm/scouting-reports'))}>
                  <GutterCell index={idx + 1} />
                  <TableCell sx={{ fontWeight: 600 }}>{p.fieldName}</TableCell>
                  <TableCell>{p.pestName || 'Unknown'}</TableCell>
                  <TableCell>
                    <Chip label={p.severity} color={SEVERITY_COLORS[p.severity] || 'default'} size="small" />
                  </TableCell>
                  <TableCell>{new Date(p.reportDate).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </BriefTable>
        )}
      </BriefSection>
      </Box>
    </Box>
  );
}
