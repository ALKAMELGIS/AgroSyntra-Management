import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import {
  Container,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  Card,
  CardContent,
  Box,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  FormControl,
  InputLabel,
  Checkbox,
  ListItemText,
  OutlinedInput,
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { PrintOutlined as Print, FilterListOutlined as FilterList } from '@mui/icons-material';
import { loadMasterData } from '../../utils/masterDataUtils';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { FERTILIZER_LIST } from '../../data/recipeDatabase';
import { fetchFertigationDashboardData } from '../dashboard/fertigationDashboardAdapter';
import { listRecipesAll } from '../../utils/backendApi';
import { fertigationRecipeName } from '../../utils/fertigationEntryLabels';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';
import ExportButton from '../../components/ExportButton';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const FERTILIZER_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384',
  '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
];

// Tab panel component
function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ marginTop: 16 }}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

function FertigationDashboard() {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [fertigationData, setFertigationData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [masterData, setMasterData] = useState({ countries: [], crops: [], fieldTypes: [] });
  const [recipeCatalog, setRecipeCatalog] = useState([]);
  useEffect(() => {
    let mounted = true;
    loadMasterData().then((loaded) => {
      if (mounted) {
        setMasterData(loaded);
      }
    });
    listRecipesAll().then((items) => {
      if (mounted) setRecipeCatalog(items || []);
    }).catch(() => {
      if (mounted) setRecipeCatalog([]);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const [activeTab, setActiveTab] = useState(0);
  const { startDate: seasonFrom, endDate: seasonTo, setStartDate: setSeasonFrom, setEndDate: setSeasonTo, seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    sites: [],
    fields: [],
    recipes: [],
    crops: [],
  });

  useEffect(() => {
    if (activeSiteId && !appliedActiveSite.current) {
      appliedActiveSite.current = true;
      setFilters((prev) => ({ ...prev, sites: [activeSiteId] }));
    }
  }, [activeSiteId]);

  useEffect(() => {
    if (!seasonDatesReady) return;
    setFilters((prev) => ({ ...prev, dateFrom: seasonFrom, dateTo: seasonTo }));
  }, [seasonDatesReady, seasonFrom, seasonTo]);
  const [summary, setSummary] = useState({
    totalWater: 0,
    totalFertilizer: 0,
    averageDailyUsage: 0,
    totalEntries: 0,
  });

  const fieldIndex = useMemo(() => {
    const index = new Map();
    (masterData.countries || []).forEach((country) => {
      (country.sites || []).forEach((site) => {
        (site.farmAreas || []).forEach((farmArea) => {
          (farmArea.fields || []).forEach((field) => {
            index.set(field.id, {
              ...field,
              farmAreaId: farmArea.id,
              siteId: site.id,
              countryId: country.id,
            });
          });
        });
      });
    });
    return index;
  }, [masterData]);

  const loadFertigationData = useCallback(async () => {
    try {
      const params = activeSiteId ? { site_id: activeSiteId } : {};
      const data = await fetchFertigationDashboardData(params);
      const enriched = data.map((entry) => {
        const fieldInfo = fieldIndex.get(entry.fieldId);
        return {
          ...entry,
          fieldName: fieldInfo?.name,
          siteId: fieldInfo?.siteId,
          farmAreaId: fieldInfo?.farmAreaId,
          countryId: fieldInfo?.countryId,
          crop: entry.cropName || fieldInfo?.currentCrop || fieldInfo?.crop || entry.crop,
          recipeName: fertigationRecipeName(entry, recipeCatalog) || entry.recipe?.name,
        };
      });
      setFertigationData(enriched);
    } catch (error) {
      setFertigationData([]);
    }
  }, [fieldIndex, activeSiteId, recipeCatalog]);

  const applyFilters = useCallback(() => {
    let filtered = [...fertigationData];

    // Date range filter
    if (filters.dateFrom) {
      filtered = filtered.filter((entry) => entry.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter((entry) => entry.date <= filters.dateTo);
    }

    // Site filter
    if (filters.sites.length > 0) {
      filtered = filtered.filter((entry) => filters.sites.includes(entry.siteId));
    }

    // Field filter
    if (filters.fields.length > 0) {
      filtered = filtered.filter((entry) => filters.fields.includes(entry.fieldId));
    }

    // Recipe filter
    if (filters.recipes.length > 0) {
      filtered = filtered.filter((entry) => filters.recipes.includes(entry.recipeName));
    }

    // Crop filter
    if (filters.crops.length > 0) {
      filtered = filtered.filter((entry) => filters.crops.includes(entry.crop));
    }

    setFilteredData(filtered);
  }, [fertigationData, filters]);

  const calculateSummary = useCallback(() => {
    if (filteredData.length === 0) {
      setSummary({
        totalWater: 0,
        totalFertilizer: 0,
        averageDailyUsage: 0,
        totalEntries: 0,
      });
      return;
    }

    const totalWater = filteredData.reduce(
      (sum, entry) => sum + toNumber(entry.dailyWater || entry.dailyTotalWater || 0),
      0
    );
    const totalFertilizer = filteredData.reduce(
      (sum, entry) => sum + toNumber(entry.totalFertilizer || 0),
      0
    ); // Keep in kg
    const averageDailyUsage = filteredData.length > 0
      ? filteredData.reduce((sum, entry) => sum + toNumber(entry.totalFertilizer || 0), 0) / filteredData.length
      : 0;
    const totalEntries = filteredData.length;

    setSummary({
      totalWater: totalWater.toFixed(2),
      totalFertilizer: totalFertilizer.toFixed(2),
      averageDailyUsage: averageDailyUsage.toFixed(2),
      totalEntries,
    });
  }, [filteredData]);

  useEffect(() => {
    loadFertigationData();
  }, [loadFertigationData]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    calculateSummary();
  }, [calculateSummary]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  // Get all unique values for filters
  const allSites = [...new Set(fertigationData.map((e) => e.siteId).filter(Boolean))].sort();
  const allFields = [...new Set(fertigationData.map((e) => e.fieldId))].sort();
  const allRecipes = [...new Set(fertigationData.map((e) => e.recipeName))].sort();
  const allCrops = [...new Set(fertigationData.map((e) => e.crop))].sort();

  // Get site names from master data
  const getSiteName = (siteId) => {
    if (!siteId || !masterData) return siteId;
    for (const country of masterData.countries || []) {
      const site = country.sites?.find((s) => s.id === siteId);
      if (site) return site.name;
    }
    return siteId;
  };

  // Filter fields based on selected sites
  const getFilteredFields = () => {
    if (filters.sites.length === 0) return allFields;
    return [...new Set(
      fertigationData
        .filter((e) => filters.sites.includes(e.siteId))
        .map((e) => e.fieldId)
    )].sort();
  };

  // Prepare water usage over time data
  const prepareWaterUsageData = () => {
    if (filteredData.length === 0) return [];

    // Sort by date
    const sorted = [...filteredData].sort((a, b) => new Date(a.date) - new Date(b.date));

    return sorted.map((entry) => ({
      date: entry.date,
        water: toNumber(entry.dailyWater || entry.dailyTotalWater || 0),
      field: entry.fieldId || 'Unknown',
    }));
  };

  // Prepare fertilizer composition per field
  const prepareFertilizerCompositionData = () => {
    if (filteredData.length === 0) return [];

    const fieldMap = {};
    const allFertilizersWithData = new Set();

    filteredData.forEach((entry) => {
      const field = entry.fieldId || 'Unknown';
      if (!fieldMap[field]) {
        fieldMap[field] = {};
      }

      if (entry.fertilizers) {
        Object.entries(entry.fertilizers).forEach(([fertilizer, kg]) => {
          const value = toNumber(kg);
          if (value > 0) {
            if (!fieldMap[field][fertilizer]) {
              fieldMap[field][fertilizer] = 0;
            }
            fieldMap[field][fertilizer] += value;
            allFertilizersWithData.add(fertilizer);
          }
        });
      }
    });

    // Get fertilizers in original FERTILIZER_LIST order that have data
    const fertilizersToShow = FERTILIZER_LIST.filter((f) => 
      allFertilizersWithData.has(f.name)
    );

    // Convert to chart format - include all fertilizers with data
    const fields = Object.keys(fieldMap).sort();
    return {
      data: fields.map((field) => {
        const data = { field };
        // Include all fertilizers that have data, in original order
        fertilizersToShow.forEach((fertilizer) => {
          data[fertilizer.name] = parseFloat((fieldMap[field][fertilizer.name] || 0).toFixed(2));
        });
        return data;
      }),
      fertilizersToShow, // Return this so we know which bars to render
    };
  };

  // Prepare cumulative fertilizer usage
  const prepareCumulativeData = () => {
    if (filteredData.length === 0) return [];

    // Sort by date
    const sorted = [...filteredData].sort((a, b) => new Date(a.date) - new Date(b.date));

    const cumulative = [];
    let cumulativeFertilizer = 0;

    sorted.forEach((entry) => {
      cumulativeFertilizer += toNumber(entry.totalFertilizer || 0);

      cumulative.push({
        date: entry.date,
        fertilizer: cumulativeFertilizer, // Keep in kg
      });
    });

    return cumulative;
  };

  // Prepare overall fertilizer composition (pie chart)
  const prepareOverallCompositionData = () => {
    if (filteredData.length === 0) return [];

    const fertilizerTotals = {};
    let grandTotal = 0;

    filteredData.forEach((entry) => {
      if (entry.fertilizers) {
        Object.entries(entry.fertilizers).forEach(([fertilizer, kg]) => {
          if (!fertilizerTotals[fertilizer]) {
            fertilizerTotals[fertilizer] = 0;
          }
          fertilizerTotals[fertilizer] += kg || 0;
          grandTotal += kg || 0;
        });
      }
    });

    return Object.entries(fertilizerTotals)
      .map(([name, value], index) => ({
        name,
        value: parseFloat((value / grandTotal * 100).toFixed(2)),
        kg: toNumber(value).toFixed(2),
        color: FERTILIZER_COLORS[index % FERTILIZER_COLORS.length],
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const exportToExcel = async () => {
    if (filteredData.length === 0) {
      notify.warning('No data to export');
      return;
    }

    const excelData = filteredData.map((entry) => {
      const row = {
        Date: entry.date,
        Field: entry.fieldId,
        Recipe: entry.recipeName,
        'Fertigation Water (m³)': toNumber(entry.dailyWater || entry.dailyTotalWater || 0).toFixed(2),
        'Total (kg)': toNumber(entry.totalFertilizer || 0).toFixed(2),
      };

      FERTILIZER_LIST.forEach((fertilizer) => {
        row[fertilizer.name] = toNumber(entry.fertilizers?.[fertilizer.name]).toFixed(3);
      });

      return row;
    });

    await exportOpsExcel(excelData, {
      filename: `Fertigation_Dashboard_${new Date().toISOString().split('T')[0]}`,
      ...OPS_EXPORT.fertigation,
      sheetName: 'Fertigation Data',
    });
  };

  const waterUsageData = prepareWaterUsageData();
  const fertilizerCompositionResult = prepareFertilizerCompositionData();
  const fertilizerCompositionData = fertilizerCompositionResult?.data || [];
  const fertilizersToShow = fertilizerCompositionResult?.fertilizersToShow || [];
  const cumulativeData = prepareCumulativeData();
  const overallCompositionData = prepareOverallCompositionData();

  return (
    <Container maxWidth="xl">
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <PageTitle>Fertigation Dashboard</PageTitle>
          <Box>
            <ExportButton label="Export to Excel" onClick={exportToExcel} />
            <Button variant="outlined" startIcon={<Print />} onClick={() => window.print()}>
              Print
            </Button>
          </Box>
        </Box>

        {/* Summary Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderLeft: '3px solid #1976d2' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Fertigation Water
                </Typography>
                <Typography variant="h5">
                  {summary.totalWater} m³
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Water with fertilizer only
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderLeft: '3px solid #1f7a4d' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Total Fertilizer
                </Typography>
                <Typography variant="h5">
                  {summary.totalFertilizer} kg
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderLeft: '3px solid #ed6c02' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Average Daily Usage
                </Typography>
                <Typography variant="h5">
                  {summary.averageDailyUsage} kg/day
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderLeft: '3px solid #0288d1' }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Total Entries
                </Typography>
                <Typography variant="h5">
                  {summary.totalEntries}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filter Panel */}
        <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <FilterList sx={{ mr: 1, color: 'text.secondary' }} />
            <Typography variant="h6">Filters</Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <TextField
                fullWidth size="small"
                type="date"
                label="From Date"
                value={filters.dateFrom}
                onChange={(e) => setSeasonFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <TextField
                fullWidth size="small"
                type="date"
                label="To Date"
                value={filters.dateTo}
                onChange={(e) => setSeasonTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="fertigationdashboard-sites-label-1">Sites</InputLabel>
                <Select labelId="fertigationdashboard-sites-label-1"
                  multiple
                  value={filters.sites}
                  onChange={(e) => handleFilterChange('sites', e.target.value)}
                  input={<OutlinedInput label="Sites" />}
                  renderValue={(selected) => selected.map((id) => getSiteName(id)).join(', ')}
                >
                  {allSites.map((siteId) => (
                    <MenuItem key={siteId} value={siteId}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} checked={filters.sites.indexOf(siteId) > -1} size="small" />
                      <ListItemText primary={getSiteName(siteId)} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="fertigationdashboard-fields-label-2">Fields</InputLabel>
                <Select labelId="fertigationdashboard-fields-label-2"
                  multiple
                  value={filters.fields}
                  onChange={(e) => handleFilterChange('fields', e.target.value)}
                  input={<OutlinedInput label="Fields" />}
                  renderValue={(selected) => selected.join(', ')}
                >
                  {getFilteredFields().map((field) => (
                    <MenuItem key={field} value={field}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} checked={filters.fields.indexOf(field) > -1} size="small" />
                      <ListItemText primary={field} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="fertigationdashboard-recipes-label-3">Recipes</InputLabel>
                <Select labelId="fertigationdashboard-recipes-label-3"
                  multiple
                  value={filters.recipes}
                  onChange={(e) => handleFilterChange('recipes', e.target.value)}
                  input={<OutlinedInput label="Recipes" />}
                  renderValue={(selected) => selected.join(', ')}
                >
                  {allRecipes.map((recipe) => (
                    <MenuItem key={recipe} value={recipe}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} checked={filters.recipes.indexOf(recipe) > -1} size="small" />
                      <ListItemText primary={recipe} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="fertigationdashboard-crops-label-4">Crops</InputLabel>
                <Select labelId="fertigationdashboard-crops-label-4"
                  multiple
                  value={filters.crops}
                  onChange={(e) => handleFilterChange('crops', e.target.value)}
                  input={<OutlinedInput label="Crops" />}
                  renderValue={(selected) => selected.join(', ')}
                >
                  {allCrops.map((crop) => (
                    <MenuItem key={crop} value={crop}>
                      <Checkbox slotProps={{ input: { 'aria-label': 'Select' } }} checked={filters.crops.indexOf(crop) > -1} size="small" />
                      <ListItemText primary={crop} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Card>

        {/* Tabs for different views */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
            <Tab label="Water Usage" />
            <Tab label="Fertilizer Composition" />
            <Tab label="Cumulative Usage" />
            <Tab label="Data Table" />
          </Tabs>
        </Box>

        {/* View 1: Water Usage Over Time */}
        <TabPanel value={activeTab} index={0}>
          <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Water Usage Over Time
            </Typography>
            {waterUsageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={waterUsageData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid stroke="#e3e7e2" />
                  <XAxis
                    dataKey="date"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis
                    label={{ value: 'Fertigation Water (m³)', angle: -90, position: 'insideLeft' }}
                    domain={[0, 'dataMax + 50']}
                  />
                  <RechartsTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="water" stroke="#2f6aa8" strokeWidth={2} name="Fertigation Water (m³)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <InfoNote mode="line" severity="info">No data available for the selected filters</InfoNote>
            )}
          </Card>
        </TabPanel>

        {/* View 2: Fertilizer Composition Per Field */}
        <TabPanel value={activeTab} index={1}>
          <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Fertilizer Composition by Field
            </Typography>
            {fertilizerCompositionData.length > 0 && fertilizersToShow.length > 0 ? (
              <Box sx={{ width: '100%', overflowX: 'auto' }}>
                <Box sx={{ minWidth: Math.max(600, fertilizerCompositionData.length * 150) }}>
                  <ResponsiveContainer width="100%" height={500}>
                    <BarChart
                      data={fertilizerCompositionData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
                    >
                      <CartesianGrid stroke="#e3e7e2" />
                      <XAxis
                        dataKey="field"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        interval={0}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        label={{ value: 'Fertilizer (kg)', angle: -90, position: 'insideLeft' }}
                        domain={[0, 'dataMax + 50']}
                      />
                      <RechartsTooltip />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        style={{ fontSize: '12px' }}
                      />
                      {fertilizersToShow.map((fertilizer, index) => {
                        const originalIndex = FERTILIZER_LIST.findIndex((f) => f.name === fertilizer.name);
                        return (
                          <Bar
                            key={fertilizer.name}
                            dataKey={fertilizer.name}
                            stackId="a"
                            fill={FERTILIZER_COLORS[originalIndex % FERTILIZER_COLORS.length]}
                            name={fertilizer.name}
                          />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            ) : (
              <InfoNote mode="line" severity="info">No data available for the selected filters</InfoNote>
            )}
          </Card>
        </TabPanel>

        {/* View 3: Cumulative Fertilizer Usage */}
        <TabPanel value={activeTab} index={2}>
          <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Cumulative Fertilizer Usage
            </Typography>
            {cumulativeData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={cumulativeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid stroke="#e3e7e2" />
                    <XAxis dataKey="date" />
                    <YAxis
                      label={{ value: 'Cumulative (kg)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 'dataMax + 100']}
                    />
                    <RechartsTooltip />
                    <Legend />
                    <Area type="monotone" dataKey="fertilizer" stroke="#3fae7a" fill="#3fae7a" name="Fertilizer (kg)" />
                  </AreaChart>
                </ResponsiveContainer>
                <Box sx={{ mt: 3 }}>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={overallCompositionData.slice(0, 8)}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}%`}
                            outerRadius={100}
                            fill="#2f6aa8"
                            dataKey="value"
                          >
                            {overallCompositionData.slice(0, 8).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Fertilizer</TableCell>
                              <TableCell align="right">Percentage</TableCell>
                              <TableCell align="right">Total (kg)</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {overallCompositionData.map((item) => (
                              <TableRow key={item.name}>
                                <TableCell>{item.name}</TableCell>
                                <TableCell align="right">{item.value}%</TableCell>
                                <TableCell align="right">{item.kg}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Grid>
                  </Grid>
                </Box>
              </>
            ) : (
              <InfoNote mode="line" severity="info">No data available for the selected filters</InfoNote>
            )}
          </Card>
        </TabPanel>

        {/* View 4: Data Table */}
        <TabPanel value={activeTab} index={3}>
          <Card variant="outlined" sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Fertigation Entries
            </Typography>
            {filteredData.length > 0 ? (
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Field</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Recipe</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        Fertigation Water (m³)
                      </TableCell>
                      {FERTILIZER_LIST.slice(0, 8).map((fertilizer) => (
                        <TableCell key={fertilizer.name} sx={{ fontWeight: 'bold' }} align="right">
                          {fertilizer.name} (kg)
                        </TableCell>
                      ))}
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        Total (kg)
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredData
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .slice(0, 100)
                      .map((entry, index) => (
                        <TableRow key={entry.id || index} hover>
                          <TableCell>{entry.date}</TableCell>
                          <TableCell>{entry.fieldId}</TableCell>
                          <TableCell>{entry.recipeName}</TableCell>
                          <TableCell align="right">
                            {toNumber(entry.dailyWater || entry.dailyTotalWater || 0).toFixed(2)}
                          </TableCell>
                          {FERTILIZER_LIST.slice(0, 8).map((fertilizer) => (
                            <TableCell key={fertilizer.name} align="right">
                              {toNumber(entry.fertilizers?.[fertilizer.name]).toFixed(3)}
                            </TableCell>
                          ))}
                          <TableCell align="right">{toNumber(entry.totalFertilizer || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <InfoNote mode="line" severity="info">No data available for the selected filters</InfoNote>
            )}
          </Card>
        </TabPanel>
      </Box>
    </Container>
  );
}

export default FertigationDashboard;
