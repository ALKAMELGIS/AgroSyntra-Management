import { useEffect, useState } from 'react';
import {
  Box, FormControl, Grid, InputLabel, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import IrrigationDashboardView from '../dashboard/IrrigationDashboard';

export default function IrrigationDashboard() {
  const { activeSiteId, allSites } = useActiveSite();
  const [siteId, setSiteId] = useState(activeSiteId || '');
  const { startDate: dateFrom, endDate: dateTo, setStartDate: setDateFrom, setEndDate: setDateTo, seasonStart, seasonEnd } = useSeasonListDates();

  useEffect(() => {
    if (activeSiteId && !siteId) setSiteId(activeSiteId);
  }, [activeSiteId, siteId]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>Irrigation Dashboard</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Water and cycles from Irrigation Entry (RC-108) plus separately entered pivot irrigation.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4, md: 3 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Site</InputLabel>
            <Select value={siteId} label="Site" onChange={(e) => setSiteId(e.target.value)}>
              {(allSites || []).map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <TextField
            size="small"
            fullWidth
            type="date"
            label="From"
            InputLabelProps={{ shrink: true }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <TextField
            size="small"
            fullWidth
            type="date"
            label="To"
            InputLabelProps={{ shrink: true }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
          />
        </Grid>
      </Grid>

      <IrrigationDashboardView
        siteId={siteId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        fieldId=""
        allFields={[]}
      />
    </Box>
  );
}
