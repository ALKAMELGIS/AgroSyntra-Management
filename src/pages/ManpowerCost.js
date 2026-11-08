import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, Container, MenuItem, Tab, Tabs, TextField,
} from '@mui/material';
import {} from '@mui/icons-material';
import { useApiQuery } from '../hooks/useApiQuery';
import useOpsExcelExport from '../hooks/useOpsExcelExport';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useNotification } from '../contexts/NotificationContext';
import { apiRequest } from '../utils/api';
import { OPS_EXPORT } from '../utils/companyExcelExport';
import { defaultPeriod } from '../utils/manpowerCost';
import { buildManpowerCostSheets, hasManpowerCostData } from '../utils/manpowerCostExcelExport';
import ManpowerCostTable from '../components/manpower/ManpowerCostTable';
import ManpowerCostDashboard from '../components/manpower/ManpowerCostDashboard';
import ManpowerRatesPanel from '../components/manpower/ManpowerRatesPanel';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';
import ExportButton from '../components/ExportButton';

const TABS = ['cost', 'dashboard', 'rates'];

function periodQuery({ startDate, endDate }, siteId) {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  if (siteId) params.set('site_id', siteId);
  return params.toString();
}

export default function ManpowerCost() {
  const { t } = useTranslation();
  const { activeSiteId, allSites = [], allowAllSites } = useActiveSite() || {};
  const [tab, setTab] = useState('cost');
  const [period, setPeriod] = useState(defaultPeriod);
  const [siteId, setSiteId] = useState(activeSiteId || '');

  const validPeriod = Boolean(period.startDate && period.endDate && period.startDate <= period.endDate);
  const query = periodQuery(period, siteId);

  const detail = useApiQuery(
    ['manpower-cost', 'detail', query],
    `/manpower-cost/detail?${query}`,
    { enabled: validPeriod && tab === 'cost' },
  );
  const summary = useApiQuery(
    ['manpower-cost', 'summary', query],
    `/manpower-cost/summary?${query}`,
    { enabled: validPeriod && tab === 'dashboard' },
  );

  const siteOptions = useMemo(
    () => [...allSites].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [allSites],
  );

  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [exporting, setExporting] = useState(false);
  const siteName = siteOptions.find((s) => s.id === siteId)?.name || '';

  // The workbook needs both the cost lines and the dashboard figures, whichever tab is open.
  const handleExport = async () => {
    if (!validPeriod) return;
    setExporting(true);
    try {
      const [detailData, summaryData] = await Promise.all([
        apiRequest(`/manpower-cost/detail?${query}`),
        apiRequest(`/manpower-cost/summary?${query}`),
      ]);
      if (!hasManpowerCostData(detailData)) {
        notify.warning(t('manpowerCost.nothingToExport'));
        return;
      }
      await exportOpsExcel([], {
        ...OPS_EXPORT.manpowerCost,
        sheets: buildManpowerCostSheets({ detail: detailData, summary: summaryData, period, siteName }),
        siteName: siteName || t('manpowerCost.allSites'),
        filename: `Manpower Cost ${period.startDate} to ${period.endDate}.xlsx`,
      });
    } catch (err) {
      notify.error(err.message || t('manpowerCost.loadFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Container maxWidth="xl">
      <Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', mb: 2 }}>
          <Box sx={{ flexGrow: 1, minWidth: 220 }}>
            <PageTitle help={t('manpowerCost.subtitle')}>{t('manpowerCost.title')}</PageTitle>
          </Box>
          {tab !== 'rates' && (
            <>
              <TextField
                type="date"
                size="small"
                label={t('manpowerCost.from')}
                value={period.startDate}
                onChange={(e) => setPeriod((p) => ({ ...p, startDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                error={!validPeriod}
              />
              <TextField
                type="date"
                size="small"
                label={t('manpowerCost.to')}
                value={period.endDate}
                onChange={(e) => setPeriod((p) => ({ ...p, endDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                error={!validPeriod}
              />
            </>
          )}
          <TextField
            select
            size="small"
            label={t('manpowerCost.site')}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            {(allowAllSites || siteOptions.length !== 1) && (
              <MenuItem value="">{t('manpowerCost.allSites')}</MenuItem>
            )}
            {siteOptions.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </TextField>
          {tab !== 'rates' && (
            <ExportButton label={t('manpowerCost.export')} onClick={handleExport} disabled={!validPeriod || exporting} loading={exporting} />
          )}
        </Box>

        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
          {TABS.map((key) => (
            <Tab key={key} value={key} label={t(`manpowerCost.tabs.${key}`)} />
          ))}
        </Tabs>

        {tab !== 'rates' && (
          <InfoNote severity="info" sx={{ mb: 2 }}>
            {t('manpowerCost.approvedOnlyNote')}
          </InfoNote>
        )}

        {tab === 'cost' && (
          <ManpowerCostTable
            data={detail.data}
            loading={detail.isLoading && validPeriod}
            error={detail.error}
          />
        )}
        {tab === 'dashboard' && (
          <ManpowerCostDashboard
            data={summary.data}
            loading={summary.isLoading && validPeriod}
            error={summary.error}
          />
        )}
        {tab === 'rates' && <ManpowerRatesPanel siteId={siteId} sites={siteOptions} />}
      </Box>
    </Container>
  );
}
