import { useState, useEffect, useRef } from 'react';
import FormikSubmitFeedback from '../components/FormikSubmitFeedback';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Chip,
  Divider,
  Link,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { QRCodeSVG } from 'qrcode.react';
import { useNotification } from '../contexts/NotificationContext';
import { loadMasterData, exportToExcel } from '../utils/masterDataUtils';
import { apiRequest } from '../utils/api';
import {
  createField,
  updateField,
  deleteField,
  fetchFieldCropHistory,
  fetchFieldTypes,
  fetchCrops,
  fetchVarieties,
} from '../utils/backendApi';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { excelTableSx, freezeColumnsSx, GutterCell, GUTTER_WIDTH } from '../components/table/ExcelTable';
import InfoNote from '../components/InfoNote';
import PageTitle from '../components/PageTitle';
import ExportButton from '../components/ExportButton';

const FIELD_FROZEN_WIDTHS = [160];

const fieldSchema = Yup.object().shape({
  fieldType: Yup.string().required('Field Type is required'),
  fieldName: Yup.string().required('Field Name is required'),
  assignedCrop: Yup.string().required('Assigned Crop is required'),
  valveCount: Yup.number().min(0, 'Valve count must be 0 or more').required('Valve count is required'),
  area: Yup.number().min(0, 'Area must be positive').nullable(),
  latitude: Yup.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').nullable(),
  longitude: Yup.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').nullable(),
});

