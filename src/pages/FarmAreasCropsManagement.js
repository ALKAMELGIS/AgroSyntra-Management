import { useState, useEffect, useRef, Fragment } from 'react';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Chip,
  Autocomplete,
  IconButton,
  Collapse,
} from '@mui/material';
import { KeyboardArrowDownOutlined as KeyboardArrowDown, KeyboardArrowUpOutlined as KeyboardArrowUp, DeleteOutlined as DeleteIcon, AddOutlined as AddIcon } from '@mui/icons-material';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { loadMasterData, exportToExcel } from '../utils/masterDataUtils';
import {
  createFarmArea,
  deleteFarmArea,
  assignFarmAreaCrops,
  createCrop,
  updateCrop,
  fetchVarieties,
  createVariety,
  deleteVariety,
} from '../utils/backendApi';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { useNotification } from '../contexts/NotificationContext';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';
import PageTitle from '../components/PageTitle';
import ExportButton from '../components/ExportButton';

const AREA_FROZEN_WIDTHS = [180];
const CROP_FROZEN_WIDTHS = [44, 160];

const farmAreaSchema = Yup.object().shape({
  name: Yup.string().required('Farm Area name is required'),
  size: Yup.number().min(0, 'Size must be positive').required('Size is required'),
  description: Yup.string(),
});

