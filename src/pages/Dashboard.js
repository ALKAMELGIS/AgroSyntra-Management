import { useState, useEffect, lazy, Suspense } from 'react';
import useSocket from '../hooks/useSocket';
import {
  Box,
  Typography,
  Chip,
  Tabs,
  Tab,
  Paper,
  TextField,
  MenuItem,
} from '@mui/material';
import { CloseOutlined as CloseIcon } from '@mui/icons-material';
import { DashboardSkeleton } from '../components/LoadingSkeleton';
import FarmMonitor from './dashboard/FarmMonitor';
import useDashboardData from './dashboard/useDashboardData';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import SiteZoneSelect from '../components/SiteZoneSelect';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import useSeasonListDates from '../hooks/useSeasonListDates';
import PageTitle from '../components/PageTitle';

const EcphDashboard = lazy(() => import('./dashboard/EcphDashboard'));
const FertigationDashboard = lazy(() => import('./dashboard/FertigationDashboard'));
const IrrigationDashboard = lazy(() => import('./dashboard/IrrigationDashboard'));
const HarvestDashboard = lazy(() => import('./dashboard/HarvestDashboard'));

const DEFAULT_FILTERS = {
  dateFrom: '',
  dateTo: '',
  zone: '',
  site: '',
  farmArea: '',
  field: '',
};

const DASHBOARD_TABS = [
  { key: 'ecph', label: 'EC / pH' },
  { key: 'fertigation', label: 'Fertigation' },
  { key: 'irrigation', label: 'Irrigation' },
  { key: 'harvest', label: 'Harvest' },
];

function Dashboard() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.DASHBOARD);
  const {
    startDate: seasonFrom,
    endDate: seasonTo,
    setStartDate: setSeasonFrom,
    setEndDate: setSeasonTo,
    seasonStart,
    seasonEnd,
  } = useSeasonListDates();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFieldObj, setSelectedFieldObj] = useState(null);
  const { activeSiteId, setActiveSiteId, countries, allowAllSites, hasSiteAssignment } = useActiveSite();
  const { activeSeasonId, setActiveSeasonId, seasons, isLoaded: seasonLoaded } = useActiveSeason();

  // The dashboard follows the site chosen in the sidebar or in its own header
  // (both use the same selection). "All Sites" clears the site, and a field
  // picked under the previous site is cleared too.
  useEffect(() => {
    const site = activeSiteId || '';
    setFilters((prev) => (prev.site === site ? prev : { ...prev, site, field: '', farmArea: '' }));
    setSelectedFieldObj(null);
  }, [activeSiteId]);

  const handleFieldSelect = (field) => {
    if (!field) {
      setSelectedFieldObj(null);
      setFilters((prev) => ({ ...prev, field: '', farmArea: '' }));
      return;
    }
    setSelectedFieldObj(field);
    setFilters((prev) => ({ ...prev, field: field.id, farmArea: field.farm_area_id || prev.farmArea }));
  };

  const {
    isLoading,
    allFields,
    fieldOverview,
    agronomicThresholds,
    weatherByFieldId,
    weatherLoading,
    weatherFetching,
    refreshWeather,
    refresh,
  } = useDashboardData({
    selectedField: filters.field,
    selectedFarmArea: filters.farmArea,
    selectedSite: filters.site,
    startDate: seasonFrom,
    endDate: seasonTo,
  });

  const { subscribe, unsubscribe, on, off } = useSocket();
  useEffect(() => {
    subscribe('dashboard');
    on('data:change', refresh);
    return () => {
      off('data:change', refresh);
      unsubscribe('dashboard');
    };
  }, [subscribe, unsubscribe, on, off, refresh]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        <PageTitle>Analytics Dashboard</PageTitle>
        <Box sx={{ flex: 1 }} />
        {hasSiteAssignment && (
          <SiteZoneSelect
            variant="chip"
            countries={countries}
            value={activeSiteId}
            onChange={setActiveSiteId}
            allowAllSites={allowAllSites}
          />
        )}
        {activeSiteId && seasonLoaded && seasons.length > 0 && (
          <TextField
            select
            size="small"
            value={activeSeasonId || ''}
            onChange={(e) => setActiveSeasonId(e.target.value)}
            SelectProps={{ inputProps: { 'aria-label': 'Season' } }}
            sx={{ '& .MuiOutlinedInput-root': { height: 36, borderRadius: 999, fontSize: '0.8125rem', fontWeight: 600 } }}
          >
            {seasons.map((season) => (
              <MenuItem key={season.id} value={season.id} sx={{ fontSize: '0.8125rem' }}>{season.name}</MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {readOnly && <ReadOnlyBanner message="View only — dashboard data is read-only for your role." />}

      <FarmMonitor
        fieldOverview={fieldOverview}
        onFieldSelect={handleFieldSelect}
        selectedFieldId={filters.field}
        agronomicThresholds={agronomicThresholds}
        onTabSwitch={(tabIndex) => setActiveTab(tabIndex)}
        dateTo={seasonTo}
        weatherByFieldId={weatherByFieldId}
        weatherLoading={weatherLoading}
        weatherFetching={weatherFetching}
        onRefreshWeather={refreshWeather}
      />

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
          value={seasonFrom || ''} onChange={(e) => setSeasonFrom(e.target.value)}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          sx={{ width: 150 }}
        />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
          value={seasonTo || ''} onChange={(e) => setSeasonTo(e.target.value)}
          inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          sx={{ width: 150 }}
        />
        {selectedFieldObj ? (
          <Chip
            label={selectedFieldObj.name}
            onDelete={() => handleFieldSelect(null)}
            deleteIcon={<CloseIcon />}
            sx={{
              fontWeight: 600,
              bgcolor: 'table.headerBg',
              color: 'table.headerText',
              '& .MuiChip-deleteIcon': { color: 'table.headerText' },
            }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            Click a field above to filter
          </Typography>
        )}
      </Paper>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 42,
          '& .MuiTabs-indicator': { bgcolor: 'primary.main' },
        }}
      >
        {DASHBOARD_TABS.map((t) => (
          <Tab
            key={t.key}
            label={t.label}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 42,
              '&.Mui-selected': { color: 'text.primary' },
            }}
          />
        ))}
      </Tabs>

      {activeTab === 0 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading EC/pH Dashboard...</Typography></Box>}>
          <EcphDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}

      {activeTab === 1 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading Fertigation Dashboard...</Typography></Box>}>
          <FertigationDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}

      {activeTab === 2 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading Irrigation Dashboard...</Typography></Box>}>
          <IrrigationDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}

      {activeTab === 3 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading Harvest Dashboard...</Typography></Box>}>
          <HarvestDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}
    </Box>
  );
}

export default Dashboard;
