import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  MenuItem,
  Alert,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
} from '@mui/material';
import {
  SaveOutlined as Save, ClearOutlined as Clear, InfoOutlined as InfoIcon,
  GridOnOutlined as SpreadsheetIcon,
  ViewListOutlined as FormViewIcon,
} from '@mui/icons-material';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { useMasterData } from '../../utils/useMasterData';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import LocationSelector from '../../components/LocationSelector';
import {
  createFertigation,
  listFertigationAll,
  listFertigationEntries,
  updateFertigation,
} from '../../utils/backendApi';
import { listRecipesAll } from '../../utils/backendApi';
import { isRecipeApproved, recipeOptionLabel, recipePickerOptions } from '../../utils/recipeApproval';
import { useNotification } from '../../contexts/NotificationContext';
import { queueEntry } from '../../utils/offlineQueue';
import SpreadsheetFertigationEntry from './SpreadsheetFertigationEntry';
import useReadOnlyMode from '../../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../../utils/roleAccess';
import FertigationEntriesTable from './FertigationEntriesTable';
import PivotFertigationTab from '../../components/fertigation/PivotFertigationTab';
import IrrigationStructurePlaceholder from '../../components/irrigation/IrrigationStructurePlaceholder';
import { IRRIGATION_STRUCTURES } from '../../utils/fieldTypeHelpers';
import { useActiveSiteStructures } from '../../hooks/useActiveSiteStructures';
import InfoNote from '../../components/InfoNote';
import PageTitle from '../../components/PageTitle';

// Week number calculation helper
const getWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

// Validation schema
const fertigationSchema = Yup.object().shape({
  date: Yup.string().required('Date is required'),
  country: Yup.string().required('Zone is required'),
  site: Yup.string().required('Site is required'),
  farmArea: Yup.string().required('Farm Area is required'),
  field: Yup.string().required('Field is required'),
  flowRate: Yup.number().min(0.01, 'Flow rate must be greater than 0').required('Flow rate is required'),
  frequency: Yup.number().min(1, 'Frequency must be at least 1').required('Frequency is required'),
  recipeId: Yup.string().required('Recipe is required'),
});
const calculateDailyTargetsFromRecipe = (recipe, waterM3) => {
  if (!recipe || !Array.isArray(recipe.fertilizers)) return null;
  const targets = {};
  recipe.fertilizers.forEach((fertilizer) => {
    const kgPerLiter = Number(fertilizer.kgPerLiter) || 0;
    const amount = kgPerLiter * (Number(waterM3) || 0);
    targets[fertilizer.name] = Number.isFinite(amount) ? amount : 0;
  });
  return targets;
};

