import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, TextField, MenuItem, Tabs, Tab, Button, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  AddOutlined as AddIcon,
  SaveOutlined as SaveIcon,
  ContentPasteOutlined as PasteIcon,
  DeleteOutlined as DeleteIcon,
  RestoreOutlined as RestoreIcon,
  DeleteSweepOutlined as DiscardIcon,
  FileDownloadOutlined as ImportIcon,
} from '@mui/icons-material';
import { useMasterData } from '../../utils/useMasterData';
import { getCropDripperCount, getCropDripTestCount } from '../../utils/masterDataUtils';
import { growBagDripHeader, resolveDripTestCount } from '../../utils/ecphWaterDisplay';
import { createEcph, listEcphEntries } from '../../utils/backendApi';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { queueEntry } from '../../utils/offlineQueue';
import { calculateValveMetrics } from './ecphUtils';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import useAppLayout from '../../hooks/useAppLayout';
import PasteFromExcel from './PasteFromExcel';
import EcphImporter from '../../components/EcphImporter';
import { excelTableSx } from '../../components/table/ExcelTable';

const WEATHER_OPTIONS = [
  'Sunny', 'Cloudy', 'Partly Cloudy', 'Foggy', 'Raining', 'Windy', 'Overcast', 'Hazy',
];
const STATUS_OPTIONS = [
  'Normal', 'Drenching', 'No Irrigation', 'No Fertilizer', 'No Fertilizer Only Water',
  'Drip Pipe Damage', 'Irrigation Pipe Damage', 'Water',
];

function emptyRow(fieldId, fieldName) {
  return {
    _key: `${fieldId}-${Date.now()}-${Math.random()}`,
    fieldId,
    fieldName,
    valveNumber: '',
    time: '',
    ecIn: '',
    ecOut: '',
    phIn: '',
    phOut: '',
    dripVolume: '',
    drainVolume: '',
    qtyOfWater: '',
    cycle: '',
    weatherCondition: '',
    irrigationStatus: '',
  };
}

const NUM_CELL = { sx: { minWidth: 70 } };
const CELL = { sx: {} };

// Field freeze without overflow:hidden — the cell holds the name and an Add
// button, and freezeColumnsSx would clip that button.
const fieldFreezeSx = {
  '& .col-frozen-0': {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    minWidth: 140,
    backgroundColor: 'background.paper',
    boxShadow: '4px 0 6px -4px rgba(0,0,0,0.28)',
  },
  '&& .MuiTableCell-head.col-frozen-0': { zIndex: 4 },
};

// Threshold tints have to outrank excelTableSx hover, or an out-of-range EC/pH
// cell greys the moment the mouse crosses the row.
const thresholdCellSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root .cell-ecph-critical': {
    backgroundColor: 'error.light',
  },
  '&&& .MuiTableBody-root .MuiTableRow-root .cell-ecph-warning': {
    backgroundColor: 'warning.light',
  },
};

function thresholdClass(color) {
  if (color === 'error.light') return 'cell-ecph-critical';
  if (color === 'warning.light') return 'cell-ecph-warning';
  return undefined;
}

function CellInput({ value, onChange, type = 'text', width, placeholder, rowIdx, colName, ...rest }) {
  const handleKeyDown = (e) => {
    const { key, shiftKey } = e;
    let targetRow = null;
    if (key === 'ArrowDown') { e.preventDefault(); targetRow = rowIdx + 1; }
    else if (key === 'ArrowUp') { e.preventDefault(); targetRow = rowIdx - 1; }
    else if (key === 'Enter') { e.preventDefault(); targetRow = shiftKey ? rowIdx - 1 : rowIdx + 1; }
    if (targetRow !== null) {
      const next = document.querySelector(`input[data-row="${targetRow}"][data-col="${colName}"]`);
      if (next) { next.focus(); next.select(); }
    }
  };

  return (
    <TextField
      size="small"
      variant="standard"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      InputProps={{ disableUnderline: false, sx: { fontSize: '0.8125rem' } }}
      sx={{ width: width || '100%', '& .MuiInput-input': { p: '2px 0' } }}
      inputProps={{ 'data-row': rowIdx, 'data-col': colName }}
      {...rest}
    />
  );
}

