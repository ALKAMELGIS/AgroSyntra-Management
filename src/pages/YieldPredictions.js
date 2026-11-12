import { useState, useEffect } from 'react';
import {
  Container, Paper, Typography, Box, Grid, Card, CardContent, TextField, MenuItem,
  Chip, LinearProgress, } from '@mui/material';
import {
  TrendingUpOutlined as PredictionIcon, AgricultureOutlined as CropIcon, AnalyticsOutlined as AnalyticsIcon,
} from '@mui/icons-material';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { apiRequest } from '../utils/api';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';

export default function YieldPredictions() {
  const surface = useTheme().palette.background.paper;
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest('/fields').then((d) => setFields(d || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedField) { setPrediction(null); return; }
    setLoading(true);
    apiRequest(`/predictions/yield/${selectedField}`)
      .then((d) => setPrediction(d))
      .catch(() => setPrediction(null))
      .finally(() => setLoading(false));
  }, [selectedField]);

  return (
    <Container maxWidth="xl">
      <PageTitle sx={{ mb: 1 }}>
        Yield Predictions
      </PageTitle>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField select fullWidth label="Select Field" value={selectedField} onChange={(e) => setSelectedField(e.target.value)} size="small">
            {fields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
          </TextField>
        </Grid>
      </Grid>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {prediction && prediction.confidence_pct === 0 && (
        <InfoNote mode="line" severity="info" sx={{ mb: 3 }}>{prediction.methodology}</InfoNote>
      )}

      {prediction && prediction.confidence_pct > 0 && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ bgcolor: '#e8f5e9' }}><CardContent>
                <Typography variant="caption" color="text.secondary">Predicted Yield</Typography>
                <Typography variant="h4">{prediction.predicted_yield.toFixed(1)}</Typography>
                <Typography variant="caption">kg</Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card><CardContent>
                <Typography variant="caption" color="text.secondary">Confidence</Typography>
                <Typography variant="h4">{prediction.confidence_pct}%</Typography>
                <LinearProgress variant="determinate" value={prediction.confidence_pct} sx={{ mt: 1 }} />
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card><CardContent>
                <Typography variant="caption" color="text.secondary">Range</Typography>
                <Typography variant="h5">
                  {prediction.confidence_lower.toFixed(0)} — {prediction.confidence_upper.toFixed(0)}
                </Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card><CardContent>
                <Typography variant="caption" color="text.secondary">Trend</Typography>
                <Chip
                  label={prediction.factors.trend_slope > 0 ? 'Increasing' : prediction.factors.trend_slope < 0 ? 'Decreasing' : 'Stable'}
                  color={prediction.factors.trend_slope > 0 ? 'success' : prediction.factors.trend_slope < 0 ? 'warning' : 'default'}
                  icon={<PredictionIcon />}
                />
              </CardContent></Card>
            </Grid>
          </Grid>

          {/* Monthly Prediction Chart */}
          {prediction.monthly_predictions?.length > 0 && (
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="h6" gutterBottom>6-Month Yield Forecast</Typography>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={prediction.monthly_predictions}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="#cfe6d8" name="Upper Bound" />
                  <Area type="monotone" dataKey="lower" stroke="none" fill={surface} name="Lower Bound" />
                  <Line type="monotone" dataKey="predicted" stroke="#1f7a4d" strokeWidth={3} name="Predicted" />
                </ComposedChart>
              </ResponsiveContainer>
            </Paper>
          )}

          {/* Methodology */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Prediction Details</Typography>
            <Typography variant="body2" color="text.secondary">{prediction.methodology}</Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">Historical Average</Typography>
                <Typography variant="h6">{prediction.factors.historical_avg.toFixed(1)} kg</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">Data Points</Typography>
                <Typography variant="h6">{prediction.factors.data_points}</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">Seasonal Factor</Typography>
                <Typography variant="h6">{prediction.factors.seasonal_factor.toFixed(2)}x</Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Typography variant="caption" color="text.secondary">Crop</Typography>
                <Typography variant="h6">{prediction.crop_name || 'N/A'}</Typography>
              </Grid>
            </Grid>
          </Paper>
        </>
      )}

      {!selectedField && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Select a field to see yield predictions</Typography>
        </Paper>
      )}
    </Container>
  );
}