function FertigationEntry() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const { data } = useMasterData();
  const { activeSiteId: defaultSiteId, activeSite } = useActiveSite();
  const notify = useNotification();
  const {
    groupedFields,
    availableStructureTabs,
    defaultStructureId,
  } = useActiveSiteStructures();
  const [activeStructure, setActiveStructure] = useState(null);
  const [viewMode, setViewMode] = useState('spreadsheet');
  const [entriesRefreshKey, setEntriesRefreshKey] = useState(0);
  const refreshEntries = useCallback(() => setEntriesRefreshKey((k) => k + 1), []);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    if (!defaultStructureId) {
      setActiveStructure(null);
      return;
    }
    setActiveStructure((prev) => {
      if (prev && availableStructureTabs.some((tab) => tab.id === prev)) return prev;
      return defaultStructureId;
    });
  }, [defaultStructureId, availableStructureTabs]);

  const resolvedStructure = activeStructure ?? defaultStructureId ?? null;
  const structureTabValue =
    resolvedStructure && availableStructureTabs.some((tab) => tab.id === resolvedStructure)
      ? resolvedStructure
      : false;

  const isPivot = resolvedStructure === 'pivot';
  const isNethouseOrGh = resolvedStructure === 'nethouse' || resolvedStructure === 'greenhouse';
  const isOpenField = resolvedStructure === 'openfield';
  const activeStructureLabel = IRRIGATION_STRUCTURES.find((s) => s.id === resolvedStructure)?.label || '';
  const placeholderFields = useMemo(() => {
    switch (resolvedStructure) {
      case 'nethouse': return groupedFields.nethouse;
      case 'greenhouse': return groupedFields.greenhouse;
      case 'openfield': return groupedFields.openField;
      default: return [];
    }
  }, [resolvedStructure, groupedFields]);
  
  useEffect(() => {
    listRecipesAll()
      .then((items) => setRecipes(items))
      .catch(() => setRecipes([]));
  }, []);
  const [selectedField, setSelectedField] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [existingEntry, setExistingEntry] = useState(null);
  const [cumulativeData, setCumulativeData] = useState({ water: 0, fertilizers: {} });

  // Load cumulative data only when form view needs it (defer heavy fetch)
  useEffect(() => {
    if (!isNethouseOrGh || viewMode !== 'form' || !defaultSiteId) return;

    let cancelled = false;

    const loadCumulativeData = async () => {
      try {
        const entries = await listFertigationAll({ site_id: defaultSiteId });
        if (cancelled) return;

        const cumulative = {
          water: 0,
          fertilizers: {},
        };

        entries.forEach((entry) => {
          cumulative.water += entry.dailyWater || 0;
          const fertilizerData = entry.fertilizers || {};
          if (fertilizerData && typeof fertilizerData === 'object') {
            Object.entries(fertilizerData).forEach(([fertilizer, kg]) => {
              if (fertilizer && typeof kg === 'number' && !isNaN(kg)) {
                if (!cumulative.fertilizers[fertilizer]) {
                  cumulative.fertilizers[fertilizer] = 0;
                }
                cumulative.fertilizers[fertilizer] += kg || 0;
              }
            });
          }
        });

        setCumulativeData(cumulative);
      } catch {
        if (!cancelled) {
          setCumulativeData({ water: 0, fertilizers: {} });
        }
      }
    };

    loadCumulativeData();

    return () => {
      cancelled = true;
    };
  }, [defaultSiteId, isNethouseOrGh, viewMode]);

  // Check for existing entry when date or field changes
  useEffect(() => {
    if (selectedDate && selectedField) {
      findExistingEntry(selectedField.id, selectedDate)
        .then((existing) => setExistingEntry(existing))
        .catch(() => setExistingEntry(null));
    } else {
      setExistingEntry(null);
    }
  }, [selectedDate, selectedField]);

  useEffect(() => {
    if (existingEntry?.recipeId && recipes.length > 0) {
      const recipe = recipes.find((r) => r.id === existingEntry.recipeId);
      setSelectedRecipe(recipe || null);
    }
  }, [existingEntry, recipes]);

  const findExistingEntry = async (fieldId, date) => {
    const { data } = await listFertigationEntries({
      field_id: fieldId,
      start_date: date,
      end_date: date,
      page: 1,
      limit: 1,
      site_id: defaultSiteId,
    });
    return data[0] || null;
  };

  const initialValues = {
    date: selectedDate,
    country: '',
    site: '',
    farmArea: '',
    field: '',
    flowRate: '',
    frequency: '',
    recipeId: '',
  };

  const handleSubmit = async (values, { resetForm, setSubmitting }) => {
    if (readOnly) {
      setSubmitting(false);
      return;
    }
    try {
      if (!selectedField) {
        notify.error('Please select a field');
        setSubmitting(false);
        return;
      }

      if (!selectedRecipe) {
        notify.error('Please select a recipe');
        setSubmitting(false);
        return;
      }

      // Calculate daily water total (in m³)
      const flowRate = parseFloat(values.flowRate) || 0;
      const frequency = parseFloat(values.frequency) || 0;
      const valvesCount = selectedField.valves || 4;
      const dailyWater = flowRate * frequency * valvesCount;

      if (dailyWater <= 0) {
        notify.error('Daily water must be greater than 0. Please check flow rate and frequency.');
        setSubmitting(false);
        return;
      }

      // Calculate all fertilizer amounts using: kgPerLiter × Daily Water (m³)
      const fertilizers = calculateDailyTargetsFromRecipe(selectedRecipe, dailyWater);
      
      if (!fertilizers || typeof fertilizers !== 'object' || Object.keys(fertilizers).length === 0) {
        notify.error('Failed to calculate fertilizer amounts. Please check recipe data.');
        setSubmitting(false);
        return;
      }

      // Ensure all fertilizer values are valid numbers
      const validFertilizers = {};
      Object.entries(fertilizers).forEach(([fertilizer, kg]) => {
        const value = parseFloat(kg);
        if (!isNaN(value) && isFinite(value)) {
          validFertilizers[fertilizer] = value;
        } else {
          validFertilizers[fertilizer] = 0;
        }
      });

      // Calculate total fertilizer
      const totalFertilizer = Object.values(validFertilizers).reduce((sum, val) => sum + (val || 0), 0);

      // Update cumulative totals safely
      const currentCumulativeFertilizers = cumulativeData?.fertilizers || {};
      const newCumulative = { 
        water: (cumulativeData?.water || 0) + dailyWater,
        fertilizers: { ...currentCumulativeFertilizers }
      };
      
      // Ensure fertilizers object exists
      if (!newCumulative.fertilizers) {
        newCumulative.fertilizers = {};
      }
      
      Object.entries(validFertilizers).forEach(([fertilizer, kg]) => {
        if (fertilizer && typeof kg === 'number' && !isNaN(kg)) {
          if (!newCumulative.fertilizers[fertilizer]) {
            newCumulative.fertilizers[fertilizer] = 0;
          }
          newCumulative.fertilizers[fertilizer] += kg || 0;
        }
      });

      const frequencyValue = Number.isFinite(frequency) ? Math.round(frequency) : undefined;
      const valvesCountValue = Number.isFinite(valvesCount) ? Math.round(valvesCount) : undefined;

      const payload = {
        fieldId: selectedField.id,
        recipeId: values.recipeId || selectedRecipe?.id,
        cropId: selectedField.currentCropId || undefined,
        date: values.date,
        weekNumber: getWeekNumber(values.date),
        ...(Number.isFinite(flowRate) ? { flowRate } : {}),
        ...(Number.isFinite(frequencyValue) ? { frequency: frequencyValue } : {}),
        ...(Number.isFinite(valvesCountValue) ? { valvesCount: valvesCountValue } : {}),
        ...(Number.isFinite(dailyWater) ? { dailyWater } : {}),
        fertilizers: validFertilizers,
        ...(Number.isFinite(totalFertilizer) ? { totalFertilizer } : {}),
        cumulative: {
          fertilizers: Object.fromEntries(
            Object.entries(newCumulative.fertilizers || {}).map(([key, val]) => [
              key,
              (val || 0) / 1000,
            ])
          ),
        },
      };

      if (!navigator.onLine && !existingEntry?.id) {
        await queueEntry({ type: 'fertigation', data: payload });
        notify.success('You are offline. Fertigation entry queued for sync.');
      } else if (existingEntry?.id) {
        await updateFertigation(existingEntry.id, payload);
        notify.success('Fertigation entry updated successfully!');
      } else {
        await createFertigation(payload);
        notify.success('Fertigation entry saved successfully!');
      }

      setCumulativeData(newCumulative);
      refreshEntries();

      resetForm({ values: { ...initialValues, date: selectedDate } });
      setSelectedField(null);
      setSelectedRecipe(null);
      setSubmitting(false);
    } catch (error) {
      if (!navigator.onLine) {
        notify.warning('Network error. Please try again when online.');
      } else {
        notify.error(`Error saving entry: ${error.message || 'Unknown error'}`);
      }
      setSubmitting(false);
    }
  };

  const handleClear = (resetForm) => {
    resetForm({ values: { ...initialValues, date: selectedDate } });
    setSelectedField(null);
    setSelectedRecipe(null);
    setExistingEntry(null);
  };

  return (
    <Container maxWidth="xl">
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <PageTitle>
            Fertigation Entry
          </PageTitle>
          {isNethouseOrGh && (
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => { if (v) setViewMode(v); }}
            size="small"
          >
            <ToggleButton value="spreadsheet">
              <Tooltip title="Spreadsheet View"><SpreadsheetIcon sx={{ mr: 0.5, fontSize: 18 }} /></Tooltip>
              Spreadsheet
            </ToggleButton>
            <ToggleButton value="form">
              <Tooltip title="Form View"><FormViewIcon sx={{ mr: 0.5, fontSize: 18 }} /></Tooltip>
              Form
            </ToggleButton>
          </ToggleButtonGroup>
          )}
        </Box>

        <Tabs
          value={structureTabValue}
          onChange={(_, v) => setActiveStructure(v)}
          sx={{
            mb: 2,
            minHeight: 32,
            '& .MuiTab-root': {
              fontSize: '12px',
              textTransform: 'none',
              minHeight: 32,
              py: 0,
            },
            '& .Mui-selected': { fontWeight: 700, color: '#165c3a !important' },
          }}
        >
          {availableStructureTabs.map((s) => (
            <Tab key={s.id} value={s.id} label={s.label} />
          ))}
        </Tabs>

        {availableStructureTabs.length === 0 && (
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
            No fields configured for this site. Add fields in Management to enable fertigation entry.
          </InfoNote>
        )}

        {isPivot && <PivotFertigationTab readOnly={readOnly} />}

        {isOpenField && (
          <IrrigationStructurePlaceholder
            structureLabel={activeStructureLabel}
            siteName={activeSite?.name}
            year={new Date().getFullYear()}
            fields={placeholderFields}
          />
        )}

        {readOnly && <ReadOnlyBanner />}

        {isNethouseOrGh && viewMode === 'spreadsheet' && (
          <SpreadsheetFertigationEntry onEntrySaved={refreshEntries} readOnly={readOnly} />
        )}

        {isNethouseOrGh && viewMode === 'form' && (
        <>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Enter water parameters and select recipe. System will automatically calculate all fertilizer amounts.
        </Typography>

        <Formik
          initialValues={existingEntry ? {
            date: existingEntry.date,
            country: existingEntry.countryId || '',
            site: existingEntry.siteId || '',
            farmArea: existingEntry.farmAreaId || '',
            field: existingEntry.fieldId || selectedField?.id || '',
            flowRate: existingEntry.flowRate || '',
            frequency: existingEntry.frequency || '',
            recipeId: existingEntry.recipeId || '',
          } : initialValues}
          validationSchema={fertigationSchema}
          onSubmit={handleSubmit}
          enableReinitialize
        >
          {({ values, errors, touched, handleChange, setFieldValue, resetForm, isSubmitting }) => {
            // Calculate daily water total (in m³)
            const flowRate = parseFloat(values.flowRate) || 0;
            const frequency = parseFloat(values.frequency) || 0;
            const valvesCount = selectedField?.valves || 4;
            const dailyWater = flowRate * frequency * valvesCount;

            // Calculate all fertilizer amounts when recipe and water are available
            const calculatedFertilizers = selectedRecipe && dailyWater > 0
              ? calculateDailyTargetsFromRecipe(selectedRecipe, dailyWater)
              : {};

            // All fertilizers use kgPerLiter for calculation (from KG/L column)
            const allFertilizers = selectedRecipe
              ? selectedRecipe.fertilizers
              : [];

            // Check if there are validation errors
            const hasErrors = Object.keys(errors).length > 0;
            const allFieldsTouched = Object.keys(touched).length > 0;

            return (
              <Form>
                {/* Show validation errors if any */}
                {hasErrors && allFieldsTouched && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Please fix the following errors:
                    </Typography>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {Object.entries(errors).map(([field, error]) => (
                        <li key={field}>
                          <strong>{field}:</strong> {error}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}

                {/* Section 1: Basic Information */}
                <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Basic Information
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <TextField
                        fullWidth
                        type="date"
                        label="Date"
                        name="date"
                        value={values.date}
                        onChange={(e) => {
                          setFieldValue('date', e.target.value);
                          setSelectedDate(e.target.value);
                        }}
                        error={touched.date && !!errors.date}
                        helperText={touched.date && errors.date}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <LocationSelector
                      countries={data.countries}
                      values={values}
                      errors={errors}
                      touched={touched}
                      setFieldValue={setFieldValue}
                      onFieldChange={(field) => setSelectedField(field)}
                      defaultSiteId={defaultSiteId}
                    />
                    {selectedField && (
                      <Grid size={12}>
                        <Card sx={{ bgcolor: 'info.light', color: 'white' }}>
                          <CardContent>
                            <Typography variant="body1">
                              <strong>Current Crop:</strong> {selectedField.currentCrop || selectedField.crop || 'Unknown'}
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              <strong>Valves Count:</strong> {selectedField.valves || 4} (auto-filled)
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    )}
                    {existingEntry && (
                      <Grid size={12}>
                        <InfoNote mode="line" severity="info">
                          Entry exists for this field and date. Saving will update it.
                        </InfoNote>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Section 2: Water Inputs */}
                <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Water Parameters
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span>Water Qty. (M³/Valve)</span>
                            <Tooltip title="Water quantity per valve per cycle. Used to calculate total fertigation water." arrow>
                              <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                            </Tooltip>
                          </Box>
                        }
                        name="flowRate"
                        value={values.flowRate}
                        onChange={handleChange}
                        error={touched.flowRate && !!errors.flowRate}
                        helperText={touched.flowRate && errors.flowRate}
                        inputProps={{ step: 0.01, min: 0 }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span>Frequency</span>
                            <Tooltip title="Number of fertigation cycles per day. Each cycle applies fertilizer solution." arrow>
                              <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                            </Tooltip>
                          </Box>
                        }
                        name="frequency"
                        value={values.frequency}
                        onChange={handleChange}
                        error={touched.frequency && !!errors.frequency}
                        helperText={touched.frequency && errors.frequency}
                        inputProps={{ step: 1, min: 1 }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Card variant="outlined" sx={{ height: '100%', display: 'flex', alignItems: 'center', borderRadius: 3 }}>
                        <CardContent sx={{ width: '100%' }}>
                          <Tooltip title="Water volume containing fertilizer" arrow>
                            <Typography variant="body2" sx={{ cursor: 'help', color: 'text.secondary' }}>
                              Fertigation Water (m³)
                            </Typography>
                          </Tooltip>
                            <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700 }}>{toNumber(dailyWater).toFixed(2)} m³</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Formula: {flowRate || 0} × {frequency || 0} × {valvesCount} = {toNumber(dailyWater).toFixed(2)} m³
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Section 3: Recipe Selection */}
                <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Recipe Selection
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <TextField
                        fullWidth
                        select
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span>Recipe</span>
                            <Tooltip title="Predefined fertilizer mixture. Each recipe has specific nutrient concentrations." arrow>
                              <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                            </Tooltip>
                          </Box>
                        }
                        name="recipeId"
                        value={values.recipeId}
                        placeholder="Select Recipe"
                        onChange={(e) => {
                          const recipe = recipes.find((r) => r.id === e.target.value);
                          setFieldValue('recipeId', e.target.value);
                          setSelectedRecipe(recipe);
                        }}
                        error={touched.recipeId && !!errors.recipeId}
                        helperText={touched.recipeId && errors.recipeId}
                        InputLabelProps={{ shrink: true }}
                        SelectProps={{
                          displayEmpty: true,
                          renderValue: (selected) => {
                            if (!selected) return 'Select Recipe';
                            const recipe = recipes.find((r) => r.id === selected);
                            return recipe ? `${recipeOptionLabel(recipe)} - ${recipe.description || ''}` : 'Select Recipe';
                          },
                        }}
                        sx={{
                          '& .MuiSelect-select': {
                            overflow: 'visible',
                            whiteSpace: 'nowrap',
                            textOverflow: 'clip',
                            maxWidth: 'none',
                          },
                        }}
                      >
                        {recipePickerOptions(recipes, values.recipeId).length > 0 ? (
                          recipePickerOptions(recipes, values.recipeId).map((recipe) => (
                            <MenuItem key={recipe.id} value={recipe.id} disabled={!isRecipeApproved(recipe)}>
                              {recipeOptionLabel(recipe)} {recipe.description ? `- ${recipe.description}` : ''}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem disabled>No approved recipes yet. Ask the operations manager to approve one.</MenuItem>
                        )}
                      </TextField>
                    </Grid>
                    {selectedRecipe && (
                      <Grid size={{ xs: 12, md: 6 }}>
                        <Card variant="outlined" sx={{ borderRadius: 3 }}>
                          <CardContent>
                            <Typography variant="body2" sx={{ color: 'text.primary' }}>
                              <strong>Tank Volume:</strong> {selectedRecipe.tankVolume} L
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.primary' }}>
                              <strong>Cycles:</strong> {selectedRecipe.cycles}
                            </Typography>
                            {selectedRecipe.elementPPM && (
                              <Typography variant="body2" sx={{ mt: 1, color: 'text.primary' }}>
                                <strong>Element PPM:</strong>{' '}
                                {Object.entries(selectedRecipe.elementPPM)
                                  .map(([el, ppm]) => `${el}:${ppm}`)
                                  .join(', ')}
                              </Typography>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>
                    )}
                  </Grid>
                </Paper>

                {/* Section 4: Auto-Calculated Fertilizer Display (Read-Only) */}
                {selectedRecipe && dailyWater > 0 && Object.keys(calculatedFertilizers).length > 0 && (
                  <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Calculated Fertilizer Amounts
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      All amounts calculated automatically using: kgPerLiter × Daily Water (m³) (from KG/L column)
                    </Typography>

                    {/* All Fertilizers - Real-time Calculation Display */}
                    {allFertilizers.length > 0 && dailyWater > 0 && selectedRecipe && (
                      <Box sx={{ mt: 3, mb: 3 }}>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Fertilizer</TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                    <span>Concentration (kg/L)</span>
                                    <Tooltip title="Fertilizer concentration in stock solution (from KG/L column in recipe)" arrow>
                                      <InfoIcon fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                    <span>Calculated Amount (kg)</span>
                                    <Tooltip title="Calculated: Stock Concentration (kg/L) × Fertigation Water (m³)" arrow>
                                      <InfoIcon fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {allFertilizers.map((fertilizer) => {
                                const calculatedAmount = calculatedFertilizers[fertilizer.name] || 0;
                                // CRITICAL: Use kgPerLiter (from KG/L column) - NOT quantityPer1000L!
                                const kgPerLiter = fertilizer.kgPerLiter || 0;
                                
                                const isZero = calculatedAmount === 0;
                                const isUnusual = calculatedAmount > 100 || (calculatedAmount > 0 && calculatedAmount < 0.001);
                                
                                return (
                                  <TableRow 
                                    key={fertilizer.name} 
                                    hover
                                    sx={{
                                      bgcolor: isZero ? 'warning.light' : isUnusual ? 'info.light' : 'inherit',
                                      '&:hover': { bgcolor: isZero ? 'warning.main' : isUnusual ? 'info.main' : 'action.hover' }
                                    }}
                                  >
                                    <TableCell>
                                      {fertilizer.name}
                                      {isZero && (
                                        <Typography variant="caption" color="warning.dark" sx={{ ml: 1 }}>
                                          (Zero)
                                        </Typography>
                                      )}
                                      {isUnusual && !isZero && (
                                        <Typography variant="caption" color="info.dark" sx={{ ml: 1 }}>
                                          (Check)
                                        </Typography>
                                      )}
                                    </TableCell>
                                    <TableCell align="right">
                                      {/* CRITICAL: Display kgPerLiter (KG/L column), NOT quantityPer1000L */}
                                      {toNumber(kgPerLiter).toFixed(5)} kg/L
                                    </TableCell>
                                    <TableCell align="right">
                                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {toNumber(calculatedAmount).toFixed(3)} kg
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {/* Total Row */}
                              <TableRow sx={{ bgcolor: 'background.default' }}>
                                <TableCell sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                  <strong>TOTAL</strong>
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                  -
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                  <strong>
                                    {toNumber(
                                      Object.values(calculatedFertilizers).reduce(
                                        (sum, val) => sum + toNumber(val),
                                        0
                                      )
                                    ).toFixed(3)} kg
                                  </strong>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </TableContainer>
                        
                        {/* Validation Warnings */}
                        {Object.values(calculatedFertilizers).some(val => val === 0) && (
                          <Alert severity="warning" sx={{ mt: 2 }}>
                            Some fertilizers have zero calculated amounts. Please verify the recipe concentrations.
                          </Alert>
                        )}
                        {Object.values(calculatedFertilizers).some(val => val > 100) && (
                          <InfoNote mode="line" severity="info" sx={{ mt: 1 }}>
                            Some calculated amounts seem unusually high. Please verify water volume and recipe concentrations.
                          </InfoNote>
                        )}
                      </Box>
                    )}

                    {/* Summary Card - Only show if calculations are available */}
                    {selectedRecipe && dailyWater > 0 && Object.keys(calculatedFertilizers).length > 0 && (
                      <Box sx={{ mt: 3, p: 2, bgcolor: 'background.muted', borderRadius: 1 }}>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="body2" color="text.secondary">
                              Total Daily Fertilizer
                            </Typography>
                            <Typography variant="h6" sx={{ color: 'success.main' }}>
                              {toNumber(
                                Object.values(calculatedFertilizers).reduce(
                                  (sum, val) => sum + toNumber(val),
                                  0
                                )
                              ).toFixed(3)}{' '}
                              kg
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="body2" color="text.secondary">
                              Fertigation Water Volume
                            </Typography>
                            <Typography variant="h6">
                              {toNumber(dailyWater).toFixed(2)} m³
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="body2" color="text.secondary">
                              Cumulative Fertigation Water
                            </Typography>
                            <Typography variant="h6">
                              {(toNumber(cumulativeData?.water) + toNumber(dailyWater)).toFixed(2)} m³
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <Typography variant="body2" color="text.secondary">
                              Selected Recipe
                            </Typography>
                            <Typography variant="h6">
                              {selectedRecipe.name}
                            </Typography>
                          </Grid>
                        </Grid>
                      </Box>
                    )}
                  </Paper>
                )}

                {/* Section 5: Save Button */}
                <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
                  <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <Button
                      variant="outlined"
                      startIcon={<Clear />}
                      onClick={() => handleClear(resetForm)}
                      disabled={readOnly}
                    >
                      Clear Form
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={readOnly}
                      startIcon={<Save />}
                      disabled={isSubmitting || !selectedField || !selectedRecipe || dailyWater === 0 || Object.keys(errors).length > 0}
                    >
                      {isSubmitting ? 'SAVING...' : existingEntry ? 'UPDATE ENTRY' : 'SAVE ENTRY'}
                    </Button>
                  </Box>
                </Paper>
              </Form>
            );
          }}
        </Formik>
        </>
        )}

        {resolvedStructure && !isPivot && (
          <FertigationEntriesTable
            siteId={defaultSiteId}
            masterData={data}
            structureType={resolvedStructure}
            groupedFields={groupedFields}
            refreshTrigger={entriesRefreshKey}
          />
        )}
      </Box>
    </Container>
  );
}

export default FertigationEntry;
