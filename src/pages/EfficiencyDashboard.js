import { useState, useEffect, useMemo, useRef } from 'react';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import {
  Container,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  Box,
  Card,
  CardContent,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  Divider,
} from '@mui/material';
import {
  TrendingUpOutlined as TrendingUp,
  TrendingDownOutlined as TrendingDown,
  RemoveOutlined as Remove,
  DownloadOutlined as Download,
  CheckCircleOutlined as CheckCircle,
  WarningOutlined as Warning,
  ErrorOutlined as ErrorIcon,
  InfoOutlined as Info,
} from '@mui/icons-material';
import { loadMasterData } from '../utils/masterDataUtils';
import { exportToExcel } from '../utils/masterDataUtils';
import { listEcphAll, listHarvestsAll, listWeatherLogsAll } from '../utils/backendApi';
import * as XLSX from 'xlsx';

// Helper: Get week number from date
const getWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week: weekNo, year: d.getFullYear() };
};

// Helper: Get start and end of week
const getWeekRange = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
};

// Helper: Calculate field area (default: estimate from farm area)
const getFieldArea = (field, masterData) => {
  // If field has area property, use it
  if (field.area) return field.area;
  
  // Otherwise, estimate from farm area size
  for (const country of masterData.countries || []) {
    for (const site of country.sites || []) {
      for (const farmArea of site.farmAreas || []) {
        const foundField = farmArea.fields?.find((f) => f.id === field.id || f.name === field.name);
        if (foundField) {
          const fieldCount = farmArea.fields?.length || 1;
          const farmAreaSize = farmArea.size || 0; // in hectares
          // Convert hectares to m² and divide by field count
          return (farmAreaSize * 10000) / fieldCount;
        }
      }
    }
  }
  return 1000; // Default: 1000 m²
};

// Helper: Get climate-adjusted WUE benchmark
const getClimateAdjustedWUE = (avgTemp, crop) => {
  // Base WUE targets by crop (kg/m³)
  const baseTargets = {
    Tomato: 4.0,
    Capsicum: 3.5,
    'Sweet Corn': 2.5,
    Figs: 1.5,
  };
  
  const baseTarget = baseTargets[crop] || 3.0;
  
  // Adjust for temperature
  // Optimal temp: 20-25°C, adjust down for heat stress
  if (avgTemp > 30) {
    return { min: baseTarget * 0.85, max: baseTarget * 0.95 }; // Hot: -15% to -5%
  } else if (avgTemp > 28) {
    return { min: baseTarget * 0.90, max: baseTarget * 1.0 }; // Warm: -10% to 0%
  } else if (avgTemp > 25) {
    return { min: baseTarget * 0.95, max: baseTarget * 1.05 }; // Mild warm: -5% to +5%
  } else if (avgTemp >= 20) {
    return { min: baseTarget * 1.0, max: baseTarget * 1.1 }; // Optimal: 0% to +10%
  } else {
    return { min: baseTarget * 0.90, max: baseTarget * 1.0 }; // Cool: -10% to 0%
  }
};

// Helper: Count heat stress days (temp > 32°C)
const countHeatStressDays = (weatherData, weekStart, weekEnd) => {
  const weekWeather = weatherData.filter(
    (w) => w.date >= weekStart && w.date <= weekEnd
  );
  return weekWeather.filter((w) => w.avgTemp > 32).length;
};