// Helper function to format date
const formatDate = (dateString) => {
  if (!dateString) return 'Current';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Helper function to calculate days between dates
const calculateDays = (startDate, endDate) => {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Crop changes belong to workers and agronomists in Crop Rotation; the field edit here never changes the crop.
const CROP_ROTATION_PATH = '/admin/crop-history?tab=rotation';

function CropRotationNote({ sx }) {
  return (
    <InfoNote mode="line" severity="info" sx={sx}>
      Change crops in{' '}
      <Link component={RouterLink} to={CROP_ROTATION_PATH}>
        Crop History → Crop Rotation
      </Link>
      {' '}(workers and agronomists record crop changes).
    </InfoNote>
  );
}

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

function FieldTypesNamesManagement() {
  const notify = useNotification();
  const { t } = useTranslation();
  const { user } = useAuth();
  // The operation manager and data entry worker edit fields and valve counts;
  // the farm manager (no data entry) and the CEO watch. The API enforces the same.
  const canEdit = canEditFields(user);
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const [data, setData] = useState({ countries: [], crops: [], fieldTypes: [] });
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedFarmArea, setSelectedFarmArea] = useState('');
  const [fieldDialog, setFieldDialog] = useState(false);
  const [bulkCreateDialog, setBulkCreateDialog] = useState(false);
  const [editFieldDialog, setEditFieldDialog] = useState({ open: false, field: null });
  const [historyDialog, setHistoryDialog] = useState({ open: false, field: null });
  const [qrDialog, setQrDialog] = useState({ open: false, field: null });
  const [qrBulkOpen, setQrBulkOpen] = useState(false);
  const [varietyOptions, setVarietyOptions] = useState([]);
  const [plantingVarieties, setPlantingVarieties] = useState({});

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

  useEffect(() => {
    if (!selectedSite) return;
    apiRequest(`/planting-records?site_id=${selectedSite}`)
      .then((records) => {
        const map = {};
        for (const r of records) {
          if (!r.field_id || !r.variety_name) continue;
          if (!map[r.field_id]) map[r.field_id] = new Set();
          map[r.field_id].add(r.variety_name);
        }
        const result = {};
        for (const [fieldId, varieties] of Object.entries(map)) {
          result[fieldId] = [...varieties].join(', ');
        }
        setPlantingVarieties(result);
      })
      .catch(() => {});
  }, [selectedSite]);

  const selectedCountryData = data.countries.find((c) => c.id === selectedCountry);
  const selectedSiteData = selectedCountryData?.sites.find((s) => s.id === selectedSite);
  const selectedFarmAreaData = selectedSiteData?.farmAreas?.find((fa) => fa.id === selectedFarmArea);

  // Get field type naming pattern and default valve count
  const getFieldTypeInfo = (fieldTypeName) => {
    const fieldType = data.fieldTypes.find((ft) => ft.name === fieldTypeName);
    return fieldType || { namingPattern: '', defaultValveCount: 0 };
  };

  // Generate field name suggestions based on type
  const getFieldNameSuggestions = (fieldTypeName) => {
    const fieldType = data.fieldTypes.find((ft) => ft.name === fieldTypeName);
    if (!fieldType) return [];
    
    const existingFields = selectedFarmAreaData?.fields || [];
    const existingNames = existingFields.map((f) => f.name);
    
    const suggestions = [];
    const pattern = fieldType.namingPattern || `${fieldTypeName}-{1}`;
    for (let i = 1; i <= 20; i++) {
      let name = pattern;
      if (name.includes('{01}')) {
        name = name.replace('{01}', String(i).padStart(2, '0'));
      } else if (name.includes('{A}')) {
        name = name.replace('{A}', String.fromCharCode(64 + i));
      } else if (name.includes('{1}')) {
        name = name.replace('{1}', String(i));
      }
      if (!existingNames.includes(name)) {
        suggestions.push(name);
      }
    }
    return suggestions.slice(0, 5);
  };

  // Get current crop info for display
  const getCurrentCropInfo = (field) => {
    if (!field) return { crop: null, startDate: null };
    const currentCrop = field.currentCrop || field.crop; // Support migration
    const history = field.cropHistory || [];
    const currentEntry = history.find((h) => h.endDate === null);
    return {
      crop: currentCrop,
      startDate: currentEntry?.startDate || null,
    };
  };

  const loadVarietiesForCrop = async (cropName) => {
    const allCrops = data.crops || [];
    const crop = allCrops.find((c) => (typeof c === 'object' ? c.name : c) === cropName);
    const cropId = typeof crop === 'object' ? crop.id : null;
    if (!cropId) {
      setVarietyOptions([]);
      return;
    }
    try {
      const varieties = await fetchVarieties(cropId);
      setVarietyOptions(varieties);
    } catch {
      setVarietyOptions([]);
    }
  };

  const openHistoryDialog = async (field) => {
    try {
      const history = await fetchFieldCropHistory(field.id);
      setHistoryDialog({ open: true, field: { ...field, cropHistory: history } });
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleAddField = async (values, { resetForm }) => {
    try {
      let polygon;
      if (values.polygon && values.polygon.trim()) {
        const parsed = JSON.parse(values.polygon);
        if (Array.isArray(parsed)) {
          polygon = parsed;
        }
      }

      const fieldType = data.fieldTypes.find((ft) => ft.name === values.fieldType);
      if (!fieldType) {
        notify.error('Field type not found');
        return;
      }

      let fieldTypeId = fieldType.id;
      if (!isUuid(fieldTypeId)) {
        const apiFieldTypes = await fetchFieldTypes();
        fieldTypeId = apiFieldTypes.find((ft) => ft.name === values.fieldType)?.id;
      }

      const farmAreaCrops = selectedFarmAreaData?.crops || [];
      let crop = farmAreaCrops.find((c) => c.name === values.assignedCrop);
      let currentCropId = crop?.id;
      if (!isUuid(currentCropId) && values.assignedCrop) {
        const apiCrops = await fetchCrops();
        currentCropId = apiCrops.find((c) => c.name === values.assignedCrop)?.id;
      }

      const valveCountValue = Number(values.valveCount);
      const areaValue = values.area ? Number(values.area) : undefined;
      const latitudeValue = values.latitude ? Number(values.latitude) : undefined;
      const longitudeValue = values.longitude ? Number(values.longitude) : undefined;

      const payload = {
        farmAreaId: selectedFarmArea,
        fieldTypeId,
        name: values.fieldName,
        currentCropId,
        ...(values.varietyId ? { varietyId: values.varietyId } : {}),
        ...(Number.isFinite(valveCountValue) ? { valveCount: valveCountValue } : {}),
        ...(Number.isFinite(areaValue) ? { area: areaValue } : {}),
        ...(Number.isFinite(latitudeValue) ? { latitude: latitudeValue } : {}),
        ...(Number.isFinite(longitudeValue) ? { longitude: longitudeValue } : {}),
        ...(polygon ? { polygon } : {}),
      };

      await createField(payload);

      await refreshData();
      notify.success('Field added successfully!');
      setFieldDialog(false);
      resetForm();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleBulkCreate = async (values, { resetForm }) => {
    const fieldType = data.fieldTypes.find((ft) => ft.name === 'NetHouse');
    if (!fieldType) {
      notify.error('NetHouse field type not found!');
      return;
    }

    const start = parseInt(values.startNumber);
    const end = parseInt(values.endNumber);
    const prefix = values.prefix || 'NH-';
    const newFields = [];

    for (let i = start; i <= end; i++) {
      const fieldName = `${prefix}${String(i).padStart(2, '0')}`;
      const existingFields = selectedFarmAreaData?.fields || [];
      if (!existingFields.find((f) => f.name === fieldName)) {
        newFields.push({
          name: fieldName,
          valves: parseInt(values.valveCount) || 4,
        });
      }
    }

    if (newFields.length === 0) {
      notify.warning('No new fields created (all already exist)');
      setBulkCreateDialog(false);
      resetForm();
      return;
    }

    try {
      let fieldTypeId = fieldType.id;
      if (!isUuid(fieldTypeId)) {
        const apiFieldTypes = await fetchFieldTypes();
        fieldTypeId = apiFieldTypes.find((ft) => ft.name === 'NetHouse')?.id;
      }

      const farmAreaCrops = selectedFarmAreaData?.crops || [];
      let crop = farmAreaCrops.find((c) => c.name === values.assignedCrop);
      let currentCropId = crop?.id;
      if (!isUuid(currentCropId) && values.assignedCrop) {
        const apiCrops = await fetchCrops();
        currentCropId = apiCrops.find((c) => c.name === values.assignedCrop)?.id;
      }

      let createdCount = 0;
      for (const field of newFields) {
        await createField({
          farmAreaId: selectedFarmArea,
          fieldTypeId,
          name: field.name,
          currentCropId,
          valveCount: field.valves,
        });
        createdCount += 1;
      }
      await refreshData();
      notify.success(`${createdCount} NetHouses created successfully!`);
    } catch (error) {
      notify.error(error.message);
    }

    setBulkCreateDialog(false);
    resetForm();
  };

  const handleUpdateField = async (values, { resetForm }) => {
    try {
      const original = editFieldDialog.field;
      let polygon;
      if (values.polygon && values.polygon.trim()) {
        const parsed = JSON.parse(values.polygon);
        if (Array.isArray(parsed)) {
          polygon = parsed;
        }
      } else if (original.polygon) {
        polygon = []; // cleared
      }
      const name = values.name.trim();
      // The API rejects null for these, so empty inputs are simply not sent.
      await updateField(original.id, {
        ...(name && name !== original.name ? { name } : {}),
        valveCount: parseInt(values.valveCount),
        ...(values.area !== '' && values.area != null ? { area: parseFloat(values.area) } : {}),
        ...(values.latitude !== '' && values.latitude != null ? { latitude: parseFloat(values.latitude) } : {}),
        ...(values.longitude !== '' && values.longitude != null ? { longitude: parseFloat(values.longitude) } : {}),
        ...(polygon !== undefined ? { polygon } : {}),
      });
      await refreshData();
      notify.success('Field updated successfully!');
      setEditFieldDialog({ open: false, field: null });
      resetForm();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleDeleteField = async (fieldId) => {
    if (await confirm('Are you sure you want to delete this field?', { title: 'Delete Field' })) {
      try {
        await deleteField(fieldId);
        await refreshData();
        notify.success('Field deleted successfully!');
      } catch (error) {
        notify.error(error.message);
      }
    }
  };

  const handleExport = () => {
    if (!selectedFarmAreaData) return;
    const exportData = (selectedFarmAreaData.fields || []).map((field) => {
      const currentCrop = field.currentCrop || field.crop; // Support migration
      return {
        'Farm Area': selectedFarmAreaData.name,
        'Field Name': field.name,
        'Field Type': field.type,
        'Current Crop': currentCrop,
        'Variety': plantingVarieties[field.id] || field.varietyName || '-',
        'Valve Count': field.valves,
      };
    });
    exportToExcel(exportData, 'Fields_Management');
    notify.success('Data exported to Excel!');
  };

  const handleExportHistory = () => {
    if (!selectedFarmAreaData) return;
    const exportData = [];
    (selectedFarmAreaData.fields || []).forEach((field) => {
      const history = field.cropHistory || [];
      if (history.length === 0) {
        // Support migration
        const currentCrop = field.currentCrop || field.crop;
        if (currentCrop) {
          exportData.push({
            'Field Name': field.name,
            Crop: currentCrop,
            'Start Date': 'Unknown',
            'End Date': 'Current',
            'Duration (days)': 'N/A',
          });
        }
      } else {
        history.forEach((entry) => {
          const duration = calculateDays(entry.startDate, entry.endDate);
          exportData.push({
            'Field Name': field.name,
            Crop: entry.crop,
            'Start Date': entry.startDate || 'Unknown',
            'End Date': entry.endDate || 'Current',
            'Duration (days)': entry.endDate ? duration : 'Ongoing',
          });
        });
      }
    });
    exportToExcel(exportData, 'Crop_History');
    notify.success('Crop history exported to Excel!');
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box>
          <PageTitle sx={{ mb: 3 }}>Field Types & Names Management</PageTitle>
          <TableSkeleton rows={6} columns={5} />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3, mb: 3 }}>
          <PageTitle>Field Types & Names Management</PageTitle>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ExportButton label="Export crop history" onClick={handleExportHistory} disabled={!selectedFarmAreaData} />
            <ExportButton label="Export to Excel" onClick={handleExport} disabled={!selectedFarmAreaData} />
          </Box>
        </Box>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
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
              }}
            >
              <MenuItem value="" disabled>
                Zone
              </MenuItem>
              {data.countries.length === 0 && (
                <MenuItem value="" disabled>
                  No zones yet
                </MenuItem>
              )}
              {data.countries.map((country) => (
                <MenuItem key={country.id} value={country.id}>
                  {country.name} ({country.code})
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
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
              }}
              disabled={!selectedCountry}
            >
              <MenuItem value="" disabled>
                Site
              </MenuItem>
              {!selectedCountryData?.sites?.length && (
                <MenuItem value="" disabled>
                  No sites yet
                </MenuItem>
              )}
              {selectedCountryData?.sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              select
              label="Select Farm Area"
              value={selectedFarmArea}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              onChange={(e) => setSelectedFarmArea(e.target.value)}
              disabled={!selectedSite}
            >
              <MenuItem value="" disabled>
                Farm Area
              </MenuItem>
              {!selectedSiteData?.farmAreas?.length && (
                <MenuItem value="" disabled>
                  No farm areas yet
                </MenuItem>
              )}
              {selectedSiteData?.farmAreas?.map((farmArea) => (
                <MenuItem key={farmArea.id} value={farmArea.id}>
                  {farmArea.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        {selectedFarmAreaData && (
          <>
            {!canEdit && <ReadOnlyBanner message={t('fieldsAccess.fieldsViewOnly')} />}
            <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
              {canEdit && (
                <>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setFieldDialog(true)}
                  >
                    Add Field
                  </Button>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => setBulkCreateDialog(true)}
                  >
                    Bulk Create NetHouses
                  </Button>
                </>
              )}
              <Button
                variant="outlined"
                onClick={() => setQrBulkOpen(true)}
                disabled={!selectedFarmAreaData?.fields?.length}
              >
                Print All QR Codes
              </Button>
            </Box>

            <CropRotationNote sx={{ mb: 2 }} />
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 360px)' }}>
              <Table size="small" sx={[excelTableSx, freezeColumnsSx(FIELD_FROZEN_WIDTHS, GUTTER_WIDTH)]}>
                <TableHead>
                  <TableRow>
                    <GutterCell />
                    <TableCell className="col-frozen-0">Field Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Current Crop</TableCell>
                    <TableCell>Variety</TableCell>
                    <TableCell className="col-numeric">Valve Count</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!selectedFarmAreaData.fields || selectedFarmAreaData.fields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No fields added yet for this Farm Area
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedFarmAreaData.fields.map((field, idx) => {
                      const cropInfo = getCurrentCropInfo(field);
                      return (
                        <TableRow key={field.id} hover>
                          <GutterCell index={idx + 1} />
                          <TableCell className="col-frozen-0" title={field.name}>{field.name}</TableCell>
                          <TableCell>{field.type}</TableCell>
                          <TableCell>
                            {cropInfo.crop ? (
                              <Box>
                                <Typography variant="body2">{cropInfo.crop}</Typography>
                                {cropInfo.startDate && (
                                  <Typography variant="caption" color="text.secondary">
                                    Since {formatDate(cropInfo.startDate)}
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{plantingVarieties[field.id] || field.varietyName || '-'}</TableCell>
                          <TableCell className="col-numeric">{field.valves}</TableCell>
                          <TableCell>
                            <Button
                              variant="outlined"
                              size="small"
                              color="secondary"
                              onClick={() => openHistoryDialog(field)}
                              sx={{ mr: 0.5 }}
                            >
                              History
                            </Button>
                            {canEdit && (
                              <Button
                                variant="outlined"
                                size="small"
                                color="primary"
                                onClick={() => setEditFieldDialog({ open: true, field })}
                                sx={{ mr: 0.5 }}
                              >
                                Edit
                              </Button>
                            )}
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => setQrDialog({ open: true, field })}
                              sx={{ mr: 0.5 }}
                            >
                              QR
                            </Button>
                            {canEdit && (
                              <Button
                                variant="outlined"
                                size="small"
                                color="error"
                                onClick={() => handleDeleteField(field.id)}
                              >
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* Add Field Dialog */}
        <Dialog open={fieldDialog} onClose={() => setFieldDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Field</DialogTitle>
          <Formik
            initialValues={{ fieldType: 'NetHouse', fieldName: '', assignedCrop: '', varietyId: '', valveCount: 4, area: '', latitude: '', longitude: '', polygon: '' }}
            validationSchema={fieldSchema}
            onSubmit={handleAddField}
          >
            {({ values, errors, touched, handleChange, handleBlur, setFieldValue, resetForm }) => {
              const fieldTypeInfo = getFieldTypeInfo(values.fieldType);
              const suggestions = getFieldNameSuggestions(values.fieldType);

              return (
                <Form>
                  <FormikSubmitFeedback />
                  <DialogContent>
                    <Grid container spacing={2}>
                      <Grid size={12}>
                        <TextField
                          fullWidth
                          select
                          label="Field Type"
                          name="fieldType"
                          value={values.fieldType}
                          onChange={(e) => {
                            handleChange(e);
                            const info = getFieldTypeInfo(e.target.value);
                            setFieldValue('valveCount', info.defaultValveCount);
                            setFieldValue('fieldName', '');
                          }}
                          onBlur={handleBlur}
                          error={touched.fieldType && !!errors.fieldType}
                          helperText={touched.fieldType && errors.fieldType}
                        >
                          {data.fieldTypes.map((ft) => (
                            <MenuItem key={ft.id} value={ft.name}>
                              {ft.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid size={12}>
                        <TextField
                          fullWidth
                          label="Field Name"
                          name="fieldName"
                          value={values.fieldName}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched.fieldName && !!errors.fieldName}
                          helperText={touched.fieldName && errors.fieldName || (suggestions.length > 0 && `Suggestions: ${suggestions.join(', ')}`)}
                          placeholder={`e.g., ${fieldTypeInfo.namingPattern}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          select
                          label="Assigned Crop"
                          name="assignedCrop"
                          value={values.assignedCrop}
                          onChange={(e) => {
                            handleChange(e);
                            setFieldValue('varietyId', '');
                            loadVarietiesForCrop(e.target.value);
                          }}
                          onBlur={handleBlur}
                          error={touched.assignedCrop && !!errors.assignedCrop}
                          helperText={touched.assignedCrop && errors.assignedCrop}
                        >
                          {(selectedFarmAreaData?.crops || []).map((crop) => {
                            const cropName = typeof crop === 'object' && crop !== null ? crop.name : String(crop);
                            const cropValue = typeof crop === 'object' && crop !== null ? crop.name : String(crop);
                            return (
                              <MenuItem key={cropName} value={cropValue}>
                                {cropName}
                              </MenuItem>
                            );
                          })}
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          select
                          label="Variety"
                          name="varietyId"
                          value={values.varietyId}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          disabled={!values.assignedCrop || varietyOptions.length === 0}
                          helperText={!values.assignedCrop ? 'Select a crop first' : varietyOptions.length === 0 ? 'No varieties for this crop' : ''}
                        >
                          <MenuItem value="">None</MenuItem>
                          {varietyOptions.map((v) => (
                            <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid size={12}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Valve Count"
                          name="valveCount"
                          value={values.valveCount}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched.valveCount && !!errors.valveCount}
                          helperText={touched.valveCount && errors.valveCount}
                          inputProps={{ min: 0, step: 1 }}
                        />
                      </Grid>
                      <Grid size={12}>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2" gutterBottom>
                          Field Boundaries (Polygon) - Optional
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          Enter polygon coordinates as JSON array: [[lat1, lng1], [lat2, lng2], [lat3, lng3], ...]
                          <br />
                          Example: [[24.45, 54.38], [24.46, 54.38], [24.46, 54.39], [24.45, 54.39], [24.45, 54.38]]
                        </Typography>
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          label="Polygon Coordinates (JSON)"
                          name="polygon"
                          value={values.polygon || ''}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder='[[24.45, 54.38], [24.46, 54.38], [24.46, 54.39], [24.45, 54.39], [24.45, 54.38]]'
                          helperText="Optional: Define field boundaries for map visualization"
                        />
                      </Grid>
                    </Grid>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => { setFieldDialog(false); resetForm(); }}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" color="primary">
                      Add Field
                    </Button>
                  </DialogActions>
                </Form>
              );
            }}
          </Formik>
        </Dialog>

        {/* Bulk Create NetHouses Dialog */}
        <Dialog open={bulkCreateDialog} onClose={() => setBulkCreateDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Bulk Create NetHouses</DialogTitle>
          <Formik
            initialValues={{ startNumber: 1, endNumber: 8, prefix: 'NH-', assignedCrop: '', valveCount: 4 }}
            validationSchema={Yup.object().shape({
              startNumber: Yup.number().min(1, 'Start number must be at least 1').required('Start number is required'),
              endNumber: Yup.number().min(1, 'End number must be at least 1').required('End number is required'),
              prefix: Yup.string().required('Prefix is required'),
              assignedCrop: Yup.string().required('Assigned Crop is required'),
              valveCount: Yup.number().min(0, 'Valve count must be 0 or more').required('Valve count is required'),
            })}
            onSubmit={handleBulkCreate}
          >
            {({ values, errors, touched, handleChange, handleBlur, resetForm }) => (
              <Form>
                <FormikSubmitFeedback />
                <DialogContent>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Starting Number"
                        name="startNumber"
                        value={values.startNumber}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.startNumber && !!errors.startNumber}
                        helperText={touched.startNumber && errors.startNumber}
                        inputProps={{ min: 1, step: 1 }}
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Ending Number"
                        name="endNumber"
                        value={values.endNumber}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.endNumber && !!errors.endNumber}
                        helperText={touched.endNumber && errors.endNumber}
                        inputProps={{ min: 1, step: 1 }}
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label="Prefix"
                        name="prefix"
                        value={values.prefix}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.prefix && !!errors.prefix}
                        helperText={touched.prefix && errors.prefix}
                        placeholder="e.g., NH-"
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        select
                        label="Assigned Crop"
                        name="assignedCrop"
                        value={values.assignedCrop}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.assignedCrop && !!errors.assignedCrop}
                        helperText={touched.assignedCrop && errors.assignedCrop}
                      >
                        {(selectedFarmAreaData?.crops || []).map((crop) => {
                          const cropName = typeof crop === 'object' && crop !== null ? crop.name : String(crop);
                          const cropValue = typeof crop === 'object' && crop !== null ? crop.name : String(crop);
                          return (
                            <MenuItem key={cropName} value={cropValue}>
                              {cropName}
                            </MenuItem>
                          );
                        })}
                      </TextField>
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Valve Count"
                        name="valveCount"
                        value={values.valveCount}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.valveCount && !!errors.valveCount}
                        helperText={touched.valveCount && errors.valveCount}
                        inputProps={{ min: 0, step: 1 }}
                      />
                    </Grid>
                  </Grid>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => { setBulkCreateDialog(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="contained" color="primary">
                    Create NetHouses
                  </Button>
                </DialogActions>
              </Form>
            )}
          </Formik>
        </Dialog>

        {/* Crop History Dialog */}
        <Dialog open={historyDialog.open} onClose={() => setHistoryDialog({ open: false, field: null })} maxWidth="md" fullWidth>
          <DialogTitle>Crop History: {historyDialog.field?.name}</DialogTitle>
          {historyDialog.field && (
            <DialogContent>
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Current Crop
                </Typography>
                {(() => {
                  const cropInfo = getCurrentCropInfo(historyDialog.field);
                  return cropInfo.crop ? (
                    <Typography variant="body1">
                      {cropInfo.crop} {cropInfo.startDate && `(since ${formatDate(cropInfo.startDate)})`}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No current crop</Typography>
                  );
                })()}
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>
                Previous Crops
              </Typography>
              {(() => {
                const history = historyDialog.field.cropHistory || [];
                const previousCrops = history.filter((h) => h.endDate !== null).sort((a, b) => 
                  new Date(b.endDate) - new Date(a.endDate)
                );
                
                if (previousCrops.length === 0) {
                  return <Typography variant="body2" color="text.secondary">No previous crops</Typography>;
                }

                return (
                  <Box sx={{ mb: 3 }}>
                    {previousCrops.map((entry, idx) => {
                      const duration = calculateDays(entry.startDate, entry.endDate);
                      return (
                        <Box key={idx} sx={{ mb: 1 }}>
                          <Typography variant="body1">
                            • {entry.crop} ({formatDate(entry.startDate)} - {formatDate(entry.endDate)}) - {duration} days
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                );
              })()}

              <Divider sx={{ my: 2 }} />

              <CropRotationNote />
            </DialogContent>
          )}
        </Dialog>

        {/* Edit Field Dialog */}
        <Dialog open={editFieldDialog.open} onClose={() => setEditFieldDialog({ open: false, field: null })} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Field: {editFieldDialog.field?.name}</DialogTitle>
          {editFieldDialog.field && (
            <Formik
              initialValues={{
                name: editFieldDialog.field.name || '',
                valveCount: editFieldDialog.field.valves ?? 0,
                area: editFieldDialog.field.area || '',
                latitude: editFieldDialog.field.latitude || '',
                longitude: editFieldDialog.field.longitude || '',
                polygon: editFieldDialog.field.polygon ? JSON.stringify(editFieldDialog.field.polygon, null, 2) : '',
              }}
              validationSchema={Yup.object().shape({
                name: Yup.string().trim().required(t('fieldsAccess.fieldNameRequired')),
                valveCount: Yup.number().min(0, 'Valve count must be 0 or more').required('Valve count is required'),
                area: Yup.number().min(0, 'Area must be positive').nullable(),
                latitude: Yup.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').nullable(),
                longitude: Yup.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').nullable(),
              })}
              onSubmit={handleUpdateField}
            >
              {({ values, errors, touched, handleChange, handleBlur, resetForm }) => (
                <Form>
                  <FormikSubmitFeedback />
                  <DialogContent>
                    <Grid container spacing={2}>
                      <Grid size={12}>
                        <TextField
                          fullWidth
                          label={t('fieldsAccess.fieldName')}
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
                          label="Valve Count"
                          name="valveCount"
                          value={values.valveCount}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched.valveCount && !!errors.valveCount}
                          helperText={touched.valveCount && errors.valveCount}
                          inputProps={{ min: 0, step: 1 }}
                        />
                      </Grid>
                      <Grid size={12}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Area (m²)"
                          name="area"
                          value={values.area}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched.area && !!errors.area}
                          helperText={touched.area && errors.area || 'Optional: Field area in square meters'}
                          inputProps={{ min: 0, step: 0.01 }}
                        />
                      </Grid>
                      <Grid size={6}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Latitude (°N)"
                          name="latitude"
                          value={values.latitude}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched.latitude && !!errors.latitude}
                          helperText={touched.latitude && errors.latitude || 'Optional: e.g., 24.45'}
                          inputProps={{ step: 0.0001, min: -90, max: 90 }}
                        />
                      </Grid>
                      <Grid size={6}>
                        <TextField
                          fullWidth
                          type="number"
                          label="Longitude (°E)"
                          name="longitude"
                          value={values.longitude}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={touched.longitude && !!errors.longitude}
                          helperText={touched.longitude && errors.longitude || 'Optional: e.g., 54.38'}
                          inputProps={{ step: 0.0001, min: -180, max: 180 }}
                        />
                      </Grid>
                      <Grid size={12}>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="subtitle2" gutterBottom>
                          Field Boundaries (Polygon) - Optional
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                          Enter polygon coordinates as JSON array: [[lat1, lng1], [lat2, lng2], [lat3, lng3], ...]
                        </Typography>
                        <TextField
                          fullWidth
                          multiline
                          rows={4}
                          label="Polygon Coordinates (JSON)"
                          name="polygon"
                          value={values.polygon || ''}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          placeholder='[[24.45, 54.38], [24.46, 54.38], [24.46, 54.39], [24.45, 54.39], [24.45, 54.38]]'
                          helperText="Optional: Define field boundaries for map visualization"
                        />
                      </Grid>
                    </Grid>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={() => { setEditFieldDialog({ open: false, field: null }); resetForm(); }}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained" color="primary">
                      Update Field
                    </Button>
                  </DialogActions>
                </Form>
              )}
            </Formik>
          )}
        </Dialog>
      </Box>
      {confirmDialog}

      {/* Single Field QR Dialog */}
      <Dialog open={qrDialog.open} onClose={() => setQrDialog({ open: false, field: null })} maxWidth="xs" fullWidth>
        <DialogTitle>QR Code - {qrDialog.field?.name}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: '16px !important' }}>
          {qrDialog.field && (
            <>
              <QRCodeSVG
                value={`${window.location.origin}/scan/${qrDialog.field.id}`}
                size={200}
                level="M"
              />
              <Typography variant="h6" sx={{ mt: 2 }}>{qrDialog.field.name}</Typography>
              <Typography variant="caption" color="text.secondary">Scan to open field entry</Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrDialog({ open: false, field: null })}>Close</Button>
          <Button variant="contained" onClick={() => {
            const printWindow = window.open('', '_blank');
            if (!printWindow) return;
            const svg = document.querySelector('#qr-single-container svg');
            printWindow.document.write(`<html><head><title>QR - ${qrDialog.field?.name}</title>
              <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:Inter, 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;}
              h2{margin-top:16px;}</style></head><body>
              ${svg?.outerHTML || ''}<h2>${qrDialog.field?.name}</h2></body></html>`);
            printWindow.document.close();
            printWindow.print();
          }}>Print</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk QR Print Dialog */}
      <Dialog open={qrBulkOpen} onClose={() => setQrBulkOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Print All QR Codes</DialogTitle>
        <DialogContent>
          <Box id="qr-bulk-container" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', pt: 2 }}>
            {(selectedFarmAreaData?.fields || []).map((field) => (
              <Box key={field.id} sx={{ textAlign: 'center', p: 1, border: '1px solid #ddd', borderRadius: 1, width: 160 }}>
                <QRCodeSVG value={`${window.location.origin}/scan/${field.id}`} size={120} level="M" />
                <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>{field.name}</Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrBulkOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => {
            const container = document.getElementById('qr-bulk-container');
            if (!container) return;
            const printWindow = window.open('', '_blank');
            if (!printWindow) return;
            printWindow.document.write(`<html><head><title>QR Codes</title>
              <style>body{font-family:Inter, 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;} .qr-grid{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;}
              .qr-item{text-align:center;padding:12px;border:1px solid #ccc;border-radius:4px;page-break-inside:avoid;}
              h3{margin-top:8px;font-size:14px;}</style></head><body><div class="qr-grid">
              ${container.innerHTML}</div></body></html>`);
            printWindow.document.close();
            printWindow.print();
          }}>Print All</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default FieldTypesNamesManagement;