function getDraftKey(siteId, farmAreaId) {
  return `ecph-draft-${siteId}-${farmAreaId}`;
}

export default function SpreadsheetEcphEntry({ onEntrySaved, readOnly = false }) {
  const { data: masterData } = useMasterData();
  const notify = useNotification();
  const { activeSiteId: defaultSiteId } = useActiveSite();
  const { isMobile, scrollRegionHeight } = useAppLayout();
  const [showMore, setShowMore] = useState(false);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [thresholds, setThresholds] = useState([]);
  const [draftBanner, setDraftBanner] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState(null);
  const draftTimerRef = useRef(null);
  const skipDraftSave = useRef(false);

  useEffect(() => {
    apiRequest('/agronomic/thresholds')
      .then((res) => setThresholds(res.data || res || []))
      .catch(() => {});
  }, []);

  const allSites = useMemo(() => {
    const sites = [];
    masterData.countries?.forEach((c) => c.sites?.forEach((s) => sites.push({ ...s, countryId: c.id })));
    return sites;
  }, [masterData]);

  const handleSiteSelectedRef = useRef(null);
  const prevActiveSiteRef = useRef('');

  const farmAreasForSite = useMemo(() => {
    const areas = [];
    masterData.countries?.forEach((c) => c.sites?.forEach((s) => {
      if (s.id === selectedSite) {
        s.farmAreas?.forEach((fa) => areas.push({ ...fa, siteId: s.id }));
      }
    }));
    return areas;
  }, [masterData, selectedSite]);

  const currentFarmArea = farmAreasForSite[selectedTab] || null;

  const allFieldsForSite = useMemo(() => {
    const all = [];
    farmAreasForSite.forEach(fa => {
      (fa.fields || []).forEach(f => all.push({ ...f, farmAreaId: fa.id }));
    });
    return all;
  }, [farmAreasForSite]);

  const fieldsForTab = useMemo(() => {
    if (!currentFarmArea) return [];
    return (currentFarmArea.fields || []).map((f) => ({
      ...f,
      farmAreaId: currentFarmArea.id,
    }));
  }, [currentFarmArea]);

  const isFarmPlotTab = useMemo(() => {
    const areaName = (currentFarmArea?.name || '').toLowerCase();
    if (/farm\s*plot|pivot|open\s*field/.test(areaName)) return true;
    if (fieldsForTab.length === 0) return false;
    const plotFields = fieldsForTab.filter((f) => {
      const t = (f.type || '').toLowerCase();
      return /farm\s*plot|pivot|open\s*field/.test(t);
    });
    return plotFields.length > 0 && plotFields.length >= fieldsForTab.length * 0.5;
  }, [currentFarmArea, fieldsForTab]);

  const growBagColHeader = useMemo(() => {
    const counts = fieldsForTab.map((field) => resolveDripTestCount(
      {},
      { currentCrop: field.currentCrop, crop: field.crop, cropHistory: field.cropHistory },
      masterData,
    ));
    return growBagDripHeader(counts);
  }, [fieldsForTab, masterData]);

  const getFieldInfo = useCallback((fieldId) => {
    const field = fieldsForTab.find((f) => f.id === fieldId);
    if (!field) return { dripperCount: null, dripTestCount: null, crop: null };
    const cropName = field.currentCrop;
    return {
      crop: cropName,
      dripperCount: cropName ? getCropDripperCount(masterData, cropName) : null,
      dripTestCount: cropName ? getCropDripTestCount(masterData, cropName) : null,
    };
  }, [fieldsForTab, masterData]);

  const getThreshold = useCallback((cropName, param) => {
    if (!cropName || !thresholds.length) return null;
    const crop = masterData.crops?.find((c) => (typeof c === 'object' ? c.name : c) === cropName);
    if (!crop) return null;
    const cropId = typeof crop === 'object' ? crop.id : null;
    return thresholds.filter((t) =>
      t.parameter === param && t.enabled !== false && (t.crop_id === cropId || t.cropId === cropId)
    );
  }, [thresholds, masterData]);

  const getCellColor = useCallback((fieldId, param, value) => {
    if (!value && value !== 0) return undefined;
    const num = parseFloat(value);
    if (isNaN(num)) return undefined;
    const { crop } = getFieldInfo(fieldId);
    const matches = getThreshold(crop, param);
    if (!matches || matches.length === 0) return undefined;
    for (const th of matches) {
      const severity = th.severity || 'warning';
      const min = th.min_value ?? th.minValue;
      const max = th.max_value ?? th.maxValue;
      if (min !== null && min !== undefined && num < min) {
        return severity === 'critical' ? 'error.light' : 'warning.light';
      }
      if (max !== null && max !== undefined && num > max) {
        return severity === 'critical' ? 'error.light' : 'warning.light';
      }
    }
    return undefined;
  }, [getFieldInfo, getThreshold]);

  const initRowsForFarmArea = useCallback((fa) => {
    if (!fa || !fa.fields) return;
    const newRows = fa.fields.map((f) => emptyRow(f.id, f.name));
    setRows(newRows);
    setSaveResult(null);
  }, []);

  // --- Draft auto-save ---
  useEffect(() => {
    if (!selectedSite || !currentFarmArea || rows.length === 0 || skipDraftSave.current) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const hasData = rows.some((r) => r.valveNumber || r.dripVolume || r.ecIn || r.ecOut);
      if (hasData) {
        try {
          localStorage.setItem(getDraftKey(selectedSite, currentFarmArea.id), JSON.stringify({ date: selectedDate, rows }));
        } catch { /* quota exceeded */ }
      }
    }, 2000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [rows, selectedSite, currentFarmArea, selectedDate]);

  const clearDraft = useCallback(() => {
    if (selectedSite && currentFarmArea) {
      localStorage.removeItem(getDraftKey(selectedSite, currentFarmArea.id));
    }
  }, [selectedSite, currentFarmArea]);

  const checkForDraft = useCallback((siteId, fa) => {
    if (!fa) return;
    const key = getDraftKey(siteId, fa.id);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.rows?.length > 0 && draft.rows.some((r) => r.valveNumber || r.dripVolume)) {
          setDraftBanner(draft);
          return;
        }
      } catch { /* corrupt draft */ }
    }
    setDraftBanner(false);
  }, []);

  const restoreDraft = () => {
    if (!draftBanner) return;
    skipDraftSave.current = true;
    if (draftBanner.date) setSelectedDate(draftBanner.date);
    setRows(draftBanner.rows);
    setDraftBanner(false);
    setTimeout(() => { skipDraftSave.current = false; }, 100);
  };

  const discardDraft = () => {
    clearDraft();
    setDraftBanner(false);
  };

  const handleSiteChange = (siteId) => {
    setSelectedSite(siteId);
    setSelectedTab(0);
    setRows([]);
    setSaveResult(null);
    setDraftBanner(false);
  };

  const handleTabChange = (_, idx) => {
    setSelectedTab(idx);
    const fa = farmAreasForSite[idx];
    if (fa) {
      checkForDraft(selectedSite, fa);
      initRowsForFarmArea(fa);
    }
  };

  const handleSiteSelected = (siteId) => {
    handleSiteChange(siteId);
    const areas = [];
    masterData.countries?.forEach((c) => c.sites?.forEach((s) => {
      if (s.id === siteId) s.farmAreas?.forEach((fa) => areas.push(fa));
    }));
    if (areas.length > 0) {
      checkForDraft(siteId, areas[0]);
      setTimeout(() => initRowsForFarmArea(areas[0]), 0);
    }
  };
  handleSiteSelectedRef.current = handleSiteSelected;

  useEffect(() => {
    if (defaultSiteId && allSites.length > 0 && defaultSiteId !== prevActiveSiteRef.current) {
      prevActiveSiteRef.current = defaultSiteId;
      handleSiteSelectedRef.current?.(defaultSiteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSiteId, allSites.length]);

  const updateRow = (idx, key, value) => {
    if (readOnly) return;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  const addValveRow = (fieldId, fieldName) => {
    setRows((prev) => {
      const lastIdx = prev.findLastIndex((r) => r.fieldId === fieldId);
      const newRow = emptyRow(fieldId, fieldName);
      const next = [...prev];
      next.splice(lastIdx + 1, 0, newRow);
      return next;
    });
  };

  const removeRow = (idx) => {
    setRows((prev) => {
      const row = prev[idx];
      const fieldRows = prev.filter((r) => r.fieldId === row.fieldId);
      if (fieldRows.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const isFirstOfField = (idx) => {
    if (idx === 0) return true;
    return rows[idx].fieldId !== rows[idx - 1].fieldId;
  };

  const fieldRowSpan = (idx) => {
    const fieldId = rows[idx].fieldId;
    let count = 0;
    for (let i = idx; i < rows.length && rows[i].fieldId === fieldId; i++) count++;
    return count;
  };

  const getCalcValues = (row) => {
    const { dripperCount, dripTestCount } = getFieldInfo(row.fieldId);
    const drip = parseFloat(row.dripVolume) || 0;
    const drain = parseFloat(row.drainVolume) || 0;
    const metrics = calculateValveMetrics(drip, drain, dripTestCount, dripperCount);
    const qty = parseFloat(row.qtyOfWater) || 0;
    const cyc = parseFloat(row.cycle) || 0;
    const totalWaterQty = qty > 0 && cyc > 0 ? (qty * cyc).toFixed(3) : '';
    return {
      dripVolumeN: metrics.dripVolumeN,
      percentDrain: metrics.percentDrain,
      totalWaterBasedOnDrip: metrics.totalWaterBasedOnDrip,
      totalWaterQty,
    };
  };

  const buildPayloadsFromGroups = (groups) => {
    return [...groups.values()].map((group) => {
      const first = group.rows[0];
      const { dripperCount, dripTestCount } = getFieldInfo(group.fieldId);

      const valveReadings = group.rows.map((r) => {
        const drip = parseFloat(r.dripVolume) || 0;
        const drain = parseFloat(r.drainVolume) || 0;
        const metrics = calculateValveMetrics(drip, drain, dripTestCount, dripperCount);
        const qty = parseFloat(r.qtyOfWater) || 0;
        const cyc = parseFloat(r.cycle) || 0;
        const twq = qty > 0 && cyc > 0 ? qty * cyc : 0;
        return {
          valveNumber: Number(r.valveNumber),
          dripVolume: drip || undefined,
          drain: drain || undefined,
          ecIn: r.ecIn ? parseFloat(r.ecIn) : undefined,
          ec: r.ecOut ? parseFloat(r.ecOut) : undefined,
          phIn: r.phIn ? parseFloat(r.phIn) : undefined,
          ph: r.phOut ? parseFloat(r.phOut) : undefined,
          percentDrain: metrics.percentDrain ? parseFloat(metrics.percentDrain) : undefined,
          totalWaterBasedOnDrip: metrics.totalWaterBasedOnDrip ? parseFloat(metrics.totalWaterBasedOnDrip) : undefined,
          ...(qty > 0 ? { qtyOfWater: qty } : {}),
          ...(cyc > 0 ? { cycle: Math.round(cyc) } : {}),
          ...(twq > 0 ? { totalWaterQty: Number(twq.toFixed(3)) } : {}),
        };
      });

      const dripVals = valveReadings.map((v) => v.totalWaterBasedOnDrip).filter(Boolean);
      const fieldTotalWaterBasedOnDrip = dripVals.length > 0
        ? Number((dripVals.reduce((a, b) => a + b, 0) / dripVals.length).toFixed(3))
        : undefined;
      const twqVals = valveReadings.map((v) => v.totalWaterQty).filter(Boolean);
      const avgTotalWaterQty = twqVals.length > 0
        ? Number((twqVals.reduce((a, b) => a + b, 0) / twqVals.length).toFixed(3))
        : undefined;

      return {
        fieldId: group.fieldId,
        fieldName: first.fieldName,
        date: selectedDate,
        time: group.time || undefined,
        ...(first.weatherCondition ? { weatherCondition: first.weatherCondition } : {}),
        ...(first.irrigationStatus ? { irrigationStatus: first.irrigationStatus } : {}),
        ...(avgTotalWaterQty ? { totalWaterQty: avgTotalWaterQty } : {}),
        ...(fieldTotalWaterBasedOnDrip ? { fieldTotalWaterBasedOnDrip } : {}),
        ...(dripperCount ? { dripperCount: Math.round(dripperCount) } : {}),
        ...(dripTestCount && dripTestCount > 0 ? { dripTestCount: Math.round(dripTestCount) } : {}),
        valveReadings,
      };
    });
  };

  const executeSave = async (payloads) => {
    setSaving(true);
    setSaveResult(null);
    const results = { success: 0, failed: 0, queued: 0, errors: [] };

    await Promise.allSettled(payloads.map(async (payload) => {
      try {
        await createEcph(payload);
        results.success += 1;
      } catch (err) {
        if (!navigator.onLine) {
          try {
            await queueEntry({ type: 'ecph', data: payload });
            results.queued += 1;
          } catch { results.failed += 1; results.errors.push(`${payload.fieldName}: Queue failed`); }
        } else {
          results.failed += 1;
          results.errors.push(`${payload.fieldName}: ${err.message || 'Failed'}`);
        }
      }
    }));

    setSaving(false);
    setSaveResult(results);

    if (results.success > 0) {
      notify.success(`Saved ${results.success} entry(ies)!`);
      clearDraft();
      if (onEntrySaved) onEntrySaved();
      if (currentFarmArea) initRowsForFarmArea(currentFarmArea);
    }
    if (results.queued > 0) {
      notify.warning(`${results.queued} entry(ies) queued offline.`);
    }
    if (results.failed > 0) {
      notify.error(`${results.failed} entry(ies) failed.`);
    }
  };

  const handleSaveAll = async () => {
    const filledRows = rows.filter((r) => r.valveNumber && r.dripVolume);
    if (filledRows.length === 0) {
      notify.error('No rows to save. Fill in at least valve number and drip volume.');
      return;
    }

    const groups = new Map();
    for (const row of filledRows) {
      const key = `${row.fieldId}|${row.time || ''}`;
      if (!groups.has(key)) groups.set(key, { fieldId: row.fieldId, time: row.time, rows: [] });
      groups.get(key).rows.push(row);
    }

    const payloads = buildPayloadsFromGroups(groups);

    // Duplicate check
    try {
      const fieldIds = [...new Set(filledRows.map((r) => r.fieldId))];
      const existingEntries = await listEcphEntries({ date: selectedDate, limit: 500, site_id: defaultSiteId });
      const existingFieldIds = new Set((existingEntries || []).map((e) => e.fieldId));
      const duplicates = fieldIds.filter((fid) => existingFieldIds.has(fid));

      if (duplicates.length > 0) {
        const dupNames = duplicates.map((fid) => {
          const f = fieldsForTab.find((ff) => ff.id === fid);
          return f?.name || fid;
        });
        setDuplicateDialog({ dupNames, payloads });
        return;
      }
    } catch {
      // If check fails (e.g. offline), proceed without warning
    }

    await executeSave(payloads);
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateDialog) return;
    const { payloads } = duplicateDialog;
    setDuplicateDialog(null);
    await executeSave(payloads);
  };

  const handlePasteData = (pastedRows) => {
    if (!pastedRows.length) return;
    const fieldMap = new Map(fieldsForTab.map((f) => [f.name.toLowerCase().replace(/[\s-]+/g, ''), f]));

    const newRows = pastedRows.map((pr) => {
      const raw = (pr.field_name || pr.fieldName || pr['NH LOCATION'] || '').trim();
      const norm = raw.toLowerCase().replace(/[\s-]+/g, '');
      const field = fieldMap.get(norm)
        || fieldMap.get(raw.toLowerCase().replace(/\s+/g, '-'))
        || fieldsForTab.find((f) => f.name.toLowerCase() === raw.toLowerCase());
      return {
        _key: `paste-${Date.now()}-${Math.random()}`,
        fieldId: field?.id || '',
        fieldName: field?.name || raw,
        valveNumber: pr.valve || pr.valveNumber || pr.Valve || '',
        time: pr.time || pr.Time || pr.TIME || '',
        ecIn: pr.ecIn || pr.ec_in || pr['EC in'] || pr['EC In'] || '',
        ecOut: pr.ecOut || pr.ec_out || pr['EC out'] || pr['EC Out'] || '',
        phIn: pr.phIn || pr.ph_in || pr['pH in'] || pr['pH In'] || '',
        phOut: pr.phOut || pr.ph_out || pr['pH out'] || pr['pH Out'] || '',
        dripVolume: pr.dripVolume || pr.drip_volume || pr['Drip Volume'] || '',
        drainVolume: pr.drainVolume || pr.drain_volume || pr['Drain Volume'] || '',
        qtyOfWater: pr.qtyOfWater || pr.qty_of_water || pr['Qty Of Water (M3)'] || '',
        cycle: pr.cycle || pr.Cycle || '',
        weatherCondition: pr.weatherCondition || pr.weather_condition || '',
        irrigationStatus: pr.irrigationStatus || pr.irrigation_status || '',
      };
    }).filter((r) => r.fieldId);

    if (newRows.length > 0) {
      setRows(newRows);
      notify.success(`Pasted ${newRows.length} row(s)`);
    } else {
      notify.error('No rows matched fields in this farm area. Check field names.');
    }
  };

  const showExtended = !isMobile || showMore;

  return (
    <Box>
      {/* Site + Date selectors */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small" select label="Site" sx={{ minWidth: 200 }}
          value={selectedSite}
          onChange={(e) => handleSiteSelected(e.target.value)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">Select Site</MenuItem>
          {allSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <TextField
          size="small" type="date" label="Date" sx={{ minWidth: 160 }}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      {/* Draft recovery banner */}
      {draftBanner && (
        <Alert severity="info" sx={{ mb: 2 }}
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" color="inherit" startIcon={<RestoreIcon />} onClick={restoreDraft}>Restore</Button>
              <Button size="small" color="inherit" startIcon={<DiscardIcon />} onClick={discardDraft}>Discard</Button>
            </Box>
          }
        >
          Unsaved draft found from a previous session.
        </Alert>
      )}

      {/* Farm Area Tabs */}
      {selectedSite && farmAreasForSite.length > 0 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={selectedTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
            {farmAreasForSite.map((fa) => (
              <Tab key={fa.id} label={fa.name} />
            ))}
          </Tabs>
        </Box>
      )}

      {selectedSite && farmAreasForSite.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>No farm areas found for this site.</Alert>
      )}

      {/* Spreadsheet Grid */}
      {currentFarmArea && rows.length > 0 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {currentFarmArea.name} — {fieldsForTab.length} field(s), {rows.length} row(s)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {isMobile && (
                <Button size="small" variant="text" onClick={() => setShowMore(!showMore)}>
                  {showMore ? 'Less columns' : 'More columns'}
                </Button>
              )}
              {!readOnly && (
                <>
                  <Button size="small" variant="outlined" startIcon={<ImportIcon />} onClick={() => setImportOpen(true)}>
                    Import from Excel
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<PasteIcon />} onClick={() => setPasteOpen(true)}>
                    Paste from Excel
                  </Button>
                  <Button
                    size="small" variant="contained" color="primary"
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                    onClick={handleSaveAll}
                    disabled={saving}
                  >
                    Save All
                  </Button>
                </>
              )}
            </Box>
          </Box>

          {saveResult && (
            <Alert severity={saveResult.failed > 0 ? 'warning' : 'success'} sx={{ mb: 1 }} onClose={() => setSaveResult(null)}>
              Saved: {saveResult.success}{saveResult.queued > 0 ? `, Queued offline: ${saveResult.queued}` : ''}, Failed: {saveResult.failed}
              {saveResult.errors.length > 0 && (
                <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                  {saveResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </Box>
              )}
            </Alert>
          )}

          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: scrollRegionHeight(isMobile ? 340 : 380), overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size="small" stickyHeader sx={[excelTableSx, fieldFreezeSx, thresholdCellSx]}>
              <TableHead>
                <TableRow>
                  <TableCell className="col-frozen-0">Field</TableCell>
                  <TableCell>Valve</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell className="col-numeric">EC In</TableCell>
                  {!isFarmPlotTab && <TableCell className="col-numeric">EC Out</TableCell>}
                  <TableCell className="col-numeric">pH In</TableCell>
                  {!isFarmPlotTab && <TableCell className="col-numeric">pH Out</TableCell>}
                  <TableCell className="col-numeric">Drip Vol</TableCell>
                  {!isFarmPlotTab && <TableCell className="col-numeric">Drain Vol</TableCell>}
                  {!isFarmPlotTab && <TableCell className="col-numeric">{growBagColHeader}</TableCell>}
                  {!isFarmPlotTab && <TableCell className="col-numeric">% Drain</TableCell>}
                  <TableCell className="col-numeric">Water/Drip (M3)</TableCell>
                  <TableCell className="col-numeric">Qty Water (M3)</TableCell>
                  <TableCell>Cycle</TableCell>
                  <TableCell className="col-numeric">Total Water</TableCell>
                  {showExtended && <TableCell>Weather</TableCell>}
                  {showExtended && <TableCell>Status</TableCell>}
                  <TableCell sx={{ width: 60 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, idx) => {
                  const first = isFirstOfField(idx);
                  const span = first ? fieldRowSpan(idx) : 0;
                  const calc = getCalcValues(row);
                  return (
                    <TableRow key={row._key} sx={{ bgcolor: first ? 'background.paper' : 'action.hover' }}>
                      {first && (
                        <TableCell rowSpan={span} className="col-frozen-0" {...CELL} sx={{ ...CELL.sx, fontWeight: 600, verticalAlign: 'top' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {row.fieldName}
                            <Tooltip title="Add valve row">
                              <span>
                                <IconButton size="small" onClick={() => addValveRow(row.fieldId, row.fieldName)} sx={{ ml: 'auto' }} disabled={readOnly}>
                                  <AddIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      )}
                      <TableCell {...NUM_CELL}>
                        <CellInput value={row.valveNumber} onChange={(v) => updateRow(idx, 'valveNumber', v)} type="number" placeholder="#" width={50} rowIdx={idx} colName="valveNumber" />
                      </TableCell>
                      {first ? (
                        <TableCell rowSpan={span} {...CELL} sx={{ ...CELL.sx, verticalAlign: 'top' }}>
                          <CellInput value={row.time} onChange={(v) => updateRow(idx, 'time', v)} placeholder="3:00 PM" width={90} rowIdx={idx} colName="time" />
                        </TableCell>
                      ) : null}
                      <TableCell {...NUM_CELL} className={thresholdClass(getCellColor(row.fieldId, 'ec', row.ecIn))}>
                        <CellInput value={row.ecIn} onChange={(v) => updateRow(idx, 'ecIn', v)} type="number" placeholder="0.00" width={60} rowIdx={idx} colName="ecIn" />
                      </TableCell>
                      {!isFarmPlotTab && (
                        <TableCell {...NUM_CELL} className={thresholdClass(getCellColor(row.fieldId, 'ec', row.ecOut))}>
                          <CellInput value={row.ecOut} onChange={(v) => updateRow(idx, 'ecOut', v)} type="number" placeholder="0.00" width={60} rowIdx={idx} colName="ecOut" />
                        </TableCell>
                      )}
                      <TableCell {...NUM_CELL} className={thresholdClass(getCellColor(row.fieldId, 'ph', row.phIn))}>
                        <CellInput value={row.phIn} onChange={(v) => updateRow(idx, 'phIn', v)} type="number" placeholder="0.00" width={60} rowIdx={idx} colName="phIn" />
                      </TableCell>
                      {!isFarmPlotTab && (
                        <TableCell {...NUM_CELL} className={thresholdClass(getCellColor(row.fieldId, 'ph', row.phOut))}>
                          <CellInput value={row.phOut} onChange={(v) => updateRow(idx, 'phOut', v)} type="number" placeholder="0.00" width={60} rowIdx={idx} colName="phOut" />
                        </TableCell>
                      )}
                      <TableCell {...NUM_CELL}>
                        <CellInput value={row.dripVolume} onChange={(v) => updateRow(idx, 'dripVolume', v)} type="number" placeholder="0" width={70} rowIdx={idx} colName="dripVolume" />
                      </TableCell>
                      {!isFarmPlotTab && (
                        <TableCell {...NUM_CELL}>
                          <CellInput value={row.drainVolume} onChange={(v) => updateRow(idx, 'drainVolume', v)} type="number" placeholder="0" width={70} rowIdx={idx} colName="drainVolume" />
                        </TableCell>
                      )}
                      {!isFarmPlotTab && (
                        <TableCell {...CELL}>
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            {calc.dripVolumeN || '-'}
                          </Typography>
                        </TableCell>
                      )}
                      {!isFarmPlotTab && (
                        <TableCell {...CELL}>
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            {calc.percentDrain || '-'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell {...CELL}>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                          {calc.totalWaterBasedOnDrip !== null && calc.totalWaterBasedOnDrip !== undefined ? calc.totalWaterBasedOnDrip : '-'}
                        </Typography>
                      </TableCell>
                      {first ? (
                        <TableCell rowSpan={span} {...CELL} sx={{ ...CELL.sx, verticalAlign: 'top' }}>
                          <CellInput value={row.qtyOfWater} onChange={(v) => updateRow(idx, 'qtyOfWater', v)} type="number" placeholder="0.0" width={70} rowIdx={idx} colName="qtyOfWater" />
                        </TableCell>
                      ) : null}
                      {first ? (
                        <TableCell rowSpan={span} {...CELL} sx={{ ...CELL.sx, verticalAlign: 'top' }}>
                          <CellInput value={row.cycle} onChange={(v) => updateRow(idx, 'cycle', v)} type="number" placeholder="0" width={50} rowIdx={idx} colName="cycle" />
                        </TableCell>
                      ) : null}
                      {first ? (
                        <TableCell rowSpan={span} {...CELL} sx={{ ...CELL.sx, verticalAlign: 'top' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            {calc.totalWaterQty || '-'}
                          </Typography>
                        </TableCell>
                      ) : null}
                      {showExtended && first ? (
                        <TableCell rowSpan={span} {...CELL} sx={{ ...CELL.sx, verticalAlign: 'top' }}>
                          <TextField size="small" select variant="standard" value={row.weatherCondition}
                            onChange={(e) => updateRow(idx, 'weatherCondition', e.target.value)}
                            sx={{ width: 90, '& .MuiInput-input': { fontSize: '0.75rem' } }}
                            SelectProps={{ displayEmpty: true }}
                          >
                            <MenuItem value="" sx={{ fontSize: '0.75rem' }}><em>-</em></MenuItem>
                            {WEATHER_OPTIONS.map((w) => <MenuItem key={w} value={w} sx={{ fontSize: '0.75rem' }}>{w}</MenuItem>)}
                          </TextField>
                        </TableCell>
                      ) : showExtended ? null : null}
                      {showExtended && first ? (
                        <TableCell rowSpan={span} {...CELL} sx={{ ...CELL.sx, verticalAlign: 'top' }}>
                          <TextField size="small" select variant="standard" value={row.irrigationStatus}
                            onChange={(e) => updateRow(idx, 'irrigationStatus', e.target.value)}
                            sx={{ width: 100, '& .MuiInput-input': { fontSize: '0.75rem' } }}
                            SelectProps={{ displayEmpty: true }}
                          >
                            <MenuItem value="" sx={{ fontSize: '0.75rem' }}><em>-</em></MenuItem>
                            {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s} sx={{ fontSize: '0.75rem' }}>{s}</MenuItem>)}
                          </TextField>
                        </TableCell>
                      ) : null}
                      <TableCell {...CELL}>
                        {!first && (
                          <Tooltip title="Remove valve row">
                            <IconButton size="small" onClick={() => removeRow(idx)} sx={{ color: 'error.main' }}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {currentFarmArea && rows.length === 0 && (
        <Alert severity="info">
          No fields in this farm area. Add fields first.
        </Alert>
      )}

      <PasteFromExcel open={pasteOpen} onClose={() => setPasteOpen(false)} onPaste={handlePasteData} />

      <EcphImporter
        open={importOpen}
        onClose={() => setImportOpen(false)}
        fields={allFieldsForSite}
        onImportComplete={() => { if (onEntrySaved) onEntrySaved(); }}
      />

      {/* Duplicate entry warning dialog */}
      <Dialog open={!!duplicateDialog} onClose={() => setDuplicateDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Duplicate Entries Found</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following fields already have entries for <strong>{selectedDate}</strong>:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {duplicateDialog?.dupNames?.map((n, i) => <li key={i}><strong>{n}</strong></li>)}
          </Box>
          <Typography variant="body2" sx={{ mt: 1 }}>Save anyway? This will create additional entries.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateDialog(null)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleDuplicateConfirm}>Save Anyway</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
