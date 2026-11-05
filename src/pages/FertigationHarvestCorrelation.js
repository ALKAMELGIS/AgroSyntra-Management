import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem,
  TextField, Button, Alert, CircularProgress, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiRequest } from '../utils/api';
import { useMasterData } from '../utils/useMasterData';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import InfoNote from '../components/InfoNote';

export default function FertigationHarvestCorrelation() {
  const { data: masterRaw } = useMasterData();
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedFarmArea, setSelectedFarmArea] = useState('');
  const [selectedField, setSelectedField] = useState('');
  const [groupBy, setGroupBy] = useState('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { zones, sites, farmAreas, fields } = useMemo(() => {
    const z = masterRaw.countries || [];
    const s = [];
    const fa = [];
    const f = [];
    for (const zone of z) {
      for (const site of zone.sites || []) {
        s.push({ ...site, countryId: zone.id });
        for (const area of site.farmAreas || []) {
          fa.push({ ...area, siteId: site.id });
          for (const field of area.fields || []) {
            f.push({ ...field, farmAreaId: area.id });
          }
        }
      }
    }
    return { zones: z, sites: s, farmAreas: fa, fields: f };
  }, [masterRaw]);

  useEffect(() => {
    if (activeSiteId && sites.length && !appliedActiveSite.current) {
      const site = sites.find((s) => s.id === activeSiteId);
      if (site) {
        appliedActiveSite.current = true;
        setSelectedZone(site.countryId);
        setSelectedSite(site.id);
      }
    }
  }, [activeSiteId, sites]);

  const filteredSites = sites.filter((s) => !selectedZone || s.countryId === selectedZone);
  const filteredFarmAreas = farmAreas.filter((fa) => !selectedSite || fa.siteId === selectedSite);
  const filteredFields = fields.filter((f) => !selectedFarmArea || f.farmAreaId === selectedFarmArea);

  const loadData = useCallback(async () => {
    if (!selectedField) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ field_id: selectedField, group_by: groupBy });
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      const result = await apiRequest(`/analytics/fertigation-harvest?${params}`);
      setData(result.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedField, groupBy, startDate, endDate]);

  useEffect(() => {
    if (selectedField) loadData();
  }, [selectedField, loadData]);

  const formatPeriod = (val) => {
    if (!val) return '';
    const d = new Date(val);
    return groupBy === 'month'
      ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
        Fertigation vs Harvest Correlation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Compare water and fertilizer inputs against harvest outputs per field over time.
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="fertigationharvestcorrelation-zone-label-1">Zone</InputLabel>
            <Select labelId="fertigationharvestcorrelation-zone-label-1" value={selectedZone} label="Zone" onChange={(e) => { setSelectedZone(e.target.value); setSelectedSite(''); setSelectedFarmArea(''); setSelectedField(''); }}>
              <MenuItem value="">All</MenuItem>
              {zones.map((z) => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="fertigationharvestcorrelation-site-label-2">Site</InputLabel>
            <Select labelId="fertigationharvestcorrelation-site-label-2" value={selectedSite} label="Site" onChange={(e) => { setSelectedSite(e.target.value); setSelectedFarmArea(''); setSelectedField(''); }}>
              <MenuItem value="">All</MenuItem>
              {filteredSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="fertigationharvestcorrelation-farm-area-label-3">Farm Area</InputLabel>
            <Select labelId="fertigationharvestcorrelation-farm-area-label-3" value={selectedFarmArea} label="Farm Area" onChange={(e) => { setSelectedFarmArea(e.target.value); setSelectedField(''); }}>
              <MenuItem value="">All</MenuItem>
              {filteredFarmAreas.map((fa) => <MenuItem key={fa.id} value={fa.id}>{fa.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="fertigationharvestcorrelation-field-label-4">Field *</InputLabel>
            <Select labelId="fertigationharvestcorrelation-field-label-4" value={selectedField} label="Field *" onChange={(e) => setSelectedField(e.target.value)}>
              <MenuItem value="">Select a field</MenuItem>
              {filteredFields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </Select>
          </FormControl>
          <ToggleButtonGroup size="small" value={groupBy} exclusive onChange={(_, v) => v && setGroupBy(v)}>
            <ToggleButton value="week">Weekly</ToggleButton>
            <ToggleButton value="month">Monthly</ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Button variant="contained" size="small" onClick={loadData} disabled={!selectedField || loading}>Refresh</Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!selectedField ? (
        <InfoNote severity="info">Select a field to view the correlation chart.</InfoNote>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : data.length === 0 ? (
        <InfoNote severity="info">No data found for the selected field and period.</InfoNote>
      ) : (
        <Paper sx={{ p: 2 }}>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tickFormatter={formatPeriod} />
              <YAxis yAxisId="left" label={{ value: 'Input', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: 'Harvest (kg)', angle: 90, position: 'insideRight' }} />
              <Tooltip labelFormatter={formatPeriod} />
              <Legend />
              <Bar yAxisId="left" dataKey="waterM3" name="Water (m³)" fill="#2196f3" opacity={0.7} />
              <Bar yAxisId="left" dataKey="fertilizerKg" name="Fertilizer (kg)" fill="#ff9800" opacity={0.7} />
              <Line yAxisId="right" type="monotone" dataKey="harvestKg" name="Harvest (kg)" stroke="#4caf50" strokeWidth={3} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Paper>
      )}
    </Box>
  );
}
