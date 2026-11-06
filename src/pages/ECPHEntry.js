import { useState, useEffect, useRef, useCallback } from 'react';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import {
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  Box,
  Card,
  CardContent,
  InputAdornment,
  Divider,
  Collapse,
  Tooltip,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  AccessTimeOutlined as ClockIcon,
  WaterDropOutlined as WaterDropIcon,
  ScienceOutlined as ScienceIcon,
  CalculateOutlined as CalculateIcon,
  LocationOnOutlined as LocationIcon,
  SettingsOutlined as SettingsIcon,
  ClearOutlined as ClearIcon,
  SaveOutlined as SaveIcon,
  ExpandMoreOutlined as ExpandMoreIcon,
  ExpandLessOutlined as ExpandLessIcon,
  InfoOutlined as InfoIcon,
  HelpOutlineOutlined as HelpOutlineIcon,
  ViewListOutlined as FormViewIcon,
  GridOnOutlined as SpreadsheetIcon,
} from '@mui/icons-material';
import { Formik, Form } from 'formik';
import { getCropDripperCount, getCropDripTestCount } from '../utils/masterDataUtils';
import { useMasterData } from '../utils/useMasterData';
import { createEcph } from '../utils/backendApi';
import { useNotification } from '../contexts/NotificationContext';
import { queueEntry } from '../utils/offlineQueue';
import { validationSchema, toNumber, calculateValveMetrics } from './ecph/ecphUtils';
import ValveFormSection from './ecph/ValveFormSection';
import SpreadsheetEcphEntry from './ecph/SpreadsheetEcphEntry';
import EcphEntriesTable from './ecph/EcphEntriesTable';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import PageTitle from '../components/PageTitle';