function EfficiencyDashboard() {
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [masterData, setMasterData] = useState({ countries: [], crops: [], fieldTypes: [] });
  useEffect(() => {
    let mounted = true;
    loadMasterData().then((loaded) => {
      if (mounted) {
        setMasterData(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  const [harvestData, setHarvestData] = useState([]);
  const [ecphData, setEcphData] = useState([]);
  const [weatherData, setWeatherData] = useState([]);
  const [filters, setFilters] = useState({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    siteId: 'All',
    crop: 'All',
    environment: 'All',
  });

  useEffect(() => {
    if (activeSiteId && !appliedActiveSite.current) {
      appliedActiveSite.current = true;
      setFilters((prev) => ({ ...prev, siteId: activeSiteId }));
    }
  }, [activeSiteId]);
  const [viewMode, setViewMode] = useState('weekly'); // 'weekly', 'comparison', 'trends'
  const [comparisonType, setComparisonType] = useState('environment'); // 'environment', 'crop', 'trend'

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadAllData();
  }, [filters.dateFrom, filters.dateTo]);

  const loadAllData = async () => {
    try {
      const [harvests, ecph, weatherLogs] = await Promise.all([
        listHarvestsAll({
          start_date: filters.dateFrom,
          end_date: filters.dateTo,
        }),
        listEcphAll({
          start_date: filters.dateFrom,
          end_date: filters.dateTo,
        }),
        listWeatherLogsAll({
          start_date: filters.dateFrom,
          end_date: filters.dateTo,
        }),
      ]);

      const toNumber = (value) => {
        if (value === null || value === undefined || value === '') return undefined;
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
      };
      const mappedEcph = ecph.map((entry) => ({
        ...entry,
        totalWaterQty: toNumber(entry.totalWaterQty),
        valves: (entry.valveReadings || []).map((reading) => ({
          valveNumber: reading.valveNumber,
          percentDrain: toNumber(reading.percentDrain) ?? '',
        })),
      }));

      const mappedWeather = weatherLogs.map((entry) => ({
        ...entry,
        avgTemp: toNumber(entry.avgTemp),
        avgRH: toNumber(entry.avgRH),
        rainfall: toNumber(entry.rainfall),
      }));

      setHarvestData(harvests);
      setEcphData(mappedEcph);
      setWeatherData(mappedWeather);
    } catch (error) {
      setHarvestData([]);
      setEcphData([]);
      setWeatherData([]);
    }
  };

  // Calculate weekly efficiency metrics for each field
  const weeklyMetrics = useMemo(() => {
    const metrics = [];
    const fieldWeekMap = new Map();

    // Get all unique field-week combinations
    [...harvestData, ...ecphData].forEach((entry) => {
      if (!entry.date || !entry.fieldId) return;
      const weekInfo = getWeekNumber(entry.date);
      const key = `${entry.fieldId}_${weekInfo.year}_W${weekInfo.week}`;
      if (!fieldWeekMap.has(key)) {
        fieldWeekMap.set(key, {
          fieldId: entry.fieldId,
          year: weekInfo.year,
          week: weekInfo.week,
          weekRange: getWeekRange(entry.date),
        });
      }
    });

    // Calculate metrics for each field-week
    fieldWeekMap.forEach((weekInfo) => {
      const { fieldId, weekRange } = weekInfo;

      // Find field in master data
      let field = null;
      let siteId = null;
      let farmAreaId = null;
      for (const country of masterData.countries || []) {
        for (const site of country.sites || []) {
          for (const farmArea of site.farmAreas || []) {
            const foundField = farmArea.fields?.find(
              (f) => f.id === fieldId || f.name === fieldId
            );
            if (foundField) {
              field = foundField;
              siteId = site.id;
              farmAreaId = farmArea.id;
              break;
            }
          }
          if (field) break;
        }
        if (field) break;
      }

      if (!field) return;

      // Apply filters
      if (filters.siteId !== 'All' && siteId !== filters.siteId) return;
      if (filters.crop !== 'All' && field.currentCrop !== filters.crop) return;
      if (filters.environment !== 'All' && field.type !== filters.environment) return;

      // Get harvest data for this week
      const weekHarvest = harvestData.filter(
        (h) =>
          h.fieldId === fieldId &&
          h.date >= weekRange.start &&
          h.date <= weekRange.end
      );

      // Get water data for this week
      const weekWater = ecphData.filter(
        (w) =>
          w.fieldId === fieldId &&
          w.date >= weekRange.start &&
          w.date <= weekRange.end
      );

      // Get weather data for this week
      const weekWeather = weatherData.filter(
        (w) =>
          w.siteId === siteId &&
          w.date >= weekRange.start &&
          w.date <= weekRange.end
      );

      // Calculate totals
      const totalHarvest = weekHarvest.reduce(
        (sum, h) => sum + (h.totalQuantity || 0),
        0
      );

      const totalWater = weekWater.reduce(
        (sum, w) => sum + (parseFloat(w.totalWaterQty) || 0),
        0
      ); // m³

      // Calculate Grade A percentage
      let gradeATotal = 0;
      let totalGraded = 0;
      weekHarvest.forEach((h) => {
        h.varieties?.forEach((v) => {
          totalGraded += v.quantity || 0;
          if (v.grade === 'A') {
            gradeATotal += v.quantity || 0;
          }
        });
      });
      const gradeAPercent = totalGraded > 0 ? (gradeATotal / totalGraded) * 100 : null;

      // Get field area
      const fieldArea = getFieldArea(field, masterData); // m²

      // Calculate metrics
      const wue = totalWater > 0 ? totalHarvest / totalWater : 0; // kg/m³
      const productionDensity = fieldArea > 0 ? totalHarvest / fieldArea : 0; // kg/m²
      const irrigationIntensity = fieldArea > 0 ? (totalWater * 1000) / (fieldArea * 7) : 0; // L/m²/day

      // Calculate average drain percentage
      let totalDrainPercent = 0;
      let drainCount = 0;
      weekWater.forEach((w) => {
        w.valves?.forEach((valve) => {
          if (valve.percentDrain) {
            totalDrainPercent += parseFloat(valve.percentDrain);
            drainCount++;
          }
        });
      });
      const avgDrainPercent = drainCount > 0 ? totalDrainPercent / drainCount : null;

      // Calculate climate context
      const avgTemp =
        weekWeather.length > 0
          ? weekWeather.reduce((sum, w) => sum + (w.avgTemp || 0), 0) / weekWeather.length
          : null;
      const heatStressDays = countHeatStressDays(weatherData, weekRange.start, weekRange.end);
      const avgRH =
        weekWeather.length > 0
          ? weekWeather.reduce((sum, w) => sum + (w.avgRH || 0), 0) / weekWeather.length
          : null;
      const totalRainfall = weekWeather.reduce((sum, w) => sum + (w.rainfall || 0), 0);

      // Get climate-adjusted WUE benchmark
      const climateWUE = avgTemp !== null ? getClimateAdjustedWUE(avgTemp, field.currentCrop) : null;

      // Quality-adjusted WUE
      const qualityAdjustedWUE = gradeAPercent !== null ? wue * (gradeAPercent / 100) : wue;

      // Generate insights
      const insights = [];
      if (wue > 0 && gradeAPercent !== null && gradeAPercent < 70) {
        insights.push({
          type: 'warning',
          message: 'WUE high but Grade A% low → Check for plant stress',
        });
      }
      if (climateWUE && wue > climateWUE.max) {
        insights.push({
          type: 'success',
          message: avgTemp > 30
            ? 'Performing above expectations despite heat wave → Good management'
            : 'Performing above climate expectations',
        });
      } else if (climateWUE && wue < climateWUE.min) {
        insights.push({
          type: 'error',
          message: 'WUE below climate-adjusted benchmark → Review irrigation strategy',
        });
      }
      if (avgDrainPercent !== null && (avgDrainPercent < 15 || avgDrainPercent > 30)) {
        insights.push({
          type: 'warning',
          message: 'Drain % consistently outside 15-30% → Adjust irrigation duration',
        });
      }

      // Status
      let status = 'normal';
      let statusMessage = 'Within expected range';
      if (climateWUE) {
        if (wue > climateWUE.max) {
          status = 'excellent';
          statusMessage = 'Above climate expectations';
        } else if (wue < climateWUE.min) {
          status = 'poor';
          statusMessage = 'Below climate expectations';
        }
      }

      metrics.push({
        fieldId,
        fieldName: field.name,
        fieldType: field.type,
        crop: field.currentCrop,
        latitude: field.latitude,
        longitude: field.longitude,
        area: fieldArea,
        week: weekInfo.week,
        year: weekInfo.year,
        weekRange,
        wue,
        productionDensity,
        irrigationIntensity,
        avgDrainPercent,
        totalHarvest,
        totalWater,
        gradeAPercent,
        qualityAdjustedWUE,
        avgTemp,
        heatStressDays,
        avgRH,
        totalRainfall,
        climateWUE,
        insights,
        status,
        statusMessage,
        siteId,
        farmAreaId,
      });
    });

    return metrics.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.week !== b.week) return b.week - a.week;
      return a.fieldName.localeCompare(b.fieldName);
    });
  }, [harvestData, ecphData, weatherData, masterData, filters]);

  // Calculate week-over-week changes for each metric
  const metricsWithChanges = useMemo(() => {
    // Build lookup: fieldId -> year_week -> metric
    const lookup = new Map();
    weeklyMetrics.forEach((m) => {
      const key = `${m.fieldId}_${m.year}_W${m.week}`;
      lookup.set(key, m);
    });

    return weeklyMetrics.map((m) => {
      // Find previous week's data for the same field
      let prevWeek = m.week - 1;
      let prevYear = m.year;
      if (prevWeek < 1) {
        prevWeek = 52;
        prevYear -= 1;
      }
      const prevKey = `${m.fieldId}_${prevYear}_W${prevWeek}`;
      const prev = lookup.get(prevKey);

      return {
        ...m,
        wueChange: prev && prev.wue > 0 ? m.wue - prev.wue : null,
        productionDensityChange: prev && prev.productionDensity > 0
          ? m.productionDensity - prev.productionDensity : null,
        irrigationIntensityChange: prev && prev.irrigationIntensity > 0
          ? m.irrigationIntensity - prev.irrigationIntensity : null,
        drainPercentChange:
          prev && prev.avgDrainPercent !== null && m.avgDrainPercent !== null
            ? m.avgDrainPercent - prev.avgDrainPercent
            : null,
      };
    });
  }, [weeklyMetrics]);

  // Get available filter options
  const availableSites = useMemo(() => {
    const sites = new Set();
    masterData.countries?.forEach((country) => {
      country.sites?.forEach((site) => sites.add({ id: site.id, name: site.name }));
    });
    return Array.from(sites);
  }, [masterData]);

  const availableCrops = useMemo(() => {
    const crops = new Set();
    masterData.countries?.forEach((country) => {
      country.sites?.forEach((site) => {
        site.farmAreas?.forEach((fa) => {
          fa.fields?.forEach((field) => {
            if (field.currentCrop) crops.add(field.currentCrop);
          });
        });
      });
    });
    return Array.from(crops).sort();
  }, [masterData]);

  const handleExport = () => {
    const exportData = weeklyMetrics.map((m) => ({
      'Field Name': m.fieldName,
      'Field Type': m.fieldType,
      Crop: m.crop,
      'Week': `W${m.week} ${m.year}`,
      'Week Start': m.weekRange.start,
      'Week End': m.weekRange.end,
      'Area (m²)': m.area.toFixed(2),
      'WUE (kg/m³)': m.wue.toFixed(2),
      'Production Density (kg/m²)': m.productionDensity.toFixed(2),
      'Irrigation Intensity (L/m²/day)': m.irrigationIntensity.toFixed(2),
      'Avg Drain %': m.avgDrainPercent ? m.avgDrainPercent.toFixed(1) : 'N/A',
      'Total Harvest (kg)': m.totalHarvest.toFixed(2),
      'Total Water (m³)': m.totalWater.toFixed(2),
      'Grade A %': m.gradeAPercent ? m.gradeAPercent.toFixed(1) : 'N/A',
      'Quality-Adjusted WUE': m.qualityAdjustedWUE.toFixed(2),
      'Avg Temp (°C)': m.avgTemp ? m.avgTemp.toFixed(1) : 'N/A',
      'Heat Stress Days': m.heatStressDays,
      'Avg RH (%)': m.avgRH ? m.avgRH.toFixed(1) : 'N/A',
      'Total Rainfall (mm)': m.totalRainfall.toFixed(1),
      'Climate WUE Min': m.climateWUE ? m.climateWUE.min.toFixed(2) : 'N/A',
      'Climate WUE Max': m.climateWUE ? m.climateWUE.max.toFixed(2) : 'N/A',
      Status: m.statusMessage,
    }));

    exportToExcel(exportData, `Efficiency_Dashboard_${new Date().toISOString().split('T')[0]}`);
  };

  const renderMetricCard = (label, value, change, target, unit = '') => {
    const getChangeIcon = () => {
      if (change > 0) return <TrendingUp color="success" fontSize="small" />;
      if (change < 0) return <TrendingDown color="error" fontSize="small" />;
      return <Remove color="disabled" fontSize="small" />;
    };

    return (
      <Card variant="outlined" sx={{ height: '100%', bgcolor: 'background.paper' }}>
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5">
              {typeof value === 'number' ? value.toFixed(2) : value}
              {unit}
            </Typography>
            {change !== null && change !== 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {getChangeIcon()}
                <Typography variant="caption" color={change > 0 ? 'success.main' : 'error.main'}>
                  {change > 0 ? '+' : ''}
                  {change.toFixed(1)}
                </Typography>
              </Box>
            )}
          </Box>
          {target && (
            <Typography variant="caption" color="text.secondary">
              Target: {target}
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderFieldWeekCard = (metric) => {
    const getStatusColor = () => {
      if (metric.status === 'excellent') return 'success';
      if (metric.status === 'poor') return 'error';
      return 'info';
    };

    const getStatusIcon = () => {
      if (metric.status === 'excellent') return <CheckCircle />;
      if (metric.status === 'poor') return <ErrorIcon />;
      return <Info />;
    };

    return (
      <Card
        key={`${metric.fieldId}_${metric.year}_W${metric.week}`}
        variant="outlined"
        sx={{ mb: 3, bgcolor: 'background.paper' }}
      >
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Field {metric.fieldName} ({metric.crop}) — Week {metric.week}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Area: {metric.area.toLocaleString()} m²
                {metric.latitude && metric.longitude && (
                  <> | {metric.latitude}°N, {metric.longitude}°E</>
                )}
              </Typography>
            </Box>
            <Chip
              icon={getStatusIcon()}
              label={metric.statusMessage}
              color={getStatusColor()}
              size="small"
              variant="outlined"
            />
          </Box>

          <Divider />

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              {renderMetricCard(
                'kg/m³ (WUE)',
                metric.wue,
                metric.wueChange,
                metric.climateWUE ? `${metric.climateWUE.min.toFixed(1)}-${metric.climateWUE.max.toFixed(1)}`
                  : '4.0',
                ' kg/m³'
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              {renderMetricCard('kg/m²', metric.productionDensity, metric.productionDensityChange, '15', ' kg/m²')}
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              {renderMetricCard('L/m²/day', metric.irrigationIntensity, metric.irrigationIntensityChange, '4-6', ' L/m²/day')}
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              {renderMetricCard(
                'Drain %',
                metric.avgDrainPercent || 0,
                metric.drainPercentChange,
                '15-30%',
                '%'
              )}
            </Grid>
          </Grid>

          {metric.avgTemp !== null && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Climate Context
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    Avg Temp
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {metric.avgTemp.toFixed(1)}°C
                    {metric.avgTemp > 30 && (
                      <Chip label="Hot" size="small" color="error" variant="outlined" sx={{ ml: 1, height: 20 }} />
                    )}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    Heat Stress Days
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{metric.heatStressDays}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    Expected WUE
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {metric.climateWUE
                      ? `${metric.climateWUE.min.toFixed(1)}-${metric.climateWUE.max.toFixed(1)}`
                      : 'N/A'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    Avg RH
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {metric.avgRH ? `${metric.avgRH.toFixed(1)}%` : 'N/A'}
                  </Typography>
                </Grid>
              </Grid>
            </>
          )}

          {metric.insights.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Insights & Recommendations
              </Typography>
              {metric.insights.map((insight, idx) => (
                <Alert
                  key={idx}
                  severity={insight.type}
                  sx={{ mt: 1 }}
                  icon={insight.type === 'success' ? <CheckCircle /> : <Warning />}
                >
                  {insight.message}
                </Alert>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <Typography variant="h4">
            Climate-Contextual Water Use Efficiency
          </Typography>
          <Button
            variant="contained"
            disableElevation
            startIcon={<Download />}
            onClick={handleExport}
            disabled={weeklyMetrics.length === 0}
          >
            Export to Excel
          </Button>
        </Box>

        <Card variant="outlined" sx={{ mb: 3 }}>
          <CardContent sx={{ py: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Date From"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Date To"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="efficiencydashboard-site-label-1">Site</InputLabel>
                  <Select labelId="efficiencydashboard-site-label-1"
                    value={filters.siteId}
                    label="Site"
                    onChange={(e) => setFilters({ ...filters, siteId: e.target.value })}
                  >
                    <MenuItem value="All">All Sites</MenuItem>
                    {availableSites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="efficiencydashboard-crop-label-2">Crop</InputLabel>
                  <Select labelId="efficiencydashboard-crop-label-2"
                    value={filters.crop}
                    label="Crop"
                    onChange={(e) => setFilters({ ...filters, crop: e.target.value })}
                  >
                    <MenuItem value="All">All Crops</MenuItem>
                    {availableCrops.map((crop) => (
                      <MenuItem key={crop} value={crop}>
                        {crop}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="efficiencydashboard-environment-label-3">Environment</InputLabel>
                  <Select labelId="efficiencydashboard-environment-label-3"
                    value={filters.environment}
                    label="Environment"
                    onChange={(e) => setFilters({ ...filters, environment: e.target.value })}
                  >
                    <MenuItem value="All">All</MenuItem>
                    <MenuItem value="Greenhouse">Greenhouse</MenuItem>
                    <MenuItem value="NetHouse">Net House</MenuItem>
                    <MenuItem value="Open Field">Open Field</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {weeklyMetrics.length === 0 ? (
          <Alert severity="info">
            No data available for the selected filters. Please ensure you have harvest entries, EC/pH entries, and weather data for the selected period.
          </Alert>
        ) : (
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Weekly Efficiency Metrics — {metricsWithChanges.length} field-weeks
            </Typography>
            {metricsWithChanges.map((metric) => renderFieldWeekCard(metric))}
          </Box>
        )}
      </Box>
    </Container>
  );
}

export default EfficiencyDashboard;