function FarmAreasCropsManagement() {
  const [data, setData] = useState({ countries: [], crops: [], fieldTypes: [] });
  const [loading, setLoading] = useState(true);
  const notify = useNotification();
  const { t } = useTranslation();
  const { user } = useAuth();
  // On this managers' page only the operation manager edits the crop list;
  // CEO and farm manager see it read-only (the API enforces the same).
  const canEditCrops = user?.role === 'operation_manager';
  // Farm areas: same roles as the API — the operation manager and the data-entry
  // worker add, delete and assign crops on their sites. Farm manager (no data
  // entry), CEO and agronomist see them read-only.
  const canEditFarmAreas = ['operation_manager', 'worker'].includes(user?.role);
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [farmAreaDialog, setFarmAreaDialog] = useState(false);
  const [cropDialog, setCropDialog] = useState(false);
  const [expandedCropId, setExpandedCropId] = useState(null);
  const [varieties, setVarieties] = useState([]);
  const [varietyLoading, setVarietyLoading] = useState(false);
  const [newVarietyName, setNewVarietyName] = useState('');

  const refreshData = async () => {
    const loaded = await loadMasterData();
    setData(loaded);
    setLoading(false);
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

  const selectedCountryData = data.countries.find((c) => c.id === selectedCountry);
  const selectedSiteData = selectedCountryData?.sites.find((s) => s.id === selectedSite);

  const handleAddFarmArea = async (values, { resetForm }) => {
    try {
      const farmArea = await createFarmArea({
        siteId: selectedSite,
        name: values.name,
        size: values.size,
        description: values.description || '',
      });
      if (values.crops?.length) {
        const cropIds = values.crops.map((crop) => crop.id || crop);
        await assignFarmAreaCrops(farmArea.id, cropIds);
      }
      await refreshData();
      notify.success('Farm Area added successfully!');
      setFarmAreaDialog(false);
      resetForm();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleAddCrop = async (values, { resetForm }) => {
    try {
      await createCrop({
        name: values.cropName,
        dripperCount: values.dripperCount ? parseFloat(values.dripperCount) : null,
        dripTestCount: values.dripTestCount ? parseInt(values.dripTestCount, 10) : null,
        plantCount: values.plantCount ? parseInt(values.plantCount, 10) : null,
      });
      await refreshData();
      notify.success('Crop added successfully!');
      setCropDialog(false);
      resetForm();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleUpdateCropDripTestCount = async (cropName, dripTestCount) => {
    const crop = data.crops.find((c) => c.name === cropName);
    if (!crop) return;
    const parsed = dripTestCount === '' || dripTestCount == null ? null : parseInt(dripTestCount, 10);
    const current = crop.drip_test_count ?? crop.dripTestCount ?? null;
    if (parsed === current || (parsed == null && current == null)) return;
    try {
      await updateCrop(crop.id, {
        dripTestCount: parsed,
      });
      await refreshData();
      notify.success('Drip test count updated');
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleUpdateCropDripperCount = async (cropName, dripperCount) => {
    const crop = data.crops.find((c) => c.name === cropName);
    if (!crop) return;
    const parsed = dripperCount === '' || dripperCount == null ? null : parseFloat(dripperCount);
    const current = crop.dripper_count ?? crop.dripperCount ?? null;
    if (parsed === current || (parsed == null && current == null)) return;
    try {
      await updateCrop(crop.id, {
        dripperCount: parsed,
      });
      await refreshData();
      notify.success('Crop dripper count updated successfully!');
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleUpdateCropPlantCount = async (cropName, plantCount) => {
    const crop = data.crops.find((c) => c.name === cropName);
    if (!crop) return;
    const parsed = plantCount === '' || plantCount == null ? null : parseInt(plantCount, 10);
    const current = crop.plant_count ?? crop.plantCount ?? null;
    if (parsed === current || (parsed == null && current == null)) return;
    try {
      await updateCrop(crop.id, {
        plantCount: parsed,
      });
      await refreshData();
      notify.success('Plant count updated successfully!');
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleToggleCropVarieties = async (cropId) => {
    if (expandedCropId === cropId) {
      setExpandedCropId(null);
      return;
    }
    setExpandedCropId(cropId);
    setVarietyLoading(true);
    try {
      const data = await fetchVarieties(cropId);
      setVarieties(data);
    } catch (error) {
      notify.error(error.message);
      setVarieties([]);
    } finally {
      setVarietyLoading(false);
    }
  };

  const handleAddVariety = async (cropId) => {
    if (!newVarietyName.trim()) return;
    try {
      await createVariety(cropId, { name: newVarietyName.trim() });
      setNewVarietyName('');
      const data = await fetchVarieties(cropId);
      setVarieties(data);
      notify.success('Variety added');
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleDeleteVariety = async (cropId, varietyId) => {
    if (!(await confirm('Delete this variety?', { title: 'Delete Variety' }))) return;
    try {
      await deleteVariety(cropId, varietyId);
      const data = await fetchVarieties(cropId);
      setVarieties(data);
      notify.success('Variety deleted');
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleDeleteFarmArea = async (farmAreaId) => {
    if (await confirm('Are you sure you want to delete this farm area?', { title: 'Delete Farm Area' })) {
      try {
        await deleteFarmArea(farmAreaId);
        await refreshData();
        notify.success('Farm Area deleted successfully!');
      } catch (error) {
        notify.error(error.message);
      }
    }
  };

  const handleExport = () => {
    if (!selectedSiteData) return;
    const exportData = (selectedSiteData.farmAreas || []).map((fa) => ({
      'Farm Area Name': fa.name,
      'Size (hectares)': fa.size,
      Description: fa.description,
      Crops: (fa.crops || []).map((crop) => typeof crop === 'object' ? crop.name : crop).join(', '),
    }));
    exportToExcel(exportData, 'Farm_Areas_and_Crops');
    notify.success('Data exported to Excel!');
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box>
          <PageTitle sx={{ mb: 3 }}>Farm Areas & Crops Management</PageTitle>
          <TableSkeleton rows={5} columns={4} />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <PageTitle>Farm Areas & Crops Management</PageTitle>
          <ExportButton label="Export to Excel" onClick={handleExport} disabled={!selectedSiteData} />
        </Box>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
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
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              select
              label="Select Site"
              value={selectedSite}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              onChange={(e) => setSelectedSite(e.target.value)}
              disabled={!selectedCountry}
            >
              <MenuItem value="" disabled>
                Site
              </MenuItem>
              {selectedCountryData?.sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name} - {site.location}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        {selectedSiteData && (
          <>
            {!canEditFarmAreas && (
              <ReadOnlyBanner message={t('farmAreaAccess.viewOnly')} />
            )}
            <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
              {canEditFarmAreas && (
              <Button
                variant="contained"
                color="primary"
                onClick={() => setFarmAreaDialog(true)}
              >
                Add Farm Area
              </Button>
              )}
              {canEditCrops && (
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => setCropDialog(true)}
                >
                  Add New Crop
                </Button>
              )}
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 360px)' }}>
              <Table size="small" sx={[excelTableSx, freezeColumnsSx(AREA_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell className="col-frozen-0">Farm Area Name</TableCell>
                    <TableCell className="col-numeric">Size (hectares)</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Crops</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!selectedSiteData.farmAreas || selectedSiteData.farmAreas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No farm areas added yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedSiteData.farmAreas.map((farmArea, idx) => (
                      <TableRow key={farmArea.id} hover>
                        <GutterCell index={idx + 1} />
                        <TableCell className="col-frozen-0" title={farmArea.name}>{farmArea.name}</TableCell>
                        <TableCell className="col-numeric">{farmArea.size}</TableCell>
                        <TableCell>{farmArea.description || '-'}</TableCell>
                        <TableCell>
                          {farmArea.crops && farmArea.crops.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {farmArea.crops.map((crop, chipIdx) => {
                                const cropName = typeof crop === 'object' ? crop.name : crop;
                                return (
                                  <Chip
                                    key={chipIdx}
                                    label={cropName}
                                    size="small"
                                    sx={{
                                      maxWidth: 'fit-content',
                                      '& .MuiChip-label': {
                                        overflow: 'visible',
                                        whiteSpace: 'nowrap',
                                      },
                                    }}
                                  />
                                );
                              })}
                            </Box>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {canEditFarmAreas && (
                          <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            onClick={() => handleDeleteFarmArea(farmArea.id)}
                          >
                            Delete
                          </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* Add Farm Area Dialog */}
        <Dialog open={canEditFarmAreas && farmAreaDialog} onClose={() => setFarmAreaDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Farm Area</DialogTitle>
          <Formik
            initialValues={{ name: '', size: '', description: '', crops: [] }}
            validationSchema={farmAreaSchema}
            onSubmit={handleAddFarmArea}
          >
            {({ values, errors, touched, handleChange, handleBlur, setFieldValue, resetForm }) => (
              <Form>
                <DialogContent>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label="Farm Area Name"
                        name="name"
                        value={values.name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.name && !!errors.name}
                        helperText={touched.name && errors.name}
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Size (hectares)"
                        name="size"
                        value={values.size}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.size && !!errors.size}
                        helperText={touched.size && errors.size}
                        inputProps={{ min: 0, step: 0.01 }}
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Description"
                        name="description"
                        value={values.description}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                    </Grid>
                    <Grid size={12}>
                      <Autocomplete
                        multiple
                        options={data.crops || []}
                        getOptionLabel={(option) => typeof option === 'object' ? option.name : option}
                        value={values.crops || []}
                        onChange={(event, newValue) => {
                          setFieldValue('crops', newValue);
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Assign Crops"
                            placeholder="Select crops"
                          />
                        )}
                        renderTags={(value, getTagProps) =>
                          value.map((option, index) => {
                            const cropName = typeof option === 'object' ? option.name : option;
                            return (
                              <Chip
                                label={cropName}
                                {...getTagProps({ index })}
                                key={cropName}
                                sx={{
                                  maxWidth: 'fit-content',
                                  '& .MuiChip-label': {
                                    overflow: 'visible',
                                    whiteSpace: 'nowrap',
                                  },
                                }}
                              />
                            );
                          })
                        }
                      />
                    </Grid>
                  </Grid>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => { setFarmAreaDialog(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="contained" color="primary">
                    Add Farm Area
                  </Button>
                </DialogActions>
              </Form>
            )}
          </Formik>
        </Dialog>

        {/* Crops Management Section */}
        <Paper elevation={2} sx={{ p: 3, mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Crops Management</Typography>
            {canEditCrops && (
              <Button variant="contained" color="primary" onClick={() => setCropDialog(true)}>
                Add New Crop
              </Button>
            )}
          </Box>
          {!canEditCrops && (
            <ReadOnlyBanner message={t('cropHistoryAccess.cropListViewOnly')} />
          )}
          <TableContainer>
            <Table size="small" sx={[excelTableSx, freezeColumnsSx(CROP_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
              <TableHead>
                <TableRow>
                  <GutterCell />
                  <TableCell className="col-frozen-0" />
                  <TableCell className="col-frozen-1">Crop Name</TableCell>
                  <TableCell className="col-numeric">Dripper Count</TableCell>
                  <TableCell className="col-numeric">Plants</TableCell>
                  <TableCell className="col-numeric">Drip Test Count</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!data.crops || data.crops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No crops added yet
                    </TableCell>
                  </TableRow>
                ) : (
                  data.crops.map((crop, index) => {
                    const cropId = typeof crop === 'object' ? crop.id : null;
                    const cropName = typeof crop === 'object' ? crop.name : crop;
                    const dripperCount = typeof crop === 'object' ? crop.dripper_count : null;
                    const plantCount = typeof crop === 'object' ? (crop.plant_count ?? crop.plantCount ?? null) : null;
                    const dripTestCount = typeof crop === 'object' ? (crop.drip_test_count ?? crop.dripTestCount ?? null) : null;
                    const isExpanded = expandedCropId === cropId;
                    return (
                      <Fragment key={cropId || cropName || index}>
                        <TableRow hover>
                          <GutterCell index={index + 1} />
                          <TableCell className="col-frozen-0">
                            {cropId && (
                              <IconButton size="small" onClick={() => handleToggleCropVarieties(cropId)} aria-label={isExpanded ? 'Collapse row' : 'Expand row'}>
                                {isExpanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                              </IconButton>
                            )}
                          </TableCell>
                          <TableCell className="col-frozen-1" title={cropName}>{cropName}</TableCell>
                          <TableCell className="col-numeric">
                            <TextField
                              type="number"
                              size="small"
                              key={`dripper-${cropId}-${dripperCount ?? 'empty'}`}
                              defaultValue={dripperCount ?? ''}
                              onBlur={(e) => handleUpdateCropDripperCount(cropName, e.target.value)}
                              placeholder="e.g., 24000"
                              inputProps={{ min: 0, step: 1 }}
                              disabled={!canEditCrops}
                              sx={{ width: 150 }}
                              helperText={dripperCount ? `${Number(dripperCount).toLocaleString()} drippers` : 'For EC/pH water calc'}
                              FormHelperTextProps={{ sx: { margin: 0, fontSize: '0.6875rem' } }}
                            />
                          </TableCell>
                          <TableCell className="col-numeric">
                            <TextField
                              type="number"
                              size="small"
                              key={`plants-${cropId}-${plantCount ?? 'empty'}`}
                              defaultValue={plantCount ?? ''}
                              onBlur={(e) => handleUpdateCropPlantCount(cropName, e.target.value)}
                              placeholder="e.g., 30000"
                              inputProps={{ min: 0, step: 1 }}
                              disabled={!canEditCrops}
                              sx={{ width: 150 }}
                              helperText={plantCount ? `${Number(plantCount).toLocaleString()} plants` : 'For scouting infestation %'}
                              FormHelperTextProps={{ sx: { margin: 0, fontSize: '0.6875rem' } }}
                            />
                          </TableCell>
                          <TableCell className="col-numeric">
                            <TextField
                              type="number"
                              size="small"
                              key={`driptest-${cropId}-${dripTestCount ?? 'empty'}`}
                              defaultValue={dripTestCount ?? ''}
                              onBlur={(e) => handleUpdateCropDripTestCount(cropName, e.target.value)}
                              placeholder="e.g., 12"
                              inputProps={{ min: 0, step: 1 }}
                              disabled={!canEditCrops}
                              sx={{ width: 120 }}
                              helperText={dripTestCount ? `${dripTestCount} emitters/test` : 'Emitters per grow bag test'}
                              FormHelperTextProps={{ sx: { margin: 0, fontSize: '0.6875rem' } }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={dripperCount ? `${Number(dripperCount).toLocaleString()} drippers` : 'No drip calc'}
                              size="small"
                              color={dripperCount ? 'success' : 'default'}
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                            <Chip
                              label={plantCount ? `${Number(plantCount).toLocaleString()} plants` : 'No plant count'}
                              size="small"
                              color={plantCount ? 'primary' : 'default'}
                              sx={{ mr: 0.5, mb: 0.5 }}
                            />
                            <Chip
                              label={dripTestCount ? `${dripTestCount} test emitters` : 'No test count'}
                              size="small"
                              color={dripTestCount ? 'info' : 'default'}
                            />
                          </TableCell>
                        </TableRow>
                        {cropId && (
                          <TableRow>
                            <TableCell colSpan={7} sx={{ py: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box sx={{ py: 2, pl: 6 }}>
                                  <Typography variant="subtitle2" gutterBottom>
                                    Varieties for {cropName}
                                  </Typography>
                                  {varietyLoading ? (
                                    <Typography variant="body2" color="text.secondary">Loading...</Typography>
                                  ) : (
                                    <>
                                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                                        {varieties.length === 0 ? (
                                          <Typography variant="body2" color="text.secondary">No varieties yet</Typography>
                                        ) : (
                                          varieties.map((v) => (
                                            <Chip
                                              key={v.id}
                                              label={v.name}
                                              onDelete={canEditCrops ? () => handleDeleteVariety(cropId, v.id) : undefined}
                                              color="primary"
                                              variant="outlined"
                                              size="small"
                                            />
                                          ))
                                        )}
                                      </Box>
                                      {canEditCrops && (
                                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                        <TextField
                                          size="small"
                                          placeholder="New variety name"
                                          value={newVarietyName}
                                          onChange={(e) => setNewVarietyName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handleAddVariety(cropId);
                                            }
                                          }}
                                          sx={{ width: 200 }}
                                        />
                                        <Button
                                          size="small"
                                          variant="contained"
                                          startIcon={<AddIcon />}
                                          onClick={() => handleAddVariety(cropId)}
                                          disabled={!newVarietyName.trim()}
                                        >
                                          Add
                                        </Button>
                                      </Box>
                                      )}
                                    </>
                                  )}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Add Crop Dialog */}
        <Dialog open={canEditCrops && cropDialog} onClose={() => setCropDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add New Crop</DialogTitle>
          <Formik
            initialValues={{ cropName: '', dripperCount: '', plantCount: '', dripTestCount: '' }}
            validationSchema={Yup.object().shape({
              cropName: Yup.string().required('Crop name is required'),
              dripperCount: Yup.number().min(0, 'Dripper count must be positive').nullable(),
              plantCount: Yup.number().integer().min(0, 'Plant count must be positive').nullable(),
              dripTestCount: Yup.number().integer().min(0, 'Must be positive').nullable(),
            })}
            onSubmit={handleAddCrop}
          >
            {({ values, errors, touched, handleChange, handleBlur, resetForm }) => (
              <Form>
                <DialogContent>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label="Crop Name"
                        name="cropName"
                        value={values.cropName}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.cropName && !!errors.cropName}
                        helperText={touched.cropName && errors.cropName}
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Dripper Count"
                        name="dripperCount"
                        value={values.dripperCount}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.dripperCount && !!errors.dripperCount}
                        helperText={touched.dripperCount && errors.dripperCount || 'Total drippers for EC/pH water calc'}
                        inputProps={{ min: 0, step: 1 }}
                        placeholder="e.g., 24000"
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Plants"
                        name="plantCount"
                        value={values.plantCount}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.plantCount && !!errors.plantCount}
                        helperText={touched.plantCount && errors.plantCount || 'Total plants for scouting infestation %'}
                        inputProps={{ min: 0, step: 1 }}
                        placeholder="e.g., 30000"
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Drip Test Count"
                        name="dripTestCount"
                        value={values.dripTestCount}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.dripTestCount && !!errors.dripTestCount}
                        helperText={touched.dripTestCount && errors.dripTestCount || 'Emitters per grow bag test'}
                        inputProps={{ min: 0, step: 1 }}
                        placeholder="e.g., 12 Tomato, 15 Capsicum"
                      />
                    </Grid>
                  </Grid>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => { setCropDialog(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="contained" color="primary">
                    Add Crop
                  </Button>
                </DialogActions>
              </Form>
            )}
          </Formik>
        </Dialog>
      </Box>
      {confirmDialog}
    </Container>
  );
}

export default FarmAreasCropsManagement;
