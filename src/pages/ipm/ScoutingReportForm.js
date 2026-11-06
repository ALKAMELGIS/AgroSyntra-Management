import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  MenuItem, Typography, Box, Divider, IconButton, Tooltip, Alert,
  Select, InputLabel, FormControl, Chip, Table, TableHead, TableRow, TableCell,
  TableBody, Paper, InputAdornment, Autocomplete,
} from '@mui/material';
import { MyLocationOutlined as MyLocation, CloseOutlined as Close, SaveOutlined as Save, PhotoLibraryOutlined as PhotoLibrary, CameraAltOutlined as CameraAlt, DeleteOutlined as DeleteIcon } from '@mui/icons-material';
import api from '../../utils/api';
import useAppLayout from '../../hooks/useAppLayout';
import {
  cropNameFromField,
  getLocationOptionsForField,
  normalizeBayChips,
  normalizeValveChips,
  resolveVarietyForLocation,
} from '../../utils/plantingSegment';
import {
  buildObservationRows,
  cloneObsRow,
  initialInsectRows,
  initialDiseaseRows,
  INSECT_ROW_TEMPLATES,
  DISEASE_ROW_TEMPLATES,
  sumSampleCounts,
  avgSampleCounts,
  hasAnySampleInput,
  toSampleNum,
  SCOUTING_SAMPLE_INDICES,
} from '../../utils/scoutingObsRows';
import ScoutingObservationTable from '../../components/ScoutingObservationTable';
import CameraCaptureDialog from '../../components/CameraCaptureDialog';
import { loadMasterData, getCropPlantCount } from '../../utils/masterDataUtils';
import {
  computeInfestationByPest,
  pestGroupKey,
} from '../../utils/scoutingInfestation';

// Paper-form row order (EAG/AFO/IWS/RC-105). Matched to pest_disease_catalog.abbreviation.
const INSECT_ROWS = [
  { abbr: 'MA', label: 'Mite adult (MA)' },
  { abbr: 'ML', label: 'Mite larva (ML)' },
  { abbr: 'ME', label: 'Mite egg (ME)' },
  { abbr: 'WA', label: 'Whitefly adult (WA)' },
  { abbr: 'WE', label: 'Whitefly egg (WE)' },
  { abbr: 'TA', label: 'Tuta absoluta (TA)' },
  { abbr: 'A',  label: 'Aphids (A)' },
  { abbr: 'T',  label: 'Thrips (T)' },
  { abbr: 'L',  label: 'Leaf miner (L)' },
  { abbr: 'W',  label: 'Worm (W)' },
];

const DISEASE_ROWS = [
  { abbr: 'EB', label: 'Early blight (EB)' },
  { abbr: 'LB', label: 'Late blight (LB)' },
  { abbr: 'BL', label: 'Bacterial blight (BL)' },
  { abbr: 'B',  label: 'Botrytis (B)' },
  { abbr: 'DW', label: 'Downy mildew (DW)' },
  { abbr: 'An', label: 'Anthracnose (An)' },
  { abbr: 'P',  label: 'Phytium (P)' },
  { abbr: 'F',  label: 'Fusarium (F)' },
];

// Fixed trap cards per paper form: Whitefly, Thrips, Thrips, Tuta
const DEFAULT_TRAP_CARDS = [
  { cardNumber: 1, insectType: 'whitefly', trapLocation: '' },
  { cardNumber: 2, insectType: 'thrips',   trapLocation: '' },
  { cardNumber: 3, insectType: 'thrips',   trapLocation: '' },
  { cardNumber: 4, insectType: 'tuta',     trapLocation: '' },
];

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const emptyTrapRow = (c) => ({
  ...c,
  monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '',
});

const toNum = toSampleNum;

const sumCounts = sumSampleCounts;
const avgCounts = avgSampleCounts;

const sumDays = (row) =>
  DAY_KEYS.map((k) => toNum(row[k])).filter((n) => n !== null).reduce((a, b) => a + b, 0);

/**
 * Form for creating AND editing scouting reports.
 *
 * In edit mode the caller passes `editReport` (the detail object returned
 * by GET /scouting/reports/:id). We prefill every field from it, then on
 * submit use PUT /reports/:id instead of POST /reports. Photos are not
 * re-uploaded on edit — they live in the generic attachments table and
 * are managed on the expanded-row view.
 */
