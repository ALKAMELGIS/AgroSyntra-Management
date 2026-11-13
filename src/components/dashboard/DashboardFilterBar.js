import { useMemo } from 'react';
import { Paper, Grid, TextField, MenuItem } from '@mui/material';

function DashboardFilterBar({
  filters,
  onChange,
  masterData,
  showDateRange = true,
  showCrop = false,
}) {
  const { zones, sites, farmAreas, fields, crops } = useMemo(() => {
    const zones = [];
    const sites = [];
    const farmAreas = [];
    const fields = [];
    const cropSet = new Map();

    (masterData?.countries ?? []).forEach((country) => {
      zones.push({ id: country.id, name: country.name });
      (country.sites ?? []).forEach((site) => {
        sites.push({ id: site.id, name: site.name, zoneId: country.id });
        (site.farmAreas ?? []).forEach((fa) => {
          farmAreas.push({ id: fa.id, name: fa.name, siteId: site.id });
          (fa.fields ?? []).forEach((f) => {
            fields.push({ id: f.id, name: f.name, farmAreaId: fa.id });
            if (f.currentCrop && !cropSet.has(f.currentCrop)) {
              cropSet.set(f.currentCrop, f.currentCropName || f.currentCrop);
            }
          });
        });
      });
    });

    const crops = Array.from(cropSet.entries()).map(([id, name]) => ({ id, name }));
    return { zones, sites, farmAreas, fields, crops };
  }, [masterData]);

  const filteredSites = filters.zone ? sites.filter((s) => s.zoneId === filters.zone) : sites;
  const filteredFarmAreas = filters.site ? farmAreas.filter((fa) => fa.siteId === filters.site) : farmAreas;
  const filteredFields = filters.farmArea ? fields.filter((f) => f.farmAreaId === filters.farmArea) : fields;

  const update = (key, value) => {
    const next = { ...filters, [key]: value };
    if (key === 'zone') { next.site = ''; next.farmArea = ''; next.field = ''; }
    if (key === 'site') { next.farmArea = ''; next.field = ''; }
    if (key === 'farmArea') { next.field = ''; }
    onChange(next);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Grid container spacing={1.5} alignItems="center">
        {showDateRange && (
          <>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField
                fullWidth size="small" type="date" label="From"
                InputLabelProps={{ shrink: true }}
                value={filters.dateFrom || ''}
                onChange={(e) => update('dateFrom', e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <TextField
                fullWidth size="small" type="date" label="To"
                InputLabelProps={{ shrink: true }}
                value={filters.dateTo || ''}
                onChange={(e) => update('dateTo', e.target.value)}
              />
            </Grid>
          </>
        )}
        <Grid size={{ xs: 6, sm: 3, md: showDateRange ? 2 : 3 }}>
          <TextField fullWidth size="small" select label="Zone" value={filters.zone || ''} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
            onChange={(e) => update('zone', e.target.value)}>
            <MenuItem value="">All Zones</MenuItem>
            {zones.map((z) => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: showDateRange ? 2 : 3 }}>
          <TextField fullWidth size="small" select label="Site" value={filters.site || ''} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
            onChange={(e) => update('site', e.target.value)} disabled={filteredSites.length === 0}>
            <MenuItem value="">All Sites</MenuItem>
            {filteredSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: showDateRange ? 2 : 3 }}>
          <TextField fullWidth size="small" select label="Farm Area" value={filters.farmArea || ''} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
            onChange={(e) => update('farmArea', e.target.value)} disabled={!filters.site}>
            <MenuItem value="">All Areas</MenuItem>
            {filteredFarmAreas.map((fa) => <MenuItem key={fa.id} value={fa.id}>{fa.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: showDateRange ? 2 : 3 }}>
          <TextField fullWidth size="small" select label="Field" value={filters.field || ''} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
            onChange={(e) => update('field', e.target.value)} disabled={!filters.farmArea}>
            <MenuItem value="">All Fields</MenuItem>
            {filteredFields.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
          </TextField>
        </Grid>
        {showCrop && (
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <TextField fullWidth size="small" select label="Crop" value={filters.crop || ''} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
              onChange={(e) => update('crop', e.target.value)}>
              <MenuItem value="">All Crops</MenuItem>
              {crops.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}

export default DashboardFilterBar;
