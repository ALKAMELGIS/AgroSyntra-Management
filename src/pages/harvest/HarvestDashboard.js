import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import {
  Container,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Card,
  TextField,
  MenuItem,
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import {} from '@mui/icons-material';
import { listHarvestsAll } from '../../utils/backendApi';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import PageTitle from '../../components/PageTitle';
import ExportButton from '../../components/ExportButton';

// Color scheme for crops
const CROP_COLORS = {
  'Plum Tomato': '#FF6384',
  'Table Tomato': '#FF6384',
  'Beef Tomato': '#FF6384',
  'Cherry Tomato': '#FF6384',
  'Capsicum Yellow': '#36A2EB',
  'Capsicum Red': '#36A2EB',
  'Capsicum Orange': '#36A2EB',
  'Sweet Corn': '#FFCE56',
  'Figs': '#4BC0C0',
};

function HarvestDashboard() {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [harvestData, setHarvestData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const { startDate: seasonFrom, endDate: seasonTo, setStartDate: setSeasonFrom, setEndDate: setSeasonTo, seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    cropType: 'All',
    plantationType: 'All',
  });
  const [summary, setSummary] = useState({
    totalPlantations: 0,
    totalYield: 0,
    averagePerPlantation: 0,
  });
  const [tableData, setTableData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [availableCrops, setAvailableCrops] = useState([]);

  useEffect(() => {
    if (!seasonDatesReady) return;
    setFilters((prev) => ({ ...prev, dateFrom: seasonFrom, dateTo: seasonTo }));
  }, [seasonDatesReady, seasonFrom, seasonTo]);

  useEffect(() => {
    if (!seasonDatesReady) return;
    loadHarvestData();
  }, [seasonDatesReady, seasonFrom, seasonTo]);

  const applyFilters = useCallback(() => {
    let filtered = [...harvestData];

    // Date range filter
    if (filters.dateFrom) {
      filtered = filtered.filter((entry) => entry.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      filtered = filtered.filter((entry) => entry.date <= filters.dateTo);
    }

    // Crop type filter
    if (filters.cropType !== 'All') {
      filtered = filtered.filter((entry) =>
        entry.varieties?.some((v) => v.variety === filters.cropType)
      );
    }

    // Plantation type filter
    if (filters.plantationType !== 'All') {
      filtered = filtered.filter((entry) => {
        const fieldName = entry.fieldName || entry.fieldId || '';
        if (filters.plantationType === 'NetHouse') {
          return fieldName.startsWith('NH-');
        } else if (filters.plantationType === 'Greenhouse') {
          return fieldName.startsWith('GH-');
        } else if (filters.plantationType === 'Open Field') {
          return fieldName.startsWith('Block-') || fieldName.includes('OPEN');
        }
        return true;
      });
    }

    setFilteredData(filtered);
  }, [harvestData, filters]);

  const processData = useCallback(() => {
    if (filteredData.length === 0) {
      setTableData([]);
      setChartData([]);
      setSummary({ totalPlantations: 0, totalYield: 0, averagePerPlantation: 0 });
      return;
    }

    // Group by plantation (fieldId)
    const plantationMap = {};

    filteredData.forEach((entry) => {
      const plantation = entry.fieldName || entry.fieldId || 'Unknown';
      
      if (!plantationMap[plantation]) {
        plantationMap[plantation] = {
          plantation,
          crop: entry.currentCrop || 'Unknown',
          totalKg: 0,
          varieties: {},
        };
      }

      // Add total quantity
      plantationMap[plantation].totalKg += entry.totalQuantity || 0;

      // Track varieties
      entry.varieties?.forEach((v) => {
        if (!plantationMap[plantation].varieties[v.variety]) {
          plantationMap[plantation].varieties[v.variety] = 0;
        }
        plantationMap[plantation].varieties[v.variety] += v.quantity;
      });
    });

    // Convert to array and calculate tons
    const processedData = Object.values(plantationMap).map((item) => {
      // Find main variety (highest quantity)
      const mainVariety = Object.entries(item.varieties).reduce(
        (max, [variety, qty]) => (qty > max.qty ? { variety, qty } : max),
        { variety: item.crop, qty: 0 }
      ).variety;

      return {
        plantation: item.plantation,
        crop: mainVariety,
        yieldKg: item.totalKg,
        yieldTon: (item.totalKg / 1000).toFixed(3),
      };
    });

    // Sort by plantation name
    processedData.sort((a, b) => a.plantation.localeCompare(b.plantation));

    setTableData(processedData);

    // Prepare chart data
    const chartDataProcessed = processedData.map((item) => ({
      plantation: item.plantation,
      yield: parseFloat(item.yieldTon),
      crop: item.crop,
      fill: CROP_COLORS[item.crop] || '#999999',
    }));

    setChartData(chartDataProcessed);

    // Calculate summary
    const totalYield = processedData.reduce((sum, item) => sum + parseFloat(item.yieldTon), 0);
    const totalPlantations = processedData.length;
    const averagePerPlantation = totalPlantations > 0 ? totalYield / totalPlantations : 0;

    setSummary({
      totalPlantations,
      totalYield: totalYield.toFixed(3),
      averagePerPlantation: averagePerPlantation.toFixed(3),
    });
  }, [filteredData]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  useEffect(() => {
    processData();
  }, [processData]);

  const loadHarvestData = async () => {
    try {
      const data = await listHarvestsAll({
        ...(seasonFrom ? { start_date: seasonFrom } : {}),
        ...(seasonTo ? { end_date: seasonTo } : {}),
      });
      setHarvestData(
        data.map((entry) => ({
          ...entry,
          currentCrop: entry.currentCrop || entry.varieties?.[0]?.variety || 'Unknown',
        }))
      );

      const crops = new Set();
      data.forEach((entry) => {
        entry.varieties?.forEach((v) => crops.add(v.variety));
      });
      setAvailableCrops(['All', ...Array.from(crops).sort()]);
    } catch (error) {
      setHarvestData([]);
      setAvailableCrops(['All']);
    }
  };


  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const exportToExcel = async () => {
    if (tableData.length === 0) {
      notify.warning('No data to export');
      return;
    }

    const excelData = tableData.map((row) => ({
      Plantation: row.plantation,
      Crop: row.crop,
      'Yield (Ton)': parseFloat(row.yieldTon),
    }));

    const totalYield = tableData.reduce((sum, row) => sum + parseFloat(row.yieldTon), 0);
    excelData.push({
      Plantation: 'TOTAL',
      Crop: '',
      'Yield (Ton)': totalYield.toFixed(3),
    });

    await exportOpsExcel(excelData, {
      filename: `Harvest_Yield_${new Date().toISOString().split('T')[0]}`,
      ...OPS_EXPORT.harvest,
      sheetName: 'Harvest Yield',
    });
  };

  return (
    <Container maxWidth="xl">
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <PageTitle>
            Harvest Dashboard
          </PageTitle>
          <ExportButton label="Export to Excel" onClick={exportToExcel} disabled={tableData.length === 0} />
        </Box>

        {/* Filters Section */}
        <Card variant="outlined" sx={{ p: 3, mb: 3, boxShadow: 'none' }}>
          <Typography variant="subtitle2" sx={{ mb: 2, textTransform: 'none', letterSpacing: 0, color: 'text.secondary' }}>
            Filters
          </Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                type="date"
                label="From Date"
                value={filters.dateFrom}
                onChange={(e) => setSeasonFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                type="date"
                label="To Date"
                value={filters.dateTo}
                onChange={(e) => setSeasonTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                select
                label="Crop Type"
                value={filters.cropType}
                onChange={(e) => handleFilterChange('cropType', e.target.value)}
              >
                {availableCrops.map((crop) => (
                  <MenuItem key={crop} value={crop}>
                    {crop}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                fullWidth
                select
                label="Plantation Type"
                value={filters.plantationType}
                onChange={(e) => handleFilterChange('plantationType', e.target.value)}
              >
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="NetHouse">NetHouse</MenuItem>
                <MenuItem value="Greenhouse">Greenhouse</MenuItem>
                <MenuItem value="Open Field">Open Field</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Card>

        {/* Summary */}
        <Box sx={{ display: 'grid', gap: 3, mb: 4, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' } }}>
          <DashboardStatCard title="Total Plantations" value={summary.totalPlantations} />
          <DashboardStatCard title="Total Yield" value={<>{summary.totalYield} Ton</>} color="success.main" />
          <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
            <DashboardStatCard title="Average per Plantation" value={<>{summary.averagePerPlantation} Ton</>} color="warning.main" />
          </Box>
        </Box>

        {/* Chart and its table side by side on wide screens, stacked below that. */}
        <Box sx={{ display: 'grid', gap: 4, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
        {/* Bar Chart Section */}
        <Card variant="outlined" sx={{ p: 3, boxShadow: 'none' }}>
          <Typography variant="subtitle2" sx={{ mb: 2, textTransform: 'none', letterSpacing: 0, color: 'text.secondary' }}>
            Yield by Plantation (Tons)
          </Typography>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid stroke="#e3e7e2" />
                <XAxis
                  dataKey="plantation"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  label={{ value: 'Yield (Ton)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  formatter={(value, name, props) => [
                    `${value} Ton`,
                    `${props.payload.crop}`,
                  ]}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Legend
                  payload={Object.entries(
                    chartData.reduce((acc, item) => {
                      if (!acc[item.crop]) {
                        acc[item.crop] = CROP_COLORS[item.crop] || '#999999';
                      }
                      return acc;
                    }, {})
                  ).map(([crop, color]) => ({
                    value: crop,
                    type: 'square',
                    color: color,
                  }))}
                />
                <Bar dataKey="yield" fill="#2f6aa8" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No harvest data available for the selected filters
              </Typography>
            </Box>
          )}
        </Card>

        {/* Table Section */}
        <Card variant="outlined" sx={{ p: 3, boxShadow: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, textTransform: 'none', letterSpacing: 0, color: 'text.secondary' }}>
            Harvest Yield by Plantation
          </Typography>
          <TableContainer sx={{ maxHeight: { lg: 440 } }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>
                    Plantation
                  </TableCell>
                  <TableCell>
                    Crop
                  </TableCell>
                  <TableCell align="right">
                    Yield (Ton)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      No harvest data available
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {tableData.map((row, index) => (
                      <TableRow key={index} hover>
                        <TableCell>{row.plantation}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: CROP_COLORS[row.crop] || '#999999',
                              }}
                            />
                            {row.crop}
                          </Box>
                        </TableCell>
                        <TableCell align="right">{row.yieldTon}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: 'background.muted' }}>
                      <TableCell sx={{ fontWeight: 600 }}>TOTAL</TableCell>
                      <TableCell></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {summary.totalYield}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
        </Box>
      </Box>
    </Container>
  );
}

export default HarvestDashboard;
