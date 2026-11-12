import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, TextField, MenuItem, Tabs, Tab, Button, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Autocomplete,
} from '@mui/material';
import {
  SaveOutlined as SaveIcon,
  ContentPasteOutlined as PasteIcon,
  RestoreOutlined as RestoreIcon,
  DeleteSweepOutlined as DiscardIcon,
  FileUploadOutlined as ImportIcon,
} from '@mui/icons-material';
import { useMasterData } from '../../utils/useMasterData';
import { createFertigation, listFertigationEntries, listRecipesAll, listFertigationGroups } from '../../utils/backendApi';
import { useNotification } from '../../contexts/NotificationContext';
import { queueEntry } from '../../utils/offlineQueue';
import { useActiveSite } from '../../contexts/ActiveSiteContext';
import useAppLayout from '../../hooks/useAppLayout';
import PasteFromExcelFert from './PasteFromExcelFert';
import FertigationImporter from '../../components/FertigationImporter';
import FertigationGroupManager from '../../components/fertigation/FertigationGroupManager';
import { apiRequest } from '../../utils/api';
import { excelTableSx } from '../../components/table/ExcelTable';
import { isRecipeApproved, recipeOptionLabel, recipePickerOptions } from '../../utils/recipeApproval';
import InfoNote from '../../components/InfoNote';

const CELL = { sx: {} };
const NUM_CELL = { sx: { minWidth: 70 } };

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

const totalRowSx = {
  '&&& .MuiTableBody-root .MuiTableRow-root.row-total .MuiTableCell-root': {
    backgroundColor: 'table.totalBg',
    color: 'table.totalText',
    fontWeight: 700,
  },
};

const getWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

function CellInput({ value, onChange, type = 'text', width, placeholder, rowIdx, colName, disabled, ...rest }) {
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
      disabled={disabled}
      InputProps={{ disableUnderline: false, sx: { fontSize: '0.8125rem' } }}
      sx={{ width: width || '100%', '& .MuiInput-input': { p: '2px 0' } }}
      inputProps={{ 'data-row': rowIdx, 'data-col': colName }}
      {...rest}
    />
  );
}

function getDraftKey(siteId, farmAreaId) {
  return `fert-draft-${siteId}-${farmAreaId}`;
}

function getOperatorDefaultKey(siteId) {
  return `fert-operator-default-${siteId}`;
}

