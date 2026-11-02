import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { excelTableSx, GutterCell } from '../table/ExcelTable';
import { formatAed, formatHours } from '../../utils/manpowerCost';

export function RateSourceChip({ source }) {
  const { t } = useTranslation();
  if (source === 'personal') {
    return <Chip size="small" variant="outlined" color="primary" label={t('manpowerCost.source.personal')} />;
  }
  if (source === 'group') {
    return <Chip size="small" variant="outlined" label={t('manpowerCost.source.group')} />;
  }
  return <Chip size="small" variant="outlined" color="warning" label={t('manpowerCost.source.missing')} />;
}

export function MissingRateAlert({ totals, missingRate }) {
  const { t } = useTranslation();
  if (!totals?.missingRateHours) return null;
  const names = (missingRate || []).map((w) => w.workerName).filter(Boolean);
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      {t('manpowerCost.missingRateWarning', { hours: formatHours(totals.missingRateHours) })}
      {names.length > 0 && (
        <Box component="span" sx={{ display: 'block' }}>
          {t('manpowerCost.missingRateWorkers', { names: names.slice(0, 10).join(', ') + (names.length > 10 ? '…' : '') })}
        </Box>
      )}
    </Alert>
  );
}

function datesLabel(line) {
  return line.firstDate === line.lastDate ? line.firstDate : `${line.firstDate} → ${line.lastDate}`;
}

export default function ManpowerCostTable({ data, loading, error }) {
  const { t } = useTranslation();

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Alert severity="error">{error.message || t('manpowerCost.loadFailed')}</Alert>;
  }

  const lines = data?.lines || [];
  const totals = data?.totals;
  const missingWorkers = lines.filter((l) => l.rateSource == null);

  return (
    <Box>
      <MissingRateAlert totals={totals} missingRate={missingWorkers} />
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 340px)' }}>
        <Table size="small" stickyHeader sx={excelTableSx}>
          <TableHead>
            <TableRow>
              <GutterCell />
              <TableCell>{t('manpowerCost.cols.employeeId')}</TableCell>
              <TableCell>{t('manpowerCost.cols.worker')}</TableCell>
              <TableCell>{t('manpowerCost.cols.category')}</TableCell>
              <TableCell>{t('manpowerCost.cols.site')}</TableCell>
              <TableCell>{t('manpowerCost.cols.dates')}</TableCell>
              <TableCell className="col-numeric">{t('manpowerCost.cols.hours')}</TableCell>
              <TableCell className="col-numeric">{t('manpowerCost.cols.rate')}</TableCell>
              <TableCell>{t('manpowerCost.cols.source')}</TableCell>
              <TableCell className="col-numeric">{t('manpowerCost.cols.cost')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">{t('manpowerCost.noData')}</TableCell>
              </TableRow>
            )}
            {lines.map((line, idx) => (
              <TableRow key={`${line.workerId}-${line.rateSource}-${line.rate}-${line.firstDate}`} hover>
                <GutterCell index={idx + 1} />
                <TableCell>{line.employeeId}</TableCell>
                <TableCell>{line.workerName}</TableCell>
                <TableCell>{t(`manpowerCost.category.${line.category}`, { defaultValue: line.category })}</TableCell>
                <TableCell>{line.siteName || t('manpowerCost.noSite')}</TableCell>
                <TableCell>{datesLabel(line)}</TableCell>
                <TableCell className="col-numeric">{formatHours(line.hours)}</TableCell>
                <TableCell className="col-numeric">{formatAed(line.rate)}</TableCell>
                <TableCell><RateSourceChip source={line.rateSource} /></TableCell>
                <TableCell className="col-numeric">{line.rateSource == null ? '-' : formatAed(line.cost)}</TableCell>
              </TableRow>
            ))}
            {lines.length > 0 && totals && (
              <TableRow>
                <GutterCell />
                <TableCell colSpan={5} sx={{ fontWeight: 700 }}>{t('manpowerCost.total')}</TableCell>
                <TableCell className="col-numeric" sx={{ fontWeight: 700 }}>{formatHours(totals.hours)}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="col-numeric" sx={{ fontWeight: 700 }}>{formatAed(totals.cost)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
