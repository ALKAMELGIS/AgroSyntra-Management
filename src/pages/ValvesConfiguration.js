import { useState, useEffect, useRef } from 'react';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { canEditFields } from '../utils/roleAccess';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  MenuItem,
} from '@mui/material';
import { useNotification } from '../contexts/NotificationContext';
import { loadMasterData, exportToExcel } from '../utils/masterDataUtils';
import { fetchFieldValves, replaceFieldValves } from '../utils/backendApi';
import { excelTableSx, GutterCell } from '../components/table/ExcelTable';
import PageTitle from '../components/PageTitle';

function ValvesConfiguration() {
  const notify = useNotification();
  const { t } = useTranslation();
  const { user } = useAuth();
  // Operation manager and data entry worker change valves; CEO and farm manager watch (API enforces).
  const canEdit = canEditFields(user);
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [data, setData] = useState({ countries: [], crops: [], fieldTypes: [] });
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedFarmArea, setSelectedFarmArea] = useState('');
  const [selectedFieldName, setSelectedFieldName] = useState('');
  const [valves, setValves] = useState([]);

  const refreshData = async () => {
    const loaded = await loadMasterData();
    setData(loaded);
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (activeSiteId && data.countries.length && !appliedActiveSite.current) {
      for (const c of data.countries) {
        const s = c.sites?.find((st) => st.id === activeSiteId);
        if (s) {
          appliedActiveSite.current = true;
          setSelectedCountry(c.id);
          setSelectedSite(s.id);
          break;
        }
      }
    }
  }, [activeSiteId, data.countries]);

  useEffect(() => {
    loadValves();
  }, [selectedCountry, selectedSite, selectedFarmArea, selectedFieldName]);

  const selectedCountryData = data.countries.find((c) => c.id === selectedCountry);
  const selectedSiteData = selectedCountryData?.sites.find((s) => s.id === selectedSite);
  const selectedFarmAreaData = selectedSiteData?.farmAreas?.find((fa) => fa.id === selectedFarmArea);
  const selectedFieldData = selectedFarmAreaData?.fields?.find((f) => f.name === selectedFieldName);

  const loadValves = async () => {
    if (!selectedFieldData) {
      setValves([]);
      return;
    }

    try {
      const savedValves = await fetchFieldValves(selectedFieldData.id);
      if (savedValves.length > 0) {
        setValves(savedValves.map((v) => ({ id: v.id, number: v.number, name: v.name || '' })));
        return;
      }
    } catch (error) {
      console.warn('Failed to load valves from API', error);
    }

    const valveCount = selectedFieldData.valves || 0;
    const newValves = Array.from({ length: valveCount }, (_, i) => ({
      id: `${selectedFieldData.id}-${i + 1}`,
      number: i + 1,
      name: String(i + 1),
    }));
    setValves(newValves);
  };

  const handleSaveConfiguration = async () => {
    if (!selectedCountry || !selectedSite || !selectedFarmArea || !selectedFieldName || !selectedFieldData) {
      notify.error('Please select all required fields');
      return;
    }
    try {
      await replaceFieldValves(
        selectedFieldData.id,
        valves.map((v) => ({ number: Number(v.number), name: v.name }))
      );
      notify.success('Valve configuration saved successfully!');
      await refreshData();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleValveChange = (valveId, field, value) => {
    setValves((prev) =>
      prev.map((v) => (v.id === valveId ? { ...v, [field]: value } : v))
    );
  };

  const handleAddValve = () => {
    const newValve = {
      id: `${selectedFieldData?.id || 'temp'}-${valves.length + 1}`,
      number: valves.length + 1,
      name: String(valves.length + 1),
    };
    setValves((prev) => [...prev, newValve]);
  };

  const handleDeleteValve = async (valveId) => {
    if (await confirm('Are you sure you want to delete this valve?', { title: 'Delete Valve' })) {
      setValves((prev) => prev.filter((v) => v.id !== valveId));
    }
  };

  const handleExport = async () => {
    if (!selectedSiteData || !selectedFarmAreaData) return;
    const exportData = [];
    
    for (const field of selectedFarmAreaData.fields || []) {
      const valveConfig = await fetchFieldValves(field.id);
      if (valveConfig.length > 0) {
        valveConfig.forEach((valve) => {
          exportData.push({
            Zone: selectedCountryData?.name,
            Site: selectedSiteData?.name,
            'Farm Area': selectedFarmAreaData?.name,
            'Field Name': field.name,
            'Field Type': field.type,
            'Assigned Crop': field.currentCrop || field.crop, // Support migration
            'Valve Number': valve.number,
            'Valve Name': valve.name,
          });
        });
      } else {
        // Export field even if no valves configured
        exportData.push({
          Zone: selectedCountryData?.name,
          Site: selectedSiteData?.name,
          'Farm Area': selectedFarmAreaData?.name,
          'Field Name': field.name,
          'Field Type': field.type,
          'Assigned Crop': field.crop,
          'Valve Number': '-',
          'Valve Name': '-',
        });
      }
    }
    
    exportToExcel(exportData, 'Valves_Configuration');
    notify.success('Data exported to Excel!');
  };

  return (
    <Container maxWidth="lg">
      <Paper elevation={3} sx={{ p: 4, mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <PageTitle>Valves Configuration</PageTitle>
          <Button
            variant="contained"
            color="primary"
            onClick={handleExport}
            disabled={!selectedFarmAreaData}
          >
            Export to Excel
          </Button>
        </Box>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Select Zone"
              value={selectedCountry}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setSelectedSite('');
                setSelectedFarmArea('');
                setSelectedFieldName('');
              }}
            >
              <MenuItem value="" disabled>
                Zone
              </MenuItem>
              {data.countries.map((country) => (
                <MenuItem key={country.id} value={country.id}>
                  {country.name} ({country.code})
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Select Site"
              value={selectedSite}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              onChange={(e) => {
                setSelectedSite(e.target.value);
                setSelectedFarmArea('');
                setSelectedFieldName('');
              }}
              disabled={!selectedCountry}
            >
              <MenuItem value="" disabled>
                Site
              </MenuItem>
              {selectedCountryData?.sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Select Farm Area"
              value={selectedFarmArea}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              onChange={(e) => {
                setSelectedFarmArea(e.target.value);
                setSelectedFieldName('');
              }}
              disabled={!selectedSite}
            >
              <MenuItem value="" disabled>
                Farm Area
              </MenuItem>
              {selectedSiteData?.farmAreas?.map((farmArea) => (
                <MenuItem key={farmArea.id} value={farmArea.id}>
                  {farmArea.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Select Field Name"
              value={selectedFieldName}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              onChange={(e) => setSelectedFieldName(e.target.value)}
              disabled={!selectedFarmArea}
            >
              <MenuItem value="" disabled>
                Field
              </MenuItem>
              {selectedFarmAreaData?.fields?.map((field) => (
                <MenuItem key={field.id} value={field.name}>
                  {field.name} ({field.type})
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        {selectedFieldName && selectedFieldData && (
          <>
            {!canEdit && <ReadOnlyBanner message={t('fieldsAccess.valvesViewOnly')} />}
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6">
                  Valves for {selectedFieldName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Type: {selectedFieldData.type} | Crop: {selectedFieldData.currentCrop || selectedFieldData.crop} | Default Valve Count: {selectedFieldData.valves}
                </Typography>
              </Box>
              {canEdit && (
                <Box>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleAddValve}
                    sx={{ mr: 1 }}
                  >
                    Add Valve
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSaveConfiguration}
                  >
                    Save Configuration
                  </Button>
                </Box>
              )}
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small" sx={excelTableSx}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell>Valve Number</TableCell>
                    <TableCell>Valve Name</TableCell>
                    {canEdit && <TableCell>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {valves.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 4 : 3} align="center">
                        {canEdit ? 'No valves configured. Click "Add Valve" to add valves.' : 'No valves configured.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    valves.map((valve, idx) => (
                      <TableRow key={valve.id} hover>
                        <GutterCell index={idx + 1} />
                        <TableCell>
                          {canEdit ? (
                            <TextField
                              type="number"
                              value={valve.number}
                              onChange={(e) =>
                                handleValveChange(valve.id, 'number', parseInt(e.target.value))
                              }
                              inputProps={{ min: 1, step: 1 }}
                              size="small"
                              sx={{ width: 100 }}
                            />
                          ) : valve.number}
                        </TableCell>
                        <TableCell>
                          {canEdit ? (
                            <TextField
                              value={valve.name}
                              onChange={(e) => handleValveChange(valve.id, 'name', e.target.value)}
                              size="small"
                              sx={{ width: 150 }}
                            />
                          ) : valve.name}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              variant="outlined"
                              size="small"
                              color="error"
                              onClick={() => handleDeleteValve(valve.id)}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
      {confirmDialog}
    </Container>
  );
}

export default ValvesConfiguration;