function ECPHEntry() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.DATA_ENTRY);
  const { data: masterData } = useMasterData();
  const notify = useNotification();
  const { activeSiteId } = useActiveSite();
  const appliedActiveSite = useRef(false);
  const [entriesRefreshKey, setEntriesRefreshKey] = useState(0);
  const [valve2Expanded, setValve2Expanded] = useState(false);
  const [viewMode, setViewMode] = useState('spreadsheet');
  const refreshEntries = useCallback(() => setEntriesRefreshKey((k) => k + 1), []);

  // Helper functions to get all sites, farm areas, and fields (independent selection)
  const getAllSites = () => {
    const sites = [];
    masterData.countries?.forEach((country) => {
      country.sites?.forEach((site) => {
        sites.push({ ...site, countryId: country.id, countryName: country.name });
      });
    });
    return sites;
  };

  const getAllFarmAreas = () => {
    const farmAreas = [];
    masterData.countries?.forEach((country) => {
      country.sites?.forEach((site) => {
        site.farmAreas?.forEach((farmArea) => {
          farmAreas.push({ ...farmArea, siteId: site.id, siteName: site.name, countryId: country.id, countryName: country.name });
        });
      });
    });
    return farmAreas;
  };

  const getAllFields = () => {
    const fields = [];
    masterData.countries?.forEach((country) => {
      country.sites?.forEach((site) => {
        site.farmAreas?.forEach((farmArea) => {
          farmArea.fields?.forEach((field) => {
            fields.push({
              ...field,
              farmAreaId: farmArea.id,
              farmAreaName: farmArea.name,
              siteId: site.id,
              siteName: site.name,
              countryId: country.id,
              countryName: country.name,
            });
          });
        });
      });
    });
    return fields;
  };

  const allSites = getAllSites();
  const allFarmAreas = getAllFarmAreas();
  const allFields = getAllFields();

  // Format date as "21/Jan/26"
  const formatDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  // Get today's date in ISO format
  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const formikRef = useRef(null);

  useEffect(() => {
    if (activeSiteId && !appliedActiveSite.current && formikRef.current) {
      appliedActiveSite.current = true;
      formikRef.current.setFieldValue('site', activeSiteId);
    }
  }, [activeSiteId]);

  const initialValues = {
    date: getTodayDate(),
    site: '',
    farmArea: '',
    field: '',
    time: '',
    weatherCondition: '',
    irrigationStatus: '',
    valve1: {
      valveNumber: '',
      dripVolume: '',
      drainVolume: '',
      ecIn: '',
      ecOut: '',
      phIn: '',
      phOut: '',
      qtyOfWater: '',
      cycle: '',
    },
    valve2: null,
  };

  const WEATHER_OPTIONS = [
    'Sunny', 'Cloudy', 'Partly Cloudy', 'Foggy', 'Raining', 'Windy', 'Overcast', 'Hazy',
  ];

  const IRRIGATION_STATUS_OPTIONS = [
    'Normal', 'Drenching', 'No Irrigation', 'No Fertilizer', 'No Fertilizer Only Water',
    'Drip Pipe Damage', 'Irrigation Pipe Damage', 'Water',
  ];

  // Helper function to get selected field's crop, dripper_count, and drip_test_count
  const getSelectedFieldInfo = (fieldId) => {
    if (!fieldId) return { crop: null, dripperCount: null, dripTestCount: null, field: null };
    const field = allFields.find((f) => f.id === fieldId);
    if (!field) return { crop: null, dripperCount: null, dripTestCount: null, field: null };
    const cropName = field.currentCrop;
    const dripperCount = cropName ? getCropDripperCount(masterData, cropName) : null;
    const dripTestCount = cropName ? getCropDripTestCount(masterData, cropName) : null;
    return { crop: cropName, dripperCount, dripTestCount, field };
  };

  // Helper function to calculate valve-specific values
  const calculateValveData = (valve, dripperCount, dripTestCount) => {
    if (!valve || !valve.dripVolume) return null;
    
    const dripVolume = parseFloat(valve.dripVolume) || 0;
    const drainVolume = parseFloat(valve.drainVolume) || 0;
    // Calculate N Drip Volume = Drip Volume × dripTestCount (dynamic per crop)
    const testCount = dripTestCount && dripTestCount > 0 ? dripTestCount : null;
    const dripVolumeN = testCount ? dripVolume * testCount : null;
    // %Drain = (Drain Volume ÷ N Drip Volume) × 100
    const percentDrain = dripVolumeN && dripVolumeN > 0 && drainVolume > 0
      ? ((drainVolume / dripVolumeN) * 100).toFixed(2)
      : '0.00';
    // Total Water Based on Drip Volume (M3) = (Drip Volume × dripper_count) ÷ 1000000
    // If dripperCount is null/0, return null to indicate N/A
    const totalWaterBasedOnDrip = (dripVolume > 0 && dripperCount && dripperCount > 0)
      ? ((dripVolume * dripperCount) / 1000000).toFixed(3)
      : null;

    return {
      ...valve,
      dripVolumeN,
      dripVolume12: dripVolumeN, // backward compat alias
      percentDrain,
      totalWaterBasedOnDrip: totalWaterBasedOnDrip !== null ? parseFloat(totalWaterBasedOnDrip) : null,
    };
  };

  const handleSubmit = (values, { resetForm }) => {
    if (readOnly) return;
    // Get selected field's crop, dripper_count, and drip_test_count
    const fieldInfo = getSelectedFieldInfo(values.field);
    const selectedCrop = fieldInfo.crop;
    const dripperCount = fieldInfo.dripperCount;
    const dripTestCount = fieldInfo.dripTestCount;

    // Calculate first valve data
    const valve1Data = calculateValveData(values.valve1, dripperCount, dripTestCount);
    if (!valve1Data) {
      notify.error('First valve data is required!');
      return;
    }

    // Calculate valve 2 data if provided
    let valve2Data = null;
    if (values.valve2 && values.valve2.dripVolume) {
      valve2Data = calculateValveData(values.valve2, dripperCount, dripTestCount);
    }

    // Per-valve Total Water QTY
    const v1Qty = parseFloat(values.valve1?.qtyOfWater) || 0;
    const v1Cyc = parseFloat(values.valve1?.cycle) || 0;
    const v1TWQ = v1Qty > 0 && v1Cyc > 0 ? v1Qty * v1Cyc : 0;

    const v2Qty = parseFloat(values.valve2?.qtyOfWater) || 0;
    const v2Cyc = parseFloat(values.valve2?.cycle) || 0;
    const v2TWQ = v2Qty > 0 && v2Cyc > 0 ? v2Qty * v2Cyc : 0;

    // Field-level average Total Water QTY
    const avgTWQ = (valve2Data && v2TWQ > 0)
      ? (v1TWQ + v2TWQ) / 2
      : v1TWQ;

    // Calculate field average drip-based total
    let fieldTotalWaterBasedOnDrip = null;
    if (dripperCount && dripperCount > 0) {
      if (valve2Data && valve2Data.totalWaterBasedOnDrip !== null) {
        fieldTotalWaterBasedOnDrip = ((valve1Data.totalWaterBasedOnDrip + valve2Data.totalWaterBasedOnDrip) / 2).toFixed(3);
      } else if (valve1Data.totalWaterBasedOnDrip !== null) {
        fieldTotalWaterBasedOnDrip = valve1Data.totalWaterBasedOnDrip.toFixed(3);
      }
    }

    // Build valves array
    const valves = [valve1Data];
    if (valve2Data) {
      valves.push(valve2Data);
    }

    const totalWaterQtyValue = Number(avgTWQ.toFixed(3));
    const fieldTotalWaterValue =
      fieldTotalWaterBasedOnDrip !== null ? Number(fieldTotalWaterBasedOnDrip) : undefined;
    const dripperCountValue = Number.isFinite(Number(dripperCount)) ? Number(dripperCount) : undefined;
    const dripTestCountValue = Number.isFinite(Number(dripTestCount)) && Number(dripTestCount) > 0
      ? Number(dripTestCount)
      : undefined;

    const buildValvePayload = (valve, srcValues) => {
      const qty = parseFloat(srcValues?.qtyOfWater) || 0;
      const cyc = parseFloat(srcValues?.cycle) || 0;
      const twq = qty > 0 && cyc > 0 ? qty * cyc : 0;
      return {
        valveNumber: Number(valve.valveNumber),
        dripVolume: valve.dripVolume ? parseFloat(valve.dripVolume) : undefined,
        drain: valve.drainVolume ? parseFloat(valve.drainVolume) : undefined,
        ecIn: valve.ecIn !== '' && valve.ecIn !== null && valve.ecIn !== undefined ? parseFloat(valve.ecIn) : undefined,
        ec: valve.ecOut !== '' && valve.ecOut !== null ? parseFloat(valve.ecOut) : undefined,
        phIn: valve.phIn !== '' && valve.phIn !== null && valve.phIn !== undefined ? parseFloat(valve.phIn) : undefined,
        ph: valve.phOut !== '' && valve.phOut !== null ? parseFloat(valve.phOut) : undefined,
        percentDrain: valve.percentDrain ? parseFloat(valve.percentDrain) : undefined,
        totalWaterBasedOnDrip: valve.totalWaterBasedOnDrip ?? undefined,
        ...(qty > 0 ? { qtyOfWater: qty } : {}),
        ...(cyc > 0 ? { cycle: Math.round(cyc) } : {}),
        ...(twq > 0 ? { totalWaterQty: Number(twq.toFixed(3)) } : {}),
      };
    };

    const payload = {
      fieldId: values.field,
      date: values.date,
      time: values.time || undefined,
      ...(values.weatherCondition ? { weatherCondition: values.weatherCondition } : {}),
      ...(values.irrigationStatus ? { irrigationStatus: values.irrigationStatus } : {}),
      ...(Number.isFinite(totalWaterQtyValue) && totalWaterQtyValue > 0 ? { totalWaterQty: totalWaterQtyValue } : {}),
      ...(Number.isFinite(fieldTotalWaterValue) ? { fieldTotalWaterBasedOnDrip: fieldTotalWaterValue } : {}),
      ...(Number.isFinite(dripperCountValue) && dripperCountValue > 0
        ? { dripperCount: Math.round(dripperCountValue) }
        : {}),
      ...(dripTestCountValue != null ? { dripTestCount: Math.round(dripTestCountValue) } : {}),
      valveReadings: [
        buildValvePayload(valves[0], values.valve1),
        ...(valves[1] ? [buildValvePayload(valves[1], values.valve2)] : []),
      ],
    };

    if (!navigator.onLine) {
      queueEntry({ type: 'ecph', data: payload })
        .then(() => {
          notify.success('You are offline. EC/PH entry queued for sync.');
          resetForm({ values: initialValues });
          setValve2Expanded(false);
        })
        .catch(() => notify.error('Failed to queue entry'));
      return;
    }

    createEcph(payload)
      .then(() => {
        notify.success('Entry saved successfully!');
        refreshEntries();
        resetForm({ values: initialValues });
        setValve2Expanded(false);
      })
      .catch(async (error) => {
        if (!navigator.onLine) {
          await queueEntry({ type: 'ecph', data: payload });
          notify.success('Network error. EC/PH entry queued for sync.');
          resetForm({ values: initialValues });
        } else {
          notify.error(error.message);
        }
      });
  };

  const handleClear = (resetForm) => {
    resetForm({ values: initialValues });
    setValve2Expanded(false);
  };

  return (
    <Container maxWidth="lg">
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <PageTitle>
            EC/PH Entry
          </PageTitle>
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
        </Box>

        {readOnly && <ReadOnlyBanner />}

        {viewMode === 'spreadsheet' && (
          <SpreadsheetEcphEntry onEntrySaved={refreshEntries} readOnly={readOnly} />
        )}

        {viewMode === 'form' && <Formik
          innerRef={formikRef}
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, handleChange, handleBlur, resetForm, setFieldValue }) => {
            // Initialize valve2 if expanded but not yet initialized
            if (valve2Expanded && !values.valve2) {
              setFieldValue('valve2', {
                valveNumber: '',
                dripVolume: '',
                drainVolume: '',
                ecIn: '',
                ecOut: '',
                phIn: '',
                phOut: '',
              }, false);
            }

            // Get selected field's crop, dripper_count, and drip_test_count
            const fieldInfo = getSelectedFieldInfo(values.field);
            const dripperCount = fieldInfo.dripperCount;
            const dripTestCount = fieldInfo.dripTestCount;
            const selectedCrop = fieldInfo.crop;

            // Calculate Valve metrics using shared utility
            const valve1BaseMetrics = calculateValveMetrics(
              values.valve1?.dripVolume, values.valve1?.drainVolume, dripTestCount, dripperCount
            );
            const v1Qty = (parseFloat(values.valve1?.qtyOfWater) || 0);
            const v1Cycle = (parseFloat(values.valve1?.cycle) || 0);
            const v1TotalWaterQty = v1Qty > 0 && v1Cycle > 0 ? (v1Qty * v1Cycle).toFixed(3) : '0.000';
            const valve1Metrics = { ...valve1BaseMetrics, totalWaterQty: v1TotalWaterQty };

            const valve2HasData = values.valve2 && values.valve2.dripVolume;
            const valve2BaseMetrics = valve2HasData
              ? calculateValveMetrics(values.valve2.dripVolume, values.valve2.drainVolume, dripTestCount, dripperCount)
              : { dripVolumeN: null, percentDrain: '0.00', totalWaterBasedOnDrip: null };
            const v2Qty = (parseFloat(values.valve2?.qtyOfWater) || 0);
            const v2Cycle = (parseFloat(values.valve2?.cycle) || 0);
            const v2TotalWaterQty = v2Qty > 0 && v2Cycle > 0 ? (v2Qty * v2Cycle).toFixed(3) : '0.000';
            const valve2Metrics = { ...valve2BaseMetrics, totalWaterQty: v2TotalWaterQty };

            // Calculate field-level drip average
            let fieldTotalWaterBasedOnDrip = null;
            if (dripperCount && dripperCount > 0) {
              const v1 = valve1BaseMetrics.totalWaterBasedOnDrip ? parseFloat(valve1BaseMetrics.totalWaterBasedOnDrip) : 0;
              const v2 = valve2BaseMetrics.totalWaterBasedOnDrip ? parseFloat(valve2BaseMetrics.totalWaterBasedOnDrip) : 0;
              if (valve2HasData && valve2BaseMetrics.totalWaterBasedOnDrip) {
                fieldTotalWaterBasedOnDrip = ((v1 + v2) / 2).toFixed(3);
              } else if (valve1BaseMetrics.totalWaterBasedOnDrip) {
                fieldTotalWaterBasedOnDrip = valve1BaseMetrics.totalWaterBasedOnDrip;
              }
            }

            // Calculate field-level average Total Water QTY
            const v1WQ = parseFloat(v1TotalWaterQty) || 0;
            const v2WQ = parseFloat(v2TotalWaterQty) || 0;
            const hasV2Water = valve2Expanded && v2WQ > 0;
            const avgTotalWaterQty = hasV2Water
              ? ((v1WQ + v2WQ) / 2).toFixed(3)
              : v1WQ > 0 ? v1TotalWaterQty : '0.000';

            return (
              <Form>
                <Grid container spacing={3}>
                  {/* Section 1: Basic Information */}
                  <Grid size={12}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                        <SettingsIcon color="primary" />
                        Basic Information
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            label="Date"
                            name="date"
                            value={values.date}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.date && !!errors.date}
                            helperText={touched.date && errors.date}
                            InputProps={{
                              readOnly: true,
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                          <TextField
                            fullWidth
                            select
                            label="Site"
                            name="site"
                            value={values.site}
                            onChange={(e) => {
                              setFieldValue('site', e.target.value);
                              setFieldValue('farmArea', '');
                              setFieldValue('field', '');
                            }}
                            onBlur={handleBlur}
                            error={touched.site && !!errors.site}
                            helperText={touched.site && errors.site}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <LocationIcon color="action" />
                                </InputAdornment>
                              ),
                            }}
                            InputLabelProps={{ shrink: true }}
                            SelectProps={{
                              displayEmpty: true,
                              renderValue: (selected) => {
                                if (!selected) return 'Select Site';
                                const site = allSites.find((s) => s.id === selected);
                                return site ? site.name : 'Select Site';
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
                            {allSites.map((site) => (
                              <MenuItem key={site.id} value={site.id}>
                                {site.name}
                              </MenuItem>
                            ))}
                            {allSites.length === 0 && (
                              <MenuItem value="" disabled>
                                No sites yet
                              </MenuItem>
                            )}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                          <TextField
                            fullWidth
                            select
                            label="Farm Area"
                            name="farmArea"
                            value={values.farmArea}
                            onChange={(e) => {
                              setFieldValue('farmArea', e.target.value);
                              setFieldValue('field', '');
                            }}
                            onBlur={handleBlur}
                            error={touched.farmArea && !!errors.farmArea}
                            helperText={touched.farmArea && errors.farmArea}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <LocationIcon color="action" />
                                </InputAdornment>
                              ),
                            }}
                            InputLabelProps={{ shrink: true }}
                            SelectProps={{
                              displayEmpty: true,
                              renderValue: (selected) => {
                                if (!selected) return 'Select Farm Area';
                                const farmArea = allFarmAreas.find((fa) => fa.id === selected);
                                return farmArea ? farmArea.name : 'Select Farm Area';
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
                            {allFarmAreas.filter(fa => !values.site || fa.siteId === values.site).map((farmArea) => (
                              <MenuItem key={farmArea.id} value={farmArea.id}>
                                {farmArea.name}
                              </MenuItem>
                            ))}
                            {allFarmAreas.filter(fa => !values.site || fa.siteId === values.site).length === 0 && (
                              <MenuItem value="" disabled>
                                No farm areas yet
                              </MenuItem>
                            )}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                          <TextField
                            fullWidth
                            select
                            label={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <span>Field</span>
                                <Tooltip title="Individual growing area. NH=Net House, GH=Greenhouse, OF=Open Field" arrow>
                                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                                </Tooltip>
                              </Box>
                            }
                            name="field"
                            value={values.field}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.field && !!errors.field}
                            helperText={touched.field && errors.field}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <LocationIcon color="action" />
                                </InputAdornment>
                              ),
                            }}
                            InputLabelProps={{ shrink: true }}
                            SelectProps={{
                              displayEmpty: true,
                              renderValue: (selected) => {
                                if (!selected) return 'Select Field';
                                const field = allFields.find((f) => f.id === selected);
                                return field ? field.name : 'Select Field';
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
                            {allFields.filter(f => !values.farmArea || f.farmAreaId === values.farmArea).map((field) => {
                              const fieldTypeTooltip = field.type === 'NetHouse' 
                                ? 'NH: Net House - partially climate-controlled structure with shade/netting'
                                : field.type === 'Greenhouse'
                                ? 'GH: Greenhouse - fully climate-controlled structure for year-round production'
                                : field.type === 'Open Field'
                                ? 'OF: Open Field - traditional farming with no climate control'
                                : '';
                              return (
                                <MenuItem key={field.id} value={field.id}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span>{field.name} ({field.type || 'Unknown'})</span>
                                    {fieldTypeTooltip && (
                                      <Tooltip title={fieldTypeTooltip} arrow>
                                        <InfoIcon fontSize="small" sx={{ ml: 1, opacity: 0.6 }} />
                                      </Tooltip>
                                    )}
                                  </Box>
                                </MenuItem>
                              );
                            })}
                            {allFields.filter(f => !values.farmArea || f.farmAreaId === values.farmArea).length === 0 && (
                              <MenuItem value="" disabled>
                                No fields yet
                              </MenuItem>
                            )}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            label="Time"
                            name="time"
                            value={values.time}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.time && !!errors.time}
                            helperText={touched.time && errors.time || 'Enter time (e.g., 3:00 PM, 1:30 PM)'}
                            placeholder="e.g., 3:00 PM"
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <ClockIcon color="action" />
                                </InputAdornment>
                              ),
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            select
                            label="Weather Condition"
                            name="weatherCondition"
                            value={values.weatherCondition}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            InputLabelProps={{ shrink: true }}
                            SelectProps={{ displayEmpty: true }}
                          >
                            <MenuItem value=""><em>— optional —</em></MenuItem>
                            {WEATHER_OPTIONS.map((w) => (
                              <MenuItem key={w} value={w}>{w}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            select
                            label="Irrigation Status"
                            name="irrigationStatus"
                            value={values.irrigationStatus}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            InputLabelProps={{ shrink: true }}
                            SelectProps={{ displayEmpty: true }}
                          >
                            <MenuItem value=""><em>— optional —</em></MenuItem>
                            {IRRIGATION_STATUS_OPTIONS.map((s) => (
                              <MenuItem key={s} value={s}>{s}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                      </Grid>
                    </Paper>
                  </Grid>

                  {/* Section 2: First Valve */}
                  <Grid size={12}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <ValveFormSection
                        prefix="valve1"
                        values={values.valve1}
                        errors={errors.valve1}
                        touched={touched.valve1}
                        handleChange={handleChange}
                        handleBlur={handleBlur}
                        dripTestCount={dripTestCount}
                        dripperCount={dripperCount}
                        selectedCrop={selectedCrop}
                        metrics={valve1Metrics}
                        placeholder="1, 3, V1, etc."
                        required
                      />
                    </Paper>
                  </Grid>

                  {/* Section 3: Second Valve (Optional) */}
                  <Grid size={12}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <SettingsIcon color="primary" />
                          Second Valve (Optional)
                        </Typography>
                        <IconButton
                          onClick={() => {
                            setValve2Expanded(!valve2Expanded);
                            if (!valve2Expanded && !values.valve2) {
                              setFieldValue('valve2', {
                                valveNumber: '',
                                dripVolume: '',
                                drainVolume: '',
                                ecIn: '',
                                ecOut: '',
                                phIn: '',
                                phOut: '',
                                qtyOfWater: '',
                                cycle: '',
                              });
                            }
                          }}
                          sx={{ color: 'primary.main' }}
                         aria-label={valve2Expanded ? 'Collapse row' : 'Expand row'}>
                          {valve2Expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Box>
                      <Collapse in={valve2Expanded}>
                        <ValveFormSection
                          prefix="valve2"
                          values={values.valve2}
                          errors={errors.valve2}
                          touched={touched.valve2}
                          handleChange={handleChange}
                          handleBlur={handleBlur}
                          dripTestCount={dripTestCount}
                          dripperCount={dripperCount}
                          selectedCrop={selectedCrop}
                          metrics={valve2Metrics}
                          placeholder="2, 4, V2, etc."
                        />
                      </Collapse>
                    </Paper>
                  </Grid>

                  {/* Section 4: Field-Level Summary */}
                  <Grid size={12}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                        <CalculateIcon color="primary" />
                        Field-Level Summary
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            label="V1 Total Water QTY (M³)"
                            value={v1TotalWaterQty || '0.000'}
                            InputProps={{
                              readOnly: true,
                              startAdornment: (
                                <InputAdornment position="start">
                                  <CalculateIcon color="action" fontSize="small" />
                                </InputAdornment>
                              ),
                            }}
                            helperText="Valve 1: Qty Of Water × Cycle"
                            sx={{ '& .MuiInputBase-input': { backgroundColor: 'action.hover' } }}
                          />
                        </Grid>
                        {valve2Expanded && (
                          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <TextField
                              fullWidth
                              label="V2 Total Water QTY (M³)"
                              value={v2TotalWaterQty || '0.000'}
                              InputProps={{
                                readOnly: true,
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <CalculateIcon color="action" fontSize="small" />
                                  </InputAdornment>
                                ),
                              }}
                              helperText="Valve 2: Qty Of Water × Cycle"
                              sx={{ '& .MuiInputBase-input': { backgroundColor: 'action.hover' } }}
                            />
                          </Grid>
                        )}
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            label={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <span>Avg Total Water QTY (M³)</span>
                                <Tooltip title={hasV2Water
                                  ? 'Average of Valve 1 and Valve 2 Total Water QTY: (V1 + V2) / 2'
                                  : 'Valve 1 Total Water QTY (only one valve used)'} arrow>
                                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                                </Tooltip>
                              </Box>
                            }
                            value={avgTotalWaterQty}
                            InputProps={{
                              readOnly: true,
                              startAdornment: (
                                <InputAdornment position="start">
                                  <CalculateIcon color="action" fontSize="small" />
                                </InputAdornment>
                              ),
                            }}
                            helperText={hasV2Water ? 'Auto-calculated: (V1 + V2) / 2' : 'From Valve 1 only'}
                            sx={{
                              '& .MuiInputBase-input': {
                                fontWeight: 'bold',
                                color: 'primary.main',
                              },
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField
                            fullWidth
                            label={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <span>{dripperCount && dripperCount > 0 
                                  ? `Avg Water Based on Drip (M³)` 
                                  : `Avg Water Based on Drip (N/A)`}</span>
                                <Tooltip title={dripperCount && dripperCount > 0
                                  ? `Field total water from drip test: (Drip Volume × ${dripperCount.toLocaleString()} drippers) ÷ 1,000,000.`
                                  : "This crop doesn't use drip calculation."} arrow>
                                  <InfoIcon fontSize="small" color="action" sx={{ cursor: 'help' }} />
                                </Tooltip>
                              </Box>
                            }
                            value={fieldTotalWaterBasedOnDrip !== null ? fieldTotalWaterBasedOnDrip : 'N/A'}
                            InputProps={{
                              readOnly: true,
                              startAdornment: (
                                <InputAdornment position="start">
                                  <CalculateIcon color="action" fontSize="small" />
                                </InputAdornment>
                              ),
                            }}
                            helperText={dripperCount && dripperCount > 0
                              ? (valve2HasData && valve2BaseMetrics.totalWaterBasedOnDrip
                                  ? `Average of V1 and V2 (${dripperCount.toLocaleString()} drippers)`
                                  : `Valve 1 only (${dripperCount.toLocaleString()} drippers)`)
                              : selectedCrop 
                                ? `${selectedCrop} uses Total Water QTY only`
                                : 'Select a field with a crop assigned'}
                            disabled={!dripperCount || dripperCount === 0}
                            sx={{
                              '& .MuiInputBase-input': {
                                fontWeight: 'bold',
                                color: dripperCount && dripperCount > 0 ? 'primary.main' : 'text.disabled',
                              },
                            }}
                          />
                        </Grid>
                        {selectedCrop && (
                          <Grid size={12}>
                            <Box sx={{ 
                              p: 1.5, 
                              bgcolor: 'info.light', 
                              borderRadius: 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1
                            }}>
                              <Typography variant="body2" sx={{ color: 'white', fontWeight: 600 }}>
                                Selected Field Crop: {selectedCrop}
                                {dripperCount && dripperCount > 0 
                                  ? ` - ${dripperCount.toLocaleString()} drippers`
                                  : ' - No drip calculation (uses Total Water QTY only)'}
                              </Typography>
                            </Box>
                          </Grid>
                        )}
                      </Grid>
                    </Paper>
                  </Grid>

                  {/* Action Buttons */}
                  <Grid size={12}>
                    <Paper elevation={2} sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <Button
                          variant="outlined"
                          color="secondary"
                          startIcon={<ClearIcon />}
                          onClick={() => handleClear(resetForm)}
                          size="large"
                          disabled={readOnly}
                        >
                          Clear Form
                        </Button>
                        <Button
                          type="submit"
                          variant="contained"
                          color="primary"
                          startIcon={<SaveIcon />}
                          size="large"
                          disabled={readOnly}
                        >
                          Save Entry
                        </Button>
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </Form>
            );
          }}
        </Formik>}

        <EcphEntriesTable
          siteId={activeSiteId}
          masterData={masterData}
          refreshTrigger={entriesRefreshKey}
        />
      </Box>
    </Container>
  );
}

export default ECPHEntry;