export default function ScoutingReportForm({ open, onClose, fields, plantingRecords = [], onSaved, editReport, readOnly = false }) {
  const isEditing = Boolean(editReport);
  const { isMobile } = useAppLayout();
  const skipAutoFillRef = useRef(false);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cropHelper, setCropHelper] = useState('');
  const [varietyHelper, setVarietyHelper] = useState('');
  const [varietyWarning, setVarietyWarning] = useState('');
  const [cropTouched, setCropTouched] = useState(false);
  const [varietyTouched, setVarietyTouched] = useState(false);
  const [masterData, setMasterData] = useState(null);
  const [samplingUnits, setSamplingUnits] = useState(null);

  // Header
  const [fieldId, setFieldId] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportTime, setReportTime] = useState(new Date().toTimeString().slice(0, 5));
  const [cropName, setCropName] = useState('');
  const [variety, setVariety] = useState('');
  const [areaVariety, setAreaVariety] = useState('');
  const [densityPerArea, setDensityPerArea] = useState('');

  // Location codes (arrays → stored as comma-separated strings)
  const [bedCodes, setBedCodes] = useState([]);
  const [columnCodes, setColumnCodes] = useState([]);
  const [bayCodes, setBayCodes] = useState([]);
  const [valveCodes, setValveCodes] = useState([]);
  const [side, setSide] = useState('');

  // Environment
  const [cropHeight, setCropHeight] = useState('');
  const [soilCondition, setSoilCondition] = useState('');
  const [weather, setWeather] = useState('sunny');
  const [wind, setWind] = useState('none');
  const [gpsLat, setGpsLat] = useState('');
  const [gpsLng, setGpsLng] = useState('');

  // Observations (insect + disease tables)
  const [insectRows, setInsectRows] = useState(() => initialInsectRows());
  const [diseaseRows, setDiseaseRows] = useState(() => initialDiseaseRows());

  // Growth stage
  const [numberOfTrusses, setNumberOfTrusses] = useState('');
  const [numberOfStems, setNumberOfStems] = useState('');
  const [stemThickness, setStemThickness] = useState('');
  const [avgFruitWeight, setAvgFruitWeight] = useState('');
  const [fruitsPerPlant, setFruitsPerPlant] = useState('');

  // Trap cards
  const [trapCards, setTrapCards] = useState(DEFAULT_TRAP_CARDS.map(emptyTrapRow));

  // Comments
  const [comments, setComments] = useState('');
  const [severity, setSeverity] = useState('');

  // Photos — selected locally, uploaded after the report is created so we
  // have a report id to attach them to. We show previews before submit so
  // the user can remove accidental captures.
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const canUseWebcam = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  // Load catalog once on open & reset form
  useEffect(() => {
    if (!open) return;
    loadMasterData().then(setMasterData).catch(() => setMasterData(null));
    (async () => {
      try {
        const res = await api.get('/scouting/pest-catalog');
        const list = (res.data?.data || []).filter((c) => c.category === 'pest' || c.category === 'disease');
        setCatalog(list);

        // Pre-link catalog IDs to paper-form rows by abbreviation
        const byAbbr = new Map(list.filter((c) => c.abbreviation).map((c) => [c.abbreviation, c]));
        const linkCatalog = (rows) => rows.map((r) => ({
          ...r,
          pestDiseaseId: byAbbr.get(r.abbr)?.id || r.pestDiseaseId || null,
          pestName: byAbbr.get(r.abbr)?.name || r.pestName || r.label,
        }));
        if (!editReport) {
          setInsectRows(linkCatalog(initialInsectRows()));
          setDiseaseRows(linkCatalog(initialDiseaseRows()));
        }
      } catch (err) {
        console.error('Failed to load pest catalog:', err);
      }
    })();
    setError('');
    if (!editReport) {
      skipAutoFillRef.current = false;
    }
  }, [open, editReport]);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === fieldId) || null,
    [fields, fieldId],
  );

  const plantCount = useMemo(
    () => getCropPlantCount(masterData, cropName),
    [masterData, cropName],
  );

  useEffect(() => {
    if (!open || !fieldId) {
      setSamplingUnits(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/scouting/sampling-units/${fieldId}`);
        if (!cancelled) {
          setSamplingUnits(res.data?.data?.samplingUnits ?? null);
        }
      } catch {
        if (!cancelled) setSamplingUnits(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fieldId]);

  const handleFieldChange = (field) => {
    skipAutoFillRef.current = false;
    setCropTouched(false);
    setVarietyTouched(false);
    const id = field?.id || '';
    setFieldId(id);
    setBedCodes([]);
    setColumnCodes([]);
    setBayCodes([]);
    setValveCodes([]);
    const crop = cropNameFromField(field);
    setCropName(crop);
    const fieldVariety = field?.varietyName || field?.variety || '';
    setVariety(fieldVariety);
    setCropHelper(crop ? 'From field' : 'No crop on this field — set in Crop Rotation');
    setVarietyHelper(
      fieldVariety ? 'From field (select bay or valve to refine)' : '',
    );
    setVarietyWarning('');
  };

  const handleBayCodesChange = (codes) => {
    skipAutoFillRef.current = false;
    setVarietyTouched(false);
    setBayCodes(normalizeBayChips(codes));
  };

  const handleValveCodesChange = (codes) => {
    skipAutoFillRef.current = false;
    setVarietyTouched(false);
    setValveCodes(normalizeValveChips(codes));
  };

  useEffect(() => {
    if (skipAutoFillRef.current || !fieldId || varietyTouched) return;
    const result = resolveVarietyForLocation({
      fieldId,
      bayCodes,
      valveCodes,
      plantingRecords,
      field: selectedField,
    });
    setVariety(result.variety);
    setVarietyHelper(result.varietyHelper || '');
    setVarietyWarning(result.varietyWarning || '');
  }, [fieldId, bayCodes, valveCodes, plantingRecords, selectedField, varietyTouched]);

  /**
   * Prefill every field from `editReport` when the dialog opens in edit
   * mode. We run this after the catalog loads so the observation rows
   * keep their catalog-linked ids, but the numeric counts / percentages
   * come from the stored report.
   */
  useEffect(() => {
    if (!open || !editReport) return;
    skipAutoFillRef.current = true;

    const splitCodes = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      return String(v).split(',').map((s) => s.trim()).filter(Boolean);
    };

    setFieldId(editReport.field_id || '');
    setReportDate(
      editReport.report_date
        ? new Date(editReport.report_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    );
    setReportTime(editReport.report_time ? String(editReport.report_time).slice(0, 5) : '');
    setCropName(editReport.crop_name || '');
    setVariety(editReport.variety || '');
    setCropHelper('');
    setVarietyHelper('');
    setVarietyWarning('');
    setCropTouched(true);
    setVarietyTouched(true);
    setAreaVariety(editReport.area_variety || '');
    setDensityPerArea(editReport.density_per_area ?? '');
    setBedCodes(splitCodes(editReport.bed_code));
    setColumnCodes(splitCodes(editReport.column_code));
    setBayCodes(splitCodes(editReport.bay_code));
    setValveCodes(splitCodes(editReport.valve_code));
    setSide(editReport.side || '');
    setCropHeight(editReport.crop_height ?? '');
    setSoilCondition(editReport.soil_condition || '');
    setWeather(editReport.weather || 'sunny');
    setWind(editReport.wind || 'none');
    setGpsLat(editReport.gps_lat ?? '');
    setGpsLng(editReport.gps_lng ?? '');
    setComments(editReport.comments || '');
    setSeverity(editReport.severity || '');

    const savedObs = editReport.observations || [];
    setInsectRows(buildObservationRows(INSECT_ROW_TEMPLATES, savedObs, 'insect'));
    setDiseaseRows(buildObservationRows(DISEASE_ROW_TEMPLATES, savedObs, 'disease'));

    // Growth stage
    const g = editReport.growth_stage || editReport.growthStage || {};
    setNumberOfTrusses(g.number_of_trusses ?? g.numberOfTrusses ?? '');
    setNumberOfStems(g.number_of_stems ?? g.numberOfStems ?? '');
    setStemThickness(g.stem_thickness ?? g.stemThickness ?? '');
    setAvgFruitWeight(g.avg_fruit_weight ?? g.avgFruitWeight ?? '');
    setFruitsPerPlant(g.fruits_per_plant ?? g.fruitsPerPlant ?? '');

    // Trap cards — preserve the saved card slots by index so a user who
    // removed one card doesn't get it silently reappearing blank.
    if (Array.isArray(editReport.trap_cards) && editReport.trap_cards.length > 0) {
      setTrapCards(editReport.trap_cards.map((card, idx) => ({
        cardNumber: card.card_number ?? idx + 1,
        insectType: card.insect_type || '',
        trapLocation: card.trap_location || '',
        monday: card.monday ?? '',
        tuesday: card.tuesday ?? '',
        wednesday: card.wednesday ?? '',
        thursday: card.thursday ?? '',
        friday: card.friday ?? '',
        saturday: card.saturday ?? '',
        sunday: card.sunday ?? '',
      })));
    }
  }, [open, editReport]);

  const resetForm = () => {
    setFieldId('');
    setReportDate(new Date().toISOString().split('T')[0]);
    setReportTime(new Date().toTimeString().slice(0, 5));
    setCropName(''); setVariety(''); setAreaVariety(''); setDensityPerArea('');
    setCropHelper(''); setVarietyHelper(''); setVarietyWarning('');
    setCropTouched(false);
    setVarietyTouched(false);
    setBedCodes([]); setColumnCodes([]); setBayCodes([]); setValveCodes([]); setSide('');
    skipAutoFillRef.current = false;
    setCropHeight(''); setSoilCondition(''); setWeather('sunny'); setWind('none');
    setGpsLat(''); setGpsLng('');
    setInsectRows(initialInsectRows());
    setDiseaseRows(initialDiseaseRows());
    setNumberOfTrusses(''); setNumberOfStems(''); setStemThickness('');
    setAvgFruitWeight(''); setFruitsPerPlant('');
    setTrapCards(DEFAULT_TRAP_CARDS.map(emptyTrapRow));
    setComments(''); setSeverity('');
    photoPreviews.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch { /* noop */ } });
    setPhotoFiles([]); setPhotoPreviews([]);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const addPhotoFiles = (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const accepted = list.filter((f) => f.type.startsWith('image/') && f.size < 10 * 1024 * 1024);
    if (accepted.length < list.length) {
      setError('Skipped one or more files (must be images under 10 MB).');
    }
    setPhotoFiles((prev) => [...prev, ...accepted]);
    setPhotoPreviews((prev) => [
      ...prev,
      ...accepted.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    ]);
  };

  const handlePhotosSelected = (ev) => {
    addPhotoFiles(ev.target.files);
    ev.target.value = '';
  };

  const handleTakePhotoClick = () => {
    if (!isMobile && canUseWebcam) {
      setCameraOpen(true);
    }
  };

  const removePhoto = (idx) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => {
      const removed = prev[idx];
      if (removed) { try { URL.revokeObjectURL(removed.url); } catch { /* noop */ } }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude.toFixed(7));
        setGpsLng(pos.coords.longitude.toFixed(7));
      },
      (err) => setError(`Could not get location: ${err.message}`),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const updateObsRow = (list, setList) => (idx, patch) => {
    setList(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const segmentOptions = useMemo(
    () => [...new Set([...normalizeBayChips(bayCodes), ...normalizeValveChips(valveCodes)])],
    [bayCodes, valveCodes],
  );

  const addObsRowAfter = (list, setList) => (idx) => {
    const clone = cloneObsRow(list[idx]);
    setList([...list.slice(0, idx + 1), clone, ...list.slice(idx + 1)]);
  };

  const removeObsRowAt = (list, setList) => (idx) => {
    if (list[idx]?.isBase) return;
    setList(list.filter((_, i) => i !== idx));
  };

  const updateTrapRow = (idx, patch) => {
    setTrapCards((cards) => cards.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const buildPayload = () => {
    const allRows = [...insectRows, ...diseaseRows];
    const infestationByPest = computeInfestationByPest(
      allRows,
      plantCount,
      samplingUnits,
      hasAnySampleInput,
      avgCounts,
    );

    const rowToObs = (r) => {
      const hasAnyCount = hasAnySampleInput(r);
      if (!hasAnyCount) return null;
      const total = sumCounts(r);
      const average = avgCounts(r);
      const counts = {};
      SCOUTING_SAMPLE_INDICES.forEach((n) => {
        counts[`count${n}`] = toNum(r[`count${n}`]) ?? undefined;
      });
      const pct = infestationByPest[pestGroupKey(r)];
      return {
        pestDiseaseId: r.pestDiseaseId || undefined,
        pestName: r.pestName || r.label,
        category: r.category,
        samplingUnit: r.samplingUnit || undefined,
        samplingMethod: r.samplingMethod || undefined,
        ...counts,
        total,
        average: Number(average.toFixed(2)),
        percent: pct ?? undefined,
      };
    };

    const observations = [...insectRows, ...diseaseRows]
      .map(rowToObs).filter((r) => r !== null);

    const trapCardsPayload = trapCards
      .map((c) => {
        const hasAnyDay = DAY_KEYS.some((k) => c[k] !== '' && c[k] !== null && c[k] !== undefined);
        if (!hasAnyDay && !c.trapLocation) return null;
        const total = sumDays(c);
        return {
          cardNumber: c.cardNumber,
          insectType: c.insectType || undefined,
          trapLocation: c.trapLocation || undefined,
          monday: toNum(c.monday) ?? undefined,
          tuesday: toNum(c.tuesday) ?? undefined,
          wednesday: toNum(c.wednesday) ?? undefined,
          thursday: toNum(c.thursday) ?? undefined,
          friday: toNum(c.friday) ?? undefined,
          saturday: toNum(c.saturday) ?? undefined,
          sunday: toNum(c.sunday) ?? undefined,
          total: hasAnyDay ? total : undefined,
        };
      })
      .filter((c) => c !== null);

    const growthStage = {};
    if (numberOfTrusses !== '') growthStage.numberOfTrusses = toNum(numberOfTrusses);
    if (numberOfStems !== '')   growthStage.numberOfStems   = toNum(numberOfStems);
    if (stemThickness !== '')   growthStage.stemThickness   = toNum(stemThickness);
    if (avgFruitWeight !== '')  growthStage.avgFruitWeight  = toNum(avgFruitWeight);
    if (fruitsPerPlant !== '')  growthStage.fruitsPerPlant  = toNum(fruitsPerPlant);

    return {
      fieldId,
      reportDate,
      reportTime: reportTime || undefined,
      cropName: cropName || undefined,
      variety: variety || undefined,
      areaVariety: areaVariety || undefined,
      densityPerArea: toNum(densityPerArea) ?? undefined,
      cropHeight: toNum(cropHeight) ?? undefined,
      soilCondition: soilCondition || undefined,
      weather: weather || undefined,
      wind: wind || undefined,
      bedCode: bedCodes.length ? bedCodes.join(', ') : undefined,
      columnCode: columnCodes.length ? columnCodes.join(', ') : undefined,
      bayCode: bayCodes.length ? bayCodes.join(', ') : undefined,
      valveCode: valveCodes.length ? valveCodes.join(', ') : undefined,
      side: side || undefined,
      severity: severity || undefined,
      comments: comments || undefined,
      gpsLat: toNum(gpsLat) ?? undefined,
      gpsLng: toNum(gpsLng) ?? undefined,
      observations: observations.length ? observations : undefined,
      growthStage: Object.keys(growthStage).length ? growthStage : undefined,
      trapCards: trapCardsPayload.length ? trapCardsPayload : undefined,
    };
  };

  const handleSubmit = async () => {
    if (readOnly) return;
    setError('');
    if (!fieldId) {
      setError('Please select a field.');
      return;
    }
    const hasSampleRows = [...insectRows, ...diseaseRows].some(hasAnySampleInput);
    if (hasSampleRows) {
      if (!plantCount) {
        setError('Plant count is not configured for this crop. Set plant count in Crops Management before saving counts.');
        return;
      }
      if (!samplingUnits) {
        setError('Sampling units are not configured for this field. Configure them under IPM → Pest Catalog → Sampling Units.');
        return;
      }
    }
    const payload = buildPayload();
    try {
      setLoading(true);
      let saveRes;
      if (isEditing) {
        saveRes = await api.put(`/scouting/reports/${editReport.id}`, payload);
      } else {
        saveRes = await api.post('/scouting/reports', payload);
      }
      const reportId = saveRes?.data?.data?.id || saveRes?.data?.id || editReport?.id;

      if (photoFiles.length > 0 && reportId) {
        setUploadingPhotos(true);
        try {
          const fd = new FormData();
          photoFiles.forEach((f) => fd.append('files', f, f.name));
          // Reuse the existing generic /uploads/:entity/:entityId route
          // so every photo becomes a row in the attachments table linked
          // to this scouting_report id.
          await api.post(`/uploads/scouting_report/${reportId}`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (uploadErr) {
          console.error('Photo upload failed:', uploadErr);
          // The report itself saved — surface a soft warning, don't block close.
          setError(
            'Report saved, but one or more photos failed to upload. You can re-attach them by editing the report later.',
          );
          setUploadingPhotos(false);
          setLoading(false);
          return; // keep the dialog open so the error is visible
        } finally {
          setUploadingPhotos(false);
        }
      }

      resetForm();
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to save scouting report:', err);
      if (err?.queued) {
        // The save was queued offline — treat as a soft success.
        // We can't upload photos in this state (the queue doesn't
        // accept FormData), so warn and fall back to a clean reset
        // so the scout can keep moving.
        if (photoFiles.length > 0) {
          setError(
            'Saved offline — will sync when you reconnect. Photos were NOT queued; re-attach them by editing the report once the queue drains.',
          );
        } else {
          setError('Saved offline — will sync when you reconnect.');
        }
        resetForm();
        onSaved?.();
        // Keep the dialog open briefly so the message is visible,
        // but unblock the scout: they can close it manually.
        setLoading(false);
        return;
      }
      setError(err.response?.data?.error?.message || err.message || 'Failed to save scouting report');
    } finally {
      setLoading(false);
    }
  };

  const insectTotals = useMemo(() =>
    insectRows.map((r) => {
      const hasAnyCount = hasAnySampleInput(r);
      return { total: hasAnyCount ? sumCounts(r) : null, avg: hasAnyCount ? avgCounts(r) : null };
    }), [insectRows]);
  const diseaseTotals = useMemo(() =>
    diseaseRows.map((r) => {
      const hasAnyCount = hasAnySampleInput(r);
      return { total: hasAnyCount ? sumCounts(r) : null, avg: hasAnyCount ? avgCounts(r) : null };
    }), [diseaseRows]);
  const trapTotals = useMemo(() => trapCards.map((c) => sumDays(c)), [trapCards]);

  const infestationByPest = useMemo(() => computeInfestationByPest(
    [...insectRows, ...diseaseRows],
    plantCount,
    samplingUnits,
    hasAnySampleInput,
    avgCounts,
  ), [insectRows, diseaseRows, plantCount, samplingUnits]);

  const locationOptions = useMemo(() => {
    if (!fieldId) {
      return { bays: [], valves: [], hasPlantingSegments: false };
    }
    const valveCount =
      selectedField?.valve_count ?? selectedField?.valveCount ?? 4;
    return getLocationOptionsForField(fieldId, plantingRecords, {
      savedBays: bayCodes,
      savedValves: valveCodes,
      valveCountFallback: valveCount,
    });
  }, [fieldId, plantingRecords, selectedField, bayCodes, valveCodes]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {isEditing ? 'Edit Scouting Report' : 'New Scouting Report — Covered'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Ref: EAG/AFO/IWS/RC-105 · Issue 03, Rev00
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isEditing && editReport?.status === 'returned' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Returned – please fix: {editReport.review_notes || 'see the pest agronomist'}
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Saving your changes sends the report back for review.
            </Typography>
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Header — flex-wrap so each field gets its own minWidth and labels
            never truncate, even when devtools split the dialog narrow. */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Header</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box sx={{ flex: '1 1 150px', minWidth: 150 }}>
            <TextField fullWidth size="small" type="date" label="Date"
              InputLabelProps={{ shrink: true }}
              value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 140px', minWidth: 140 }}>
            <TextField fullWidth size="small" type="time" label="Time"
              InputLabelProps={{ shrink: true }}
              value={reportTime} onChange={(e) => setReportTime(e.target.value)} />
          </Box>
          <Box sx={{ flex: '2 1 260px', minWidth: 220 }}>
            <Autocomplete
              size="small"
              options={fields}
              getOptionLabel={(f) => f?.name || ''}
              isOptionEqualToValue={(a, b) => a?.id === b?.id}
              value={fields.find((f) => f.id === fieldId) || null}
              onChange={(_, v) => handleFieldChange(v)}
              renderInput={(params) => (
                <TextField {...params} label="Field" required
                  helperText={fields.length === 0 ? 'No fields available — ask admin to assign you to a site or field.' : ''}
                />
              )}
            />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <TextField fullWidth size="small" label="Crop"
              placeholder="e.g. Plum Tomato"
              value={cropName}
              onChange={(e) => {
                setCropTouched(true);
                setCropName(e.target.value);
                setCropHelper('');
              }}
              helperText={cropHelper} />
          </Box>
          <Box sx={{ flex: '1 1 280px', minWidth: 280 }}>
            <TextField
              fullWidth
              size="small"
              label="Variety"
              value={variety}
              multiline={variety.includes(';')}
              minRows={variety.includes(';') ? 2 : 1}
              onChange={(e) => {
                setVarietyTouched(true);
                setVariety(e.target.value);
                setVarietyHelper('');
                setVarietyWarning('');
              }}
              helperText={varietyWarning || varietyHelper}
              FormHelperTextProps={
                varietyWarning ? { sx: { color: 'warning.main' } } : undefined
              }
            />
          </Box>
          <Box sx={{ flex: '1 1 180px', minWidth: 180 }}>
            <TextField fullWidth size="small" label="Area / Variety"
              value={areaVariety} onChange={(e) => setAreaVariety(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 170px', minWidth: 170 }}>
            <TextField fullWidth size="small" type="number" label="Density / area"
              value={densityPerArea} onChange={(e) => setDensityPerArea(e.target.value)} />
          </Box>
        </Box>

        {/* Location codes — multi-value chips. Use flex-wrap with min-widths
            so inputs size to the dialog (not the viewport) and never clip their
            labels on narrow screens / side-by-side devtools. */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Location within field</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Select bays and valves from the list (from Crop History). Beds and columns: type a code and press Enter.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <ChipInput label="Bed(s)" placeholder="e.g. b1" value={bedCodes} onChange={setBedCodes} />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <ChipInput label="Column(s)" placeholder="e.g. c1" value={columnCodes} onChange={setColumnCodes} />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <LocationMultiSelect
              label="Bay(s)"
              value={bayCodes}
              options={locationOptions.bays}
              onChange={handleBayCodesChange}
              disabled={!fieldId}
              helperText={
                !fieldId
                  ? 'Select a field first'
                  : (locationOptions.bays.length === 0
                      ? 'No bays in Crop History for this field'
                      : '')
              }
            />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <LocationMultiSelect
              label="Valve(s)"
              value={valveCodes}
              options={locationOptions.valves}
              onChange={handleValveCodesChange}
              disabled={!fieldId}
              helperText={
                !fieldId
                  ? 'Select a field first'
                  : (locationOptions.hasPlantingSegments
                      ? 'From Crop History segments'
                      : 'Default valves for this field')
              }
            />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="scoutingreportform-side-label-1">Side</InputLabel>
              <Select labelId="scoutingreportform-side-label-1" value={side} label="Side" onChange={(e) => setSide(e.target.value)}>
                <MenuItem value="">—</MenuItem>
                <MenuItem value="fan">Fan side (F)</MenuItem>
                <MenuItem value="wet_pad">Wet-Pad side (W)</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Environment */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Environment</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <TextField fullWidth size="small" type="number" label="Crop Height (cm)"
              value={cropHeight} onChange={(e) => setCropHeight(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="scoutingreportform-soil-condition-label-2">Soil Condition</InputLabel>
              <Select labelId="scoutingreportform-soil-condition-label-2" value={soilCondition} label="Soil Condition" onChange={(e) => setSoilCondition(e.target.value)}>
                <MenuItem value="">—</MenuItem>
                <MenuItem value="wet">Wet</MenuItem>
                <MenuItem value="dry">Dry</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="scoutingreportform-weather-label-3">Weather</InputLabel>
              <Select labelId="scoutingreportform-weather-label-3" value={weather} label="Weather" onChange={(e) => setWeather(e.target.value)}>
                <MenuItem value="sunny">Sunny</MenuItem>
                <MenuItem value="cloudy">Cloudy</MenuItem>
                <MenuItem value="rainy">Rainy</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: '1 1 140px', minWidth: 140 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="scoutingreportform-wind-label-4">Wind</InputLabel>
              <Select labelId="scoutingreportform-wind-label-4" value={wind} label="Wind" onChange={(e) => setWind(e.target.value)}>
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="strong">Strong</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: '1 1 140px', minWidth: 140 }}>
            <TextField fullWidth size="small" label="GPS Lat"
              value={gpsLat} onChange={(e) => setGpsLat(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <TextField fullWidth size="small" label="GPS Lng"
              value={gpsLng} onChange={(e) => setGpsLng(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Use my location">
                      <IconButton size="small" onClick={handleUseMyLocation}>
                        <MyLocation fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {(fieldId && (plantCount || samplingUnits != null)) && (
          <Alert severity={plantCount && samplingUnits ? 'info' : 'warning'} sx={{ mb: 2 }}>
            {plantCount
              ? `Plant count: ${plantCount.toLocaleString()} (${cropName || 'crop'})`
              : 'Plant count not set for this crop — configure in Crops Management.'}
            {' · '}
            {samplingUnits
              ? `Sampling units: ${samplingUnits}`
              : 'Sampling units not configured for this field — set under Pest Catalog → Sampling Units.'}
          </Alert>
        )}

        <TableContainerScroll>
          <ScoutingObservationTable
            title="Insect counts"
            chipLabel="counts at each segment"
            subtitle="Pick a segment (bay/valve) per row where you counted. Sample 1–10 are stops within that segment. Use + to add the same pest on another segment. Infestation % is computed per pest."
            rows={insectRows}
            totals={insectTotals}
            segmentOptions={segmentOptions}
            showInfestation
            infestationByPest={infestationByPest}
            onUpdateRow={updateObsRow(insectRows, setInsectRows)}
            onAddRow={addObsRowAfter(insectRows, setInsectRows)}
            onRemoveRow={removeObsRowAt(insectRows, setInsectRows)}
          />
        </TableContainerScroll>

        <Box sx={{ mt: 3 }}>
        <TableContainerScroll>
          <ScoutingObservationTable
            title="Disease counts"
            subtitle="Segment = bay or valve. Count basis = leaf, fruit, or plant. Use + to add the same disease on another segment."
            rows={diseaseRows}
            totals={diseaseTotals}
            segmentOptions={segmentOptions}
            showInfestation
            infestationByPest={infestationByPest}
            onUpdateRow={updateObsRow(diseaseRows, setDiseaseRows)}
            onAddRow={addObsRowAfter(diseaseRows, setDiseaseRows)}
            onRemoveRow={removeObsRowAt(diseaseRows, setDiseaseRows)}
          />
        </TableContainerScroll>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Growth stage */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Growth stage</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <TextField fullWidth size="small" type="number" label="# Trusses"
              value={numberOfTrusses} onChange={(e) => setNumberOfTrusses(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <TextField fullWidth size="small" type="number" label="# Stems"
              value={numberOfStems} onChange={(e) => setNumberOfStems(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 190px', minWidth: 190 }}>
            <TextField fullWidth size="small" type="number" label="Stem thickness (mm)"
              value={stemThickness} onChange={(e) => setStemThickness(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <TextField fullWidth size="small" type="number" label="Avg fruit weight (g)"
              value={avgFruitWeight} onChange={(e) => setAvgFruitWeight(e.target.value)} />
          </Box>
          <Box sx={{ flex: '1 1 170px', minWidth: 170 }}>
            <TextField fullWidth size="small" type="number" label="Fruits / plant"
              value={fruitsPerPlant} onChange={(e) => setFruitsPerPlant(e.target.value)} />
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Trap cards */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Insect trap cards (weekly)</Typography>
        <TableContainerScroll>
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell align="center" sx={{ minWidth: 60 }}>Card</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Type</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Location</TableCell>
                {DAY_LABELS.map((d) => (
                  <TableCell key={d} align="center" sx={{ minWidth: 60 }}>{d}</TableCell>
                ))}
                <TableCell align="center" sx={{ minWidth: 70 }}>Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trapCards.map((card, idx) => (
                <TableRow key={idx}>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>{card.cardNumber}</TableCell>
                  <TableCell>
                    <FormControl size="small" variant="standard" sx={{ minWidth: 110 }}>
                      <Select value={card.insectType || ''}
                        onChange={(e) => updateTrapRow(idx, { insectType: e.target.value })}>
                        <MenuItem value="whitefly">Whitefly</MenuItem>
                        <MenuItem value="thrips">Thrips</MenuItem>
                        <MenuItem value="tuta">Tuta</MenuItem>
                        <MenuItem value="other">Other</MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <TextField size="small" variant="standard"
                      value={card.trapLocation}
                      onChange={(e) => updateTrapRow(idx, { trapLocation: e.target.value })} />
                  </TableCell>
                  {DAY_KEYS.map((k) => (
                    <TableCell key={k} align="center" sx={{ p: 0.5 }}>
                      <TextField size="small" variant="standard" type="number"
                        value={card[k]}
                        onChange={(e) => updateTrapRow(idx, { [k]: e.target.value })}
                        inputProps={{ style: { textAlign: 'center', width: 48 } }} />
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    {trapTotals[idx] || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainerScroll>

        <Divider sx={{ my: 3 }} />

        {/* Comments */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Comments</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="scoutingreportform-overall-severity-label-5">Overall Severity</InputLabel>
              <Select labelId="scoutingreportform-overall-severity-label-5" value={severity} label="Overall Severity" onChange={(e) => setSeverity(e.target.value)}>
                <MenuItem value="">—</MenuItem>
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: '3 1 320px', minWidth: 260 }}>
            <TextField fullWidth multiline minRows={2} size="small" label="Notes / Comments"
              value={comments} onChange={(e) => setComments(e.target.value)} />
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Photos — separate camera vs library so scouts can capture in the field. */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
          Photos
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, display: 'block', mt: 0.5 }}>
            Take a photo in the field or attach existing pictures.
          </Typography>
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 1,
              alignItems: isMobile ? 'stretch' : 'center',
            }}
          >
            {(!isMobile && canUseWebcam) ? (
              <Button
                variant="outlined"
                size="small"
                startIcon={<CameraAlt />}
                disabled={uploadingPhotos || readOnly}
                onClick={handleTakePhotoClick}
              >
                Take photo
              </Button>
            ) : (
              <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={<CameraAlt />}
                disabled={uploadingPhotos || readOnly}
              >
                Take photo
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotosSelected}
                />
              </Button>
            )}
            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={<PhotoLibrary />}
              disabled={uploadingPhotos || readOnly}
            >
              Choose from library
              <input
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotosSelected}
              />
            </Button>
          </Box>
          {photoPreviews.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
              {photoPreviews.map((p, idx) => (
                <Box
                  key={p.url}
                  sx={{
                    position: 'relative',
                    width: 96, height: 96,
                    borderRadius: 1,
                    overflow: 'hidden',
                    boxShadow: 1,
                    '&:hover .rm': { opacity: 1 },
                  }}
                >
                  <img
                    src={p.url}
                    alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <IconButton
                    size="small"
                    className="rm"
                    onClick={() => removePhoto(idx)}
                    sx={{
                      position: 'absolute', top: 2, right: 2,
                      bgcolor: 'rgba(0,0,0,0.55)', color: 'white',
                      opacity: 0, transition: 'opacity .15s',
                      '&:hover': { bgcolor: 'rgba(200,0,0,0.75)' },
                    }}
                   aria-label="Delete">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>
      <CameraCaptureDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => addPhotoFiles([file])}
      />
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        {!readOnly && (
        <Button variant="contained" onClick={handleSubmit} disabled={loading}
          startIcon={<Save />}>
          {uploadingPhotos
            ? 'Uploading photos…'
            : (loading
                ? 'Saving…'
                : (isEditing ? 'Save Changes' : 'Save Report'))}
        </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// Thin horizontally-scrollable wrapper so dense tables don't break the dialog layout.
function TableContainerScroll({ children }) {
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto', maxWidth: '100%' }}>
      {children}
    </Paper>
  );
}

/** Multi-select dropdown for bays / valves (options from planting records). */
function LocationMultiSelect({ label, value, options, onChange, disabled, helperText }) {
  const mergedOptions = useMemo(() => {
    const set = new Set([...(options || []), ...(value || [])]);
    return [...set].sort((a, b) => {
      const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
      return na - nb || String(a).localeCompare(String(b));
    });
  }, [options, value]);

  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      size="small"
      options={mergedOptions}
      value={value || []}
      disabled={disabled}
      onChange={(_, v) => onChange(v)}
      renderTags={(tagValues, getTagProps) =>
        tagValues.map((option, index) => (
          <Chip size="small" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={disabled ? '' : 'Select…'}
          helperText={helperText}
        />
      )}
    />
  );
}

// Multi-value text input. Type a value and press Enter to add a chip.
function ChipInput({ label, value, onChange, placeholder }) {
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={[]}
      value={value}
      onChange={(_, v) => onChange(v.map((s) => String(s).trim()).filter(Boolean))}
      renderTags={(tagValues, getTagProps) =>
        tagValues.map((option, index) => (
          <Chip size="small" label={option} {...getTagProps({ index })} key={option + index} />
        ))
      }
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder || 'Type + Enter'} />
      )}
    />
  );
}
