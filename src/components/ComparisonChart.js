import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  TextField,
  MenuItem,
  Chip,
  CircularProgress,
  Grid,
  Autocomplete,
} from '@mui/material';
import { CompareArrows as CompareIcon } from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiRequest } from '../utils/api';

const COLORS = ['#2e7d32', '#1976d2', '#f57c00', '#9c27b0', '#e91e63'];

const METRIC_OPTIONS = [
  { value: 'total_quantity', label: 'Harvest Yield (kg)' },
  { value: 'daily_water', label: 'Daily Water (L)' },
  { value: 'total_fertilizer', label: 'Fertilizer (kg)' },
];

/**
 * Side-by-side field comparison chart.
 * Compares 2-4 fields across a selected metric.
 */
export default function ComparisonChart() {
  const [fields, setFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [metric, setMetric] = useState('total_quantity');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest('/fields?limit=500')
      .then((res) => setFields(Array.isArray(res) ? res : res?.data || []))
      .catch(() => {});
  }, []);

  const loadComparison = useCallback(async () => {
    if (selectedFields.length < 2) return;
    setLoading(true);
    try {
      // Fetch data for each selected field
      const results = await Promise.all(
        selectedFields.map(async (field) => {
          let endpoint;
          if (metric === 'total_quantity') {
            endpoint = `/harvests?field_id=${field.id}&limit=100`;
          } else {
            endpoint = `/fertigation?field_id=${field.id}&limit=100`;
          }
          const data = await apiRequest(endpoint);
          const rows = Array.isArray(data) ? data : [];
          const total = rows.reduce((sum, r) => sum + (parseFloat(r[metric]) || 0), 0);
          return { name: field.name, value: total, count: rows.length };
        })
      );

      setChartData(results);
    } catch {
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFields, metric]);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <CompareIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>Field Comparison</Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Autocomplete
            multiple
            options={fields}
            getOptionLabel={(f) => f.name || f.id}
            value={selectedFields}
            onChange={(_, val) => setSelectedFields(val.slice(0, 4))}
            renderInput={(params) => (
              <TextField {...params} label="Select fields to compare (2-4)" size="small" />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{ bgcolor: COLORS[index % COLORS.length], color: 'white' }}
                  {...getTagProps({ index })}
                />
              ))
            }
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="Metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {METRIC_OPTIONS.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={120} />
            <Tooltip />
            <Legend />
            <Bar
              dataKey="value"
              name={METRIC_OPTIONS.find((m) => m.value === metric)?.label || metric}
              fill="#2e7d32"
            >
              {chartData.map((_, i) => (
                <rect key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            {selectedFields.length < 2 ? 'Select at least 2 fields to compare' : 'No data available'}
          </Typography>
        </Box>
      )}

      {chartData.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            {chartData.map((item, idx) => (
              <Grid item xs={6} md={3} key={item.name}>
                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderLeft: `3px solid ${COLORS[idx]}` }}>
                  <Typography variant="caption" color="text.secondary">{item.name}</Typography>
                  <Typography variant="h6" fontWeight={600}>{item.value.toLocaleString()}</Typography>
                  <Typography variant="caption">{item.count} entries</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Paper>
  );
}
