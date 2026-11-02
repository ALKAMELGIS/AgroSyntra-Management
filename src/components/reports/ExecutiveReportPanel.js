import {
  Box, Paper, Typography, Grid, TextField, Button, Card, CardContent,
  Alert, List, ListItem, ListItemText, Divider, Chip,
} from '@mui/material';
import {
  AssessmentOutlined as ReportIcon,
  CheckCircleOutlined as CheckCircle, WarningOutlined as Warning, ErrorOutlineOutlined as ErrorOutline, InfoOutlined as Info,
  PrintOutlined as PrintIcon,
} from '@mui/icons-material';
import { formatPeriodLabel } from '../../utils/executiveReportUtils';

function KpiCard({ title, value, subtitle, delta, color = '#16a34a' }) {
  return (
    <Card variant="outlined" sx={{ height: '100%', border: '1px solid #e2e8f0', borderLeft: `3px solid ${color}` }}>
      <CardContent sx={{ py: 2 }}>
        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', mb: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, color }}>{value}</Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" display="block">{subtitle}</Typography>
        )}
        {delta && (
          <Typography variant="caption" sx={{ color: delta.startsWith('+') ? '#16a34a' : delta.startsWith('-') ? '#c23b2b' : 'text.secondary', fontWeight: 600 }}>
            {delta}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function insightIcon(type) {
  switch (type) {
    case 'success': return <CheckCircle fontSize="small" />;
    case 'warning': return <Warning fontSize="small" />;
    case 'error': return <ErrorOutline fontSize="small" />;
    default: return <Info fontSize="small" />;
  }
}

export default function ExecutiveReportPanel({
  title,
  report,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  siteName,
}) {
  const periodLabel = formatPeriodLabel(dateFrom, dateTo);

  const handlePrint = () => {
    window.print();
  };

  if (!report) return null;

  return (
    <Box className="executive-report-panel" sx={{ '@media print': { p: 0 } }}>
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, mb: 3, bgcolor: 'background.muted', border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReportIcon color="primary" />
              Executive Report
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {title}{siteName ? ` · ${siteName}` : ''} · {periodLabel}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', '@media print': { display: 'none' } }}>
            <TextField
              size="small" label="From" type="date" value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
            />
            <TextField
              size="small" label="To" type="date" value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
            />
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} size="small">
              Print
            </Button>
          </Box>
        </Box>
      </Paper>

      {!report.hasData ? (
        <Alert severity="info">No data found for the selected date range. Adjust the dates or check that entries exist.</Alert>
      ) : (
        <>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {report.kpis.map((kpi) => (
              <Grid size={{ xs: 6, sm: 4, md: 2 }} key={kpi.title}>
                <KpiCard {...kpi} />
              </Grid>
            ))}
          </Grid>

          <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Interpretation
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, mb: 2, lineHeight: 1.7 }}>
              {report.summary}
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Key Insights
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {report.insights.map((insight, idx) => (
                <Alert
                  key={idx}
                  severity={insight.type === 'error' ? 'error' : insight.type}
                  icon={insightIcon(insight.type)}
                  sx={{ py: 0.5 }}
                >
                  {insight.message}
                </Alert>
              ))}
            </Box>
          </Paper>

          <Grid container spacing={2}>
            {report.topFive.map((section) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={section.title}>
                <Paper elevation={0} sx={{ p: 2, height: '100%', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    {section.title}
                  </Typography>
                  {section.items.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                  ) : (
                    <List dense disablePadding>
                      {section.items.map((item, idx) => (
                        <ListItem key={item.label} disableGutters sx={{ py: 0.75, borderBottom: idx < section.items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <Chip
                            label={idx + 1}
                            size="small"
                            sx={{ mr: 1.5, minWidth: 28, height: 24, fontWeight: 700, bgcolor: idx === 0 ? 'primary.main' : 'background.muted', color: idx === 0 ? 'primary.contrastText' : 'text.primary' }}
                          />
                          <ListItemText
                            primary={item.label}
                            secondary={item.subtitle}
                            primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem' }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap', ml: 1 }}>
                            {item.value}
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
}