function readOperatorDefault(siteId) {
  if (!siteId) return null;
  try {
    const raw = localStorage.getItem(getOperatorDefaultKey(siteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.workerId) return parsed;
  } catch { /* ignore */ }
  return null;
}

function writeOperatorDefault(siteId, worker) {
  if (!siteId) return;
  if (!worker?.id) {
    localStorage.removeItem(getOperatorDefaultKey(siteId));
    return;
  }
  localStorage.setItem(getOperatorDefaultKey(siteId), JSON.stringify({
    workerId: worker.id,
    workerName: worker.name,
  }));
}

function emptyRow(fieldId, fieldName, valves, operatorDefault) {
  return {
    _key: `${fieldId}-${Date.now()}-${Math.random()}`,
    fieldId,
    fieldName,
    workerId: operatorDefault?.workerId || '',
    workerName: operatorDefault?.workerName || '',
    valves: valves || '4',
    flowRate: '',
    waterQty: '',
    frequency: '1',
    dailyTotal: '',
    recipeId: '',
  };
}

const EMPTY_GROUP_DEFAULTS = {
  recipeId: '',
  flowRate: '',
  waterQty: '',
  frequency: '1',
  valves: '4',
};

function rowHasOverride(row, defaults, groupActive) {
  if (!groupActive) return false;
  const keys = ['recipeId', 'flowRate', 'waterQty', 'frequency', 'valves'];
  return keys.some((key) => String(row[key] ?? '') !== String(defaults[key] ?? ''));
}

export default function SpreadsheetFertigationEntry({ onEntrySaved, readOnly = false }) {
  const { data: masterData } = useMasterData();
  const notify = useNotification();
  const { activeSiteId: defaultSiteId } = useActiveSite();
  const { isMobile, scrollRegionHeight } = useAppLayout();

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [draftBanner, setDraftBanner] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupDefaults, setGroupDefaults] = useState(EMPTY_GROUP_DEFAULTS);
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);
  const [workers, setWorkers] = useState([]);
  const defaultOperatorRef = useRef(null);
  const draftTimerRef = useRef(null);
  const skipDraftSave = useRef(false);
  const handleSiteSelectedRef = useRef(null);
  const prevActiveSiteRef = useRef('');

  useEffect(() => {
    listRecipesAll().then((items) => setRecipes(items || [])).catch(() => setRecipes([]));
  }, []);

  const loadGroups = useCallback(async (siteId) => {
    if (!siteId) {
      setGroups([]);
      return;
    }
    try {
      const items = await listFertigationGroups(siteId);
      setGroups(items || []);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    loadGroups(selectedSite);
  }, [selectedSite, loadGroups]);

  useEffect(() => {
    if (!selectedSite) {
      setWorkers([]);
      defaultOperatorRef.current = null;
      return;
    }
    defaultOperatorRef.current = readOperatorDefault(selectedSite);
    (async () => {
      try {
        const params = new URLSearchParams({ site_id: selectedSite, active_only: 'true' });
        const data = await apiRequest(`/manpower/workers?${params.toString()}`);
        setWorkers(data || []);
      } catch {
        setWorkers([]);
      }
    })();
  }, [selectedSite]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const groupMode = Boolean(selectedGroupId && selectedGroup);

  const recipesById = useMemo(() => {
    const map = {};
    recipes.forEach((r) => { map[r.id] = r; });
    return map;
  }, [recipes]);

  const allSites = useMemo(() => {
    const sites = [];
    masterData.countries?.forEach((c) => c.sites?.forEach((s) => sites.push({ ...s, countryId: c.id })));
    return sites;
  }, [masterData]);

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

  const fieldsForTab = useMemo(() => {
    if (!currentFarmArea) return [];
    return (currentFarmArea.fields || []).map((f) => ({
      ...f,
      farmAreaId: currentFarmArea.id,
    }));
  }, [currentFarmArea]);

  const allFieldsForSite = useMemo(() => {
    const all = [];
    farmAreasForSite.forEach(fa => {
      (fa.fields || []).forEach(f => all.push({ ...f, farmAreaId: fa.id }));
    });
    return all;
  }, [farmAreasForSite]);

  const fertilizerNames = useMemo(() => {
    const nameSet = new Set();
    rows.forEach((r) => {
      const recipe = recipesById[r.recipeId];
      if (recipe && Array.isArray(recipe.fertilizers)) {
        recipe.fertilizers.forEach((f) => nameSet.add(f.name));
      }
    });
    return [...nameSet];
  }, [rows, recipesById]);

  const calcDailyTotal = useCallback((row) => {
    const wq = parseFloat(row.waterQty) || 0;
    const freq = parseFloat(row.frequency) || 0;
    const valves = parseFloat(row.valves) || 0;
    return wq * freq * valves;
  }, []);

  const calcFertilizers = useCallback((dailyTotal, recipeId) => {
    const recipe = recipesById[recipeId];
    if (!recipe || !Array.isArray(recipe.fertilizers) || dailyTotal <= 0) return {};
    const result = {};
    recipe.fertilizers.forEach((f) => {
      const kgPerLiter = Number(f.kgPerLiter) || 0;
      result[f.name] = Number((kgPerLiter * dailyTotal).toFixed(3));
    });
    return result;
  }, [recipesById]);

  const initRowsForFields = useCallback((fields) => {
    const op = defaultOperatorRef.current;
    const newRows = fields.map((f) => emptyRow(f.id, f.name, f.valves || '4', op));
    setRows(newRows);
    setSaveResult(null);
  }, []);

  const initRowsForFarmArea = useCallback((fa) => {
    if (!fa || !fa.fields) return;
    initRowsForFields(fa.fields);
  }, [initRowsForFields]);

  const initRowsForGroup = useCallback((group) => {
    const fieldIdSet = new Set(group.fieldIds || []);
    const fields = allFieldsForSite.filter((f) => fieldIdSet.has(f.id));
    initRowsForFields(fields);
    setGroupDefaults({
      ...EMPTY_GROUP_DEFAULTS,
      recipeId: group.defaultRecipeId || '',
    });
  }, [allFieldsForSite, initRowsForFields]);

  // --- Draft auto-save ---
  useEffect(() => {
    if (!selectedSite || !currentFarmArea || rows.length === 0 || skipDraftSave.current) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const hasData = rows.some((r) => r.waterQty || r.flowRate);
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
        if (draft.rows?.length > 0 && draft.rows.some((r) => r.waterQty || r.flowRate)) {
          setDraftBanner(draft);
          return;
        }
      } catch { /* corrupt */ }
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
    setSelectedGroupId('');
    setGroupDefaults(EMPTY_GROUP_DEFAULTS);
    setRows([]);
    setSaveResult(null);
    setDraftBanner(false);
  };

  const handleGroupChange = (groupId) => {
    setSelectedGroupId(groupId);
    if (!groupId) {
      setGroupDefaults(EMPTY_GROUP_DEFAULTS);
      const fa = farmAreasForSite[selectedTab];
      if (fa) {
        checkForDraft(selectedSite, fa);
        initRowsForFarmArea(fa);
      }
      return;
    }
    const group = groups.find((g) => g.id === groupId);
    if (group) initRowsForGroup(group);
  };

  const applyGroupDefaults = () => {
    if (readOnly || !groupMode) return;
    setRows((prev) => prev.map((row) => ({
      ...row,
      recipeId: groupDefaults.recipeId,
      flowRate: groupDefaults.flowRate,
      waterQty: groupDefaults.waterQty,
      frequency: groupDefaults.frequency,
      valves: groupDefaults.valves,
    })));
    notify.success('Applied group defaults to all fields');
  };

  const handleTabChange = (_, idx) => {
    setSelectedTab(idx);
    if (selectedGroupId) return;
    const fa = farmAreasForSite[idx];
    if (fa) {
      checkForDraft(selectedSite, fa);
      initRowsForFarmArea(fa);
    }
  };

  const handleSiteSelected = (siteId) => {
    defaultOperatorRef.current = readOperatorDefault(siteId);
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

  const handleOperatorChange = (idx, worker) => {
    if (readOnly) return;
    if (worker && selectedSite) {
      const def = { workerId: worker.id, workerName: worker.name };
      defaultOperatorRef.current = def;
      writeOperatorDefault(selectedSite, worker);
    }
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        workerId: worker?.id || '',
        workerName: worker?.name || '',
      };
      return next;
    });
  };

  const workerOptionLabel = (w) => {
    if (!w) return '';
    const emp = w.employee_id || w.employeeId || '';
    return emp ? `${w.name} (${emp})` : w.name;
  };

  const executeSave = async (payloads) => {
    setSaving(true);
    setSaveResult(null);
    const results = { success: 0, failed: 0, queued: 0, errors: [] };

    await Promise.allSettled(payloads.map(async (payload) => {
      try {
        await createFertigation(payload);
        results.success += 1;
      } catch (err) {
        if (!navigator.onLine) {
          try {
            await queueEntry({ type: 'fertigation', data: payload });
            results.queued += 1;
          } catch { results.failed += 1; results.errors.push(`${payload._fieldName}: Queue failed`); }
        } else {
          results.failed += 1;
          results.errors.push(`${payload._fieldName}: ${err.message || 'Failed'}`);
        }
      }
    }));

    setSaving(false);
    setSaveResult(results);

    if (results.success > 0) {
      notify.success(`Saved ${results.success} fertigation entry(ies)!`);
      clearDraft();
      if (onEntrySaved) onEntrySaved();
      if (groupMode && selectedGroup) initRowsForGroup(selectedGroup);
      else if (currentFarmArea) initRowsForFarmArea(currentFarmArea);
    }
    if (results.queued > 0) notify.warning(`${results.queued} entry(ies) queued offline.`);
    if (results.failed > 0) notify.error(`${results.failed} entry(ies) failed.`);
  };

  const buildPayloads = (filledRows) => {
    return filledRows.map((row) => {
      const dailyTotal = calcDailyTotal(row);
      const fertilizers = calcFertilizers(dailyTotal, row.recipeId);
      const totalFertilizer = Object.values(fertilizers).reduce((s, v) => s + v, 0);

      const field = allFieldsForSite.find((f) => f.id === row.fieldId);
      return {
        fieldId: row.fieldId,
        _fieldName: row.fieldName,
        recipeId: row.recipeId || undefined,
        cropId: field?.currentCropId || undefined,
        date: selectedDate,
        weekNumber: getWeekNumber(selectedDate),
        flowRate: parseFloat(row.flowRate) || undefined,
        frequency: parseInt(row.frequency, 10) || undefined,
        valvesCount: parseInt(row.valves, 10) || undefined,
        dailyWater: Number.isFinite(dailyTotal) && dailyTotal > 0 ? dailyTotal : undefined,
        fertilizers: Object.keys(fertilizers).length > 0 ? fertilizers : undefined,
        totalFertilizer: Number.isFinite(totalFertilizer) && totalFertilizer > 0 ? totalFertilizer : undefined,
        workerId: row.workerId || undefined,
      };
    });
  };

  const handleSaveAll = async () => {
    const filledRows = rows.filter((r) => r.waterQty && parseFloat(r.waterQty) > 0);
    if (filledRows.length === 0) {
      notify.error('No rows to save. Fill in at least Water Qty for a field.');
      return;
    }
    const missingRecipe = filledRows.filter((r) => !r.recipeId);
    if (missingRecipe.length > 0) {
      notify.error(`Recipe missing for: ${missingRecipe.map((r) => r.fieldName).join(', ')}`);
      return;
    }
    const unapprovedRecipe = filledRows.filter((r) => !isRecipeApproved(recipesById[r.recipeId]));
    if (unapprovedRecipe.length > 0) {
      notify.error(
        `Recipe not approved for: ${unapprovedRecipe.map((r) => r.fieldName).join(', ')} — ask the operations manager to approve it or pick another recipe`
      );
      return;
    }

    const payloads = buildPayloads(filledRows);

    try {
      const fieldIds = [...new Set(filledRows.map((r) => r.fieldId))];
      const res = await listFertigationEntries({ start_date: selectedDate, end_date: selectedDate, limit: 500 });
      const existingData = res?.data || res || [];
      const existingFieldIds = new Set(existingData.map((e) => e.fieldId || e.field_id));
      const duplicates = fieldIds.filter((fid) => existingFieldIds.has(fid));

      if (duplicates.length > 0) {
        const dupNames = duplicates.map((fid) => {
          const f = rows.find((r) => r.fieldId === fid) || fieldsForTab.find((ff) => ff.id === fid);
          return f?.fieldName || f?.name || fid;
        });
        setDuplicateDialog({ dupNames, payloads });
        return;
      }
    } catch {
      // offline - proceed
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
      const raw = (pr.fieldName || '').trim();
      const norm = raw.toLowerCase().replace(/[\s-]+/g, '');
      const field = fieldMap.get(norm)
        || fieldMap.get(raw.toLowerCase().replace(/\s+/g, '-'))
        || fieldsForTab.find((f) => f.name.toLowerCase() === raw.toLowerCase());
      return {
        _key: `paste-${Date.now()}-${Math.random()}`,
        fieldId: field?.id || '',
        fieldName: field?.name || raw,
        workerId: defaultOperatorRef.current?.workerId || '',
        workerName: defaultOperatorRef.current?.workerName || '',
        valves: pr.valves || field?.valves || '4',
        flowRate: pr.flowRate || '',
        waterQty: pr.waterQty || '',
        frequency: pr.frequency || '1',
        dailyTotal: pr.dailyTotal || '',
        recipeId: '',
      };
    }).filter((r) => r.fieldId);

    if (newRows.length > 0) {
      setRows(newRows);
      notify.success(`Pasted ${newRows.length} row(s)`);
    } else {
      notify.error('No rows matched fields in this farm area. Check field names.');
    }
  };

  return (
    <Box>
      {/* Top bar: Site, Date */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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

        <TextField
          size="small" select label="Field group" sx={{ minWidth: 220 }}
          value={selectedGroupId}
          onChange={(e) => handleGroupChange(e.target.value)}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true }}
          disabled={!selectedSite}
        >
          <MenuItem value="">All fields (by farm area)</MenuItem>
          {groups.map((g) => (
            <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
          ))}
        </TextField>

        {!readOnly && (
          <Button size="small" variant="outlined" onClick={() => setManageGroupsOpen(true)} disabled={!selectedSite}>
            Manage groups
          </Button>
        )}
      </Box>

      {/* Draft recovery */}
      {draftBanner && (
        <Alert severity="info" sx={{ mb: 2 }}
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" color="inherit" startIcon={<RestoreIcon />} onClick={restoreDraft}>Restore</Button>
              <Button size="small" color="inherit" startIcon={<DiscardIcon />} onClick={discardDraft}>Discard</Button>
            </Box>
          }
        >
          Unsaved fertigation draft found from a previous session.
        </Alert>
      )}

      {/* Farm Area Tabs — hidden when a field group is active */}
      {selectedSite && farmAreasForSite.length > 0 && !groupMode && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={selectedTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
            {farmAreasForSite.map((fa) => <Tab key={fa.id} label={fa.name} />)}
          </Tabs>
        </Box>
      )}

      {selectedSite && farmAreasForSite.length === 0 && (
        <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>No farm areas found for this site.</InfoNote>
      )}

      {groupMode && (
        <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
          Group mode: <strong>{selectedGroup.name}</strong> — {rows.length} field(s). Use group defaults below, then override individual rows if needed.
        </InfoNote>
      )}

      {/* Spreadsheet Grid */}
      {rows.length > 0 && (
        <>
          {groupMode && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>Group defaults</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <TextField
                  size="small" select label="Recipe" sx={{ minWidth: 160 }}
                  value={groupDefaults.recipeId}
                  onChange={(e) => setGroupDefaults({ ...groupDefaults, recipeId: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  disabled={readOnly}
                >
                  <MenuItem value=""><em>Select</em></MenuItem>
                  {recipePickerOptions(recipes, groupDefaults.recipeId).map((r) => (
                    <MenuItem key={r.id} value={r.id} disabled={!isRecipeApproved(r)}>{recipeOptionLabel(r)}</MenuItem>
                  ))}
                </TextField>
                {!isMobile && (
                  <TextField
                    size="small" type="number" label="Flow (m3/hr)" sx={{ width: 120 }}
                    value={groupDefaults.flowRate}
                    onChange={(e) => setGroupDefaults({ ...groupDefaults, flowRate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    disabled={readOnly}
                  />
                )}
                <TextField
                  size="small" type="number" label="Water (M3/Valve)" sx={{ width: 130 }}
                  value={groupDefaults.waterQty}
                  onChange={(e) => setGroupDefaults({ ...groupDefaults, waterQty: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  disabled={readOnly}
                />
                <TextField
                  size="small" type="number" label="Frequency" sx={{ width: 100 }}
                  value={groupDefaults.frequency}
                  onChange={(e) => setGroupDefaults({ ...groupDefaults, frequency: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  disabled={readOnly}
                />
                <TextField
                  size="small" type="number" label="Valves" sx={{ width: 90 }}
                  value={groupDefaults.valves}
                  onChange={(e) => setGroupDefaults({ ...groupDefaults, valves: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  disabled={readOnly}
                />
                {!readOnly && (
                  <Button variant="contained" size="small" onClick={applyGroupDefaults}>
                    Apply to all fields in group
                  </Button>
                )}
              </Box>
            </Paper>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {groupMode
                ? `${selectedGroup.name} — ${rows.length} field(s)`
                : `${currentFarmArea?.name || 'Farm area'} — ${fieldsForTab.length} field(s)`} — Week {getWeekNumber(selectedDate)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
            <Table size="small" stickyHeader sx={[excelTableSx, fieldFreezeSx, totalRowSx]}>
              <TableHead>
                <TableRow>
                  <TableCell className="col-frozen-0">Field</TableCell>
                  <TableCell>Operator</TableCell>
                  <TableCell>Crop</TableCell>
                  <TableCell>Recipe</TableCell>
                  <TableCell className="col-numeric">Valves</TableCell>
                  {!isMobile && <TableCell className="col-numeric">Flow Rate (m3/hr)</TableCell>}
                  <TableCell className="col-numeric">Water Qty (M3/Valve)</TableCell>
                  <TableCell className="col-numeric">Frequency</TableCell>
                  <TableCell className="col-numeric">Daily Total (m3)</TableCell>
                  {fertilizerNames.map((name) => (
                    <TableCell key={name} className="col-numeric">
                      <Tooltip title={name} describeChild><span>{name.length > 12 ? name.slice(0, 10) + '..' : name}</span></Tooltip>
                    </TableCell>
                  ))}
                  <TableCell className="col-numeric">Total Fert (kg)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, idx) => {
                  const dailyTotal = calcDailyTotal(row);
                  const ferts = calcFertilizers(dailyTotal, row.recipeId);
                  const totalFert = Object.values(ferts).reduce((s, v) => s + v, 0);
                  const field = allFieldsForSite.find((f) => f.id === row.fieldId)
                    || fieldsForTab.find((f) => f.id === row.fieldId);
                  const cropName = field?.currentCrop || '';
                  const isOverride = rowHasOverride(row, groupDefaults, groupMode);

                  return (
                    <TableRow
                      key={row._key}
                      hover
                      sx={isOverride ? { borderLeft: '3px solid', borderLeftColor: 'info.main' } : undefined}
                    >
                      <TableCell className="col-frozen-0" {...CELL} sx={{ fontWeight: 600 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {row.fieldName}
                          {isOverride && (
                            <Typography component="span" variant="caption" color="info.main" sx={{ fontWeight: 600 }}>
                              override
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell {...CELL}>
                        <Autocomplete
                          size="small"
                          options={workers}
                          getOptionLabel={workerOptionLabel}
                          value={workers.find((w) => w.id === row.workerId) || null}
                          onChange={(_, w) => handleOperatorChange(idx, w)}
                          disabled={readOnly}
                          isOptionEqualToValue={(a, b) => a?.id === b?.id}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              placeholder="Search…"
                              InputProps={{ ...params.InputProps, sx: { fontSize: '0.75rem' } }}
                            />
                          )}
                          sx={{ width: 150, '& .MuiInput-input': { fontSize: '0.75rem' } }}
                        />
                      </TableCell>
                      <TableCell {...CELL}>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {cropName || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell {...CELL}>
                        <TextField
                          size="small" select variant="standard"
                          value={row.recipeId}
                          onChange={(e) => updateRow(idx, 'recipeId', e.target.value)}
                          sx={{ width: 130, '& .MuiInput-input': { fontSize: '0.75rem' } }}
                          SelectProps={{ displayEmpty: true }}
                        >
                          <MenuItem value="" sx={{ fontSize: '0.75rem' }}><em>Select</em></MenuItem>
                          {recipePickerOptions(recipes, row.recipeId).map((r) => (
                            <MenuItem key={r.id} value={r.id} disabled={!isRecipeApproved(r)} sx={{ fontSize: '0.75rem' }}>
                              {recipeOptionLabel(r)}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell {...NUM_CELL}>
                        <CellInput value={row.valves} onChange={(v) => updateRow(idx, 'valves', v)} type="number" placeholder="4" width={50} rowIdx={idx} colName="valves" />
                      </TableCell>
                      {!isMobile && (
                        <TableCell {...NUM_CELL}>
                          <CellInput value={row.flowRate} onChange={(v) => updateRow(idx, 'flowRate', v)} type="number" placeholder="12" width={70} rowIdx={idx} colName="flowRate" />
                        </TableCell>
                      )}
                      <TableCell {...NUM_CELL}>
                        <CellInput value={row.waterQty} onChange={(v) => updateRow(idx, 'waterQty', v)} type="number" placeholder="0.00" width={80} rowIdx={idx} colName="waterQty" />
                      </TableCell>
                      <TableCell {...NUM_CELL}>
                        <CellInput value={row.frequency} onChange={(v) => updateRow(idx, 'frequency', v)} type="number" placeholder="1" width={50} rowIdx={idx} colName="frequency" />
                      </TableCell>
                      <TableCell {...CELL}>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: dailyTotal > 0 ? 'primary.main' : 'text.disabled' }}>
                          {dailyTotal > 0 ? dailyTotal.toFixed(2) : '-'}
                        </Typography>
                      </TableCell>
                      {fertilizerNames.map((name) => (
                        <TableCell key={name} {...CELL}>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {ferts[name] > 0 ? ferts[name].toFixed(3) : '-'}
                          </Typography>
                        </TableCell>
                      ))}
                      <TableCell {...CELL}>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: totalFert > 0 ? 'success.main' : 'text.disabled' }}>
                          {totalFert > 0 ? totalFert.toFixed(3) : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                {rows.length > 0 && (
                  <TableRow className="row-total">
                    {/* One empty cell per header column so the sums sit under
                        Daily Total and the fertilizers (Operator, Crop, Recipe,
                        Valves, Flow Rate on wide screens, Water Qty, Frequency). */}
                    <TableCell className="col-frozen-0">TOTAL</TableCell>
                    <TableCell {...CELL} />
                    <TableCell {...CELL} />
                    <TableCell {...CELL} />
                    <TableCell {...CELL} />
                    {!isMobile && <TableCell {...CELL} />}
                    <TableCell {...CELL} />
                    <TableCell {...CELL} />
                    <TableCell {...CELL}>
                      {rows.reduce((s, r) => s + calcDailyTotal(r), 0).toFixed(2)}
                    </TableCell>
                    {fertilizerNames.map((name) => {
                      const total = rows.reduce((s, r) => {
                        const dt = calcDailyTotal(r);
                        const f = calcFertilizers(dt, r.recipeId);
                        return s + (f[name] || 0);
                      }, 0);
                      return (
                        <TableCell key={name} {...CELL}>
                          {total > 0 ? total.toFixed(3) : '-'}
                        </TableCell>
                      );
                    })}
                    <TableCell {...CELL}>
                      {rows.reduce((s, r) => {
                        const dt = calcDailyTotal(r);
                        const f = calcFertilizers(dt, r.recipeId);
                        return s + Object.values(f).reduce((a, b) => a + b, 0);
                      }, 0).toFixed(3)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {!groupMode && currentFarmArea && rows.length === 0 && (
        <InfoNote mode="line" severity="info">No fields in this farm area. Add fields first.</InfoNote>
      )}

      {groupMode && rows.length === 0 && (
        <Alert severity="warning">This group has no fields on the selected site.</Alert>
      )}

      <FertigationGroupManager
        open={manageGroupsOpen}
        onClose={() => setManageGroupsOpen(false)}
        siteId={selectedSite}
        allFieldsForSite={allFieldsForSite}
        farmAreasForSite={farmAreasForSite}
        recipes={recipes}
        groups={groups}
        onGroupsChange={async () => {
          await loadGroups(selectedSite);
          if (selectedGroupId) {
            const refreshed = await listFertigationGroups(selectedSite).catch(() => []);
            const group = (refreshed || []).find((g) => g.id === selectedGroupId);
            if (group) initRowsForGroup(group);
          }
        }}
        readOnly={readOnly}
      />

      <PasteFromExcelFert open={pasteOpen} onClose={() => setPasteOpen(false)} onPaste={handlePasteData} />

      <FertigationImporter
        open={importOpen}
        onClose={() => setImportOpen(false)}
        fields={allFieldsForSite}
        onImportComplete={() => { if (onEntrySaved) onEntrySaved(); }}
      />

      {/* Duplicate warning dialog */}
      <Dialog open={!!duplicateDialog} onClose={() => setDuplicateDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Duplicate Entries Found</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following fields already have fertigation entries for <strong>{selectedDate}</strong>:
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
