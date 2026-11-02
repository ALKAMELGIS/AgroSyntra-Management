import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import {
  Box,
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
  Chip,
  TableSortLabel,
  IconButton,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  CircularProgress,
} from '@mui/material';
import {
  DeleteOutlined as DeleteIcon,
  EditOutlined as EditIcon,
  SaveOutlined as SaveIcon,
  AddOutlined as AddIcon,
  InboxOutlined as InboxIcon,
  DeleteSweepOutlined as BulkDeleteIcon,
} from '@mui/icons-material';
import { getCropDripperCount, getCropDripTestCount } from '../../utils/masterDataUtils';
import { listEcphAll, deleteEcph, updateEcph } from '../../utils/backendApi';
import { useNotification } from '../../contexts/NotificationContext';
import useOpsExcelExport from '../../hooks/useOpsExcelExport';
import { OPS_EXPORT } from '../../utils/companyExcelExport';
import { buildEcphExcelSheets } from '../../utils/ecphExcelExport';
import { getECColor, getPHColor, toNumber } from './ecphUtils';
import {
  computeGrowBagDrip,
  computePercentDrain,
  displayEcphNumber,
  formatDrainPercent,
  growBagDripHeader,
  resolveDripperCount,
  resolveDripTestCount,
  resolveValveWaterQty,
  resolveWaterBasedOnDrip,
  toFiniteNumber,
} from '../../utils/ecphWaterDisplay';
import EntryHistoryToolbar from '../../components/entries/EntryHistoryToolbar';
import { useEntryHistory } from '../../hooks/useEntryHistory';
import useSeasonListDates from '../../hooks/useSeasonListDates';
import { excelTableSx, freezeColumnsSx } from '../../components/table/ExcelTable';

const CHECKBOX_W = 48;
// Date, Site, Farm Area, Field — the run that still identifies a reading once
// the valve numbers have scrolled away. Checkbox is frozen in front of them.
const ENTRY_FROZEN_WIDTHS = [CHECKBOX_W, 100, 110, 120, 130];

const headerCheckboxSx = (t) => ({
  color: t.palette.table.headerText,
  '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: t.palette.table.headerText },
});

// Two header rows: First Valve / Second Valve groups sit on row 1, metric
// names on row 2. excelTableSx parks every head cell at top: 0, which would
// stack them. Row 2 has to sit under row 1.
const twoRowHeadSx = {
  '&& thead tr:first-of-type .MuiTableCell-head': { top: 0 },
  '&& thead tr:nth-of-type(2) .MuiTableCell-head': { top: 40 },
  '& .MuiTableSortLabel-root, & .MuiTableSortLabel-root:hover, & .MuiTableSortLabel-root.Mui-active': {
    color: 'inherit',
  },
  '& .MuiTableSortLabel-icon': { color: 'inherit !important' },
};

function buildAllFields(masterData) {
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
}

function buildSites(masterData) {
  const sites = [];
  masterData.countries?.forEach((country) => {
    country.sites?.forEach((site) => {
      sites.push({ ...site, countryId: country.id, countryName: country.name });
    });
  });
  return sites;
}

function buildFarmAreas(masterData) {
  const farmAreas = [];
  masterData.countries?.forEach((country) => {
    country.sites?.forEach((site) => {
      site.farmAreas?.forEach((farmArea) => {
        farmAreas.push({
          ...farmArea,
          siteId: site.id,
          siteName: site.name,
          countryId: country.id,
          countryName: country.name,
        });
      });
    });
  });
  return farmAreas;
}

function valveRowMetrics(valve, entry, fieldInfo, masterData) {
  const dripperCount = resolveDripperCount(entry, fieldInfo, masterData);
  const dripTestCount = resolveDripTestCount(entry, fieldInfo, masterData);
  const nDrip = computeGrowBagDrip(valve?.dripVolume, dripTestCount);
  const storedPct = toFiniteNumber(valve?.percentDrain);
  const pct = storedPct != null
    ? storedPct
    : computePercentDrain(valve?.drainVolume ?? valve?.drain, nDrip);
  return {
    dripperCount,
    nDrip,
    drainPercent: formatDrainPercent(pct),
    waterDrip: resolveWaterBasedOnDrip(valve, entry, dripperCount),
  };
}

function mapApiEntryToUi(entry, allFields) {
  const fieldInfo = allFields.find((f) => f.id === entry.fieldId);
  return {
    ...entry,
    siteId: fieldInfo?.siteId,
    farmAreaId: fieldInfo?.farmAreaId,
    countryId: fieldInfo?.countryId,
    valves: (entry.valveReadings || []).map((reading) => ({
      valveNumber: reading.valveNumber,
      dripVolume: reading.dripVolume ?? '',
      drainVolume: reading.drain ?? '',
      ecIn: reading.ecIn ?? '',
      ecOut: reading.ec ?? '',
      phIn: reading.phIn ?? '',
      phOut: reading.ph ?? '',
      percentDrain: reading.percentDrain ?? '',
      totalWaterBasedOnDrip: reading.totalWaterBasedOnDrip ?? null,
      qtyOfWater: reading.qtyOfWater ?? '',
      cycle: reading.cycle ?? '',
      totalWaterQty: reading.totalWaterQty ?? '',
    })),
  };
}

function calculateValveData(valve, dripperCount, dripTestCount) {
  if (!valve || !valve.dripVolume) return null;

  const dripVolume = parseFloat(valve.dripVolume) || 0;
  const drainVolume = parseFloat(valve.drainVolume) || 0;
  const testCount = dripTestCount && dripTestCount > 0 ? dripTestCount : null;
  const dripVolumeN = testCount ? dripVolume * testCount : null;
  const percentDrain = dripVolumeN && dripVolumeN > 0 && drainVolume > 0
    ? ((drainVolume / dripVolumeN) * 100).toFixed(2)
    : '0.00';
  const totalWaterBasedOnDrip = (dripVolume > 0 && dripperCount && dripperCount > 0)
    ? ((dripVolume * dripperCount) / 1000000).toFixed(3)
    : null;

  return {
    ...valve,
    dripVolumeN,
    percentDrain,
    totalWaterBasedOnDrip: totalWaterBasedOnDrip !== null ? parseFloat(totalWaterBasedOnDrip) : null,
  };
}

export default function EcphEntriesTable({ siteId, masterData, refreshTrigger = 0 }) {
  const notify = useNotification();
  const exportOpsExcel = useOpsExcelExport();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { seasonStart, seasonEnd, isReady: seasonDatesReady } = useSeasonListDates();
  const [datePreset, setDatePreset] = useState('season');
  const [filterText, setFilterText] = useState('');
  const [filterFarmAreaId, setFilterFarmAreaId] = useState('');
  const [filterFieldId, setFilterFieldId] = useState('');
  const [orderBy, setOrderBy] = useState('date');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const allSites = useMemo(() => buildSites(masterData), [masterData]);
  const allFarmAreas = useMemo(() => buildFarmAreas(masterData), [masterData]);
  const allFields = useMemo(() => buildAllFields(masterData), [masterData]);
  const siteFields = useMemo(
    () => allFields.filter((f) => !siteId || f.siteId === siteId),
    [allFields, siteId],
  );
  const farmAreaOptions = useMemo(() => {
    const seen = new Map();
    siteFields.forEach((f) => {
      if (f.farmAreaId && !seen.has(f.farmAreaId)) {
        seen.set(f.farmAreaId, { id: f.farmAreaId, name: f.farmAreaName || f.farmAreaId });
      }
    });
    return [...seen.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  }, [siteFields]);
  const fieldOptions = useMemo(() => {
    return siteFields
      .filter((f) => !filterFarmAreaId || f.farmAreaId === filterFarmAreaId)
      .map((f) => ({ id: f.id, name: f.name || f.id }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [siteFields, filterFarmAreaId]);

  useEffect(() => {
    setFilterFarmAreaId('');
    setFilterFieldId('');
  }, [siteId]);

  const fetchAll = useCallback((params) => listEcphAll(params), []);
  const { rows: rawRows, loading, refresh } = useEntryHistory({
    fetchAll,
    siteId,
    datePreset,
    seasonRange: { startDate: seasonStart, endDate: seasonEnd },
    enabled: Boolean(siteId) && seasonDatesReady,
  });

  useEffect(() => {
    if (refreshTrigger > 0) refresh();
  }, [refreshTrigger, refresh]);

  const entries = useMemo(
    () => rawRows.map((e) => mapApiEntryToUi(e, allFields)),
    [rawRows, allFields]
  );

  const getSiteName = useCallback((id) => allSites.find((s) => s.id === id)?.name || id || 'Unknown', [allSites]);
  const getFarmAreaName = useCallback((id) => allFarmAreas.find((fa) => fa.id === id)?.name || id || 'Unknown', [allFarmAreas]);
  const getFieldName = useCallback((id) => allFields.find((f) => f.id === id)?.name || id || 'Unknown', [allFields]);

  const getSelectedFieldInfo = useCallback((fieldId) => {
    if (!fieldId) return { dripperCount: null, dripTestCount: null };
    const field = allFields.find((f) => f.id === fieldId);
    if (!field) return { dripperCount: null, dripTestCount: null };
    const cropName = field.currentCrop;
    return {
      dripperCount: cropName ? getCropDripperCount(masterData, cropName) : null,
      dripTestCount: cropName ? getCropDripTestCount(masterData, cropName) : null,
    };
  }, [allFields, masterData]);

  const filteredAndSortedEntries = useMemo(() => {
    let filtered = entries.filter((entry) => {
      if (filterFieldId && entry.fieldId !== filterFieldId) return false;
      if (filterFarmAreaId && entry.farmAreaId !== filterFarmAreaId) return false;
      if (!filterText) return true;
      const searchLower = filterText.toLowerCase();
      const siteName = getSiteName(entry.siteId).toLowerCase();
      const farmAreaName = getFarmAreaName(entry.farmAreaId).toLowerCase();
      const fieldName = getFieldName(entry.fieldId).toLowerCase();
      if (
        siteName.includes(searchLower) ||
        farmAreaName.includes(searchLower) ||
        fieldName.includes(searchLower) ||
        entry.time?.toLowerCase().includes(searchLower)
      ) {
        return true;
      }
      if (entry.valves?.length) {
        return entry.valves.some((valve) =>
          valve.ecIn?.toString().includes(searchLower) ||
          valve.ecOut?.toString().includes(searchLower) ||
          valve.phIn?.toString().includes(searchLower) ||
          valve.phOut?.toString().includes(searchLower)
        );
      }
      return false;
    });

    filtered.sort((a, b) => {
      let aValue;
      let bValue;
      if (orderBy === 'site') {
        aValue = getSiteName(a.siteId);
        bValue = getSiteName(b.siteId);
      } else if (orderBy === 'farmArea') {
        aValue = getFarmAreaName(a.farmAreaId);
        bValue = getFarmAreaName(b.farmAreaId);
      } else if (orderBy === 'field') {
        aValue = getFieldName(a.fieldId);
        bValue = getFieldName(b.fieldId);
      } else {
        aValue = a[orderBy];
        bValue = b[orderBy];
      }
      if (order === 'asc') return aValue > bValue ? 1 : -1;
      return aValue < bValue ? 1 : -1;
    });

    return filtered;
  }, [entries, filterText, filterFarmAreaId, filterFieldId, orderBy, order, getSiteName, getFarmAreaName, getFieldName]);

  const paginatedEntries = useMemo(
    () => filteredAndSortedEntries.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredAndSortedEntries, page, rowsPerPage]
  );

  const growBagHeader = useMemo(() => {
    const counts = filteredAndSortedEntries.map((entry) => resolveDripTestCount(
      entry,
      allFields.find((field) => field.id === entry.fieldId),
      masterData,
    ));
    return growBagDripHeader(counts);
  }, [filteredAndSortedEntries, allFields, masterData]);

  const valveMetricLabels = [
    'EC In', 'EC Out', 'pH In', 'pH Out', 'Drip Vol', 'Drain Vol',
    growBagHeader, '% Drain', 'Water/Drip (M3)', 'Water QTY',
  ];

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleDelete = async (id) => {
    if (await confirm('Are you sure you want to delete this entry?', { title: 'Delete Entry' })) {
      try {
        await deleteEcph(id);
        refresh();
        notify.success('Entry deleted successfully!');
      } catch (error) {
        notify.error(error.message);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (await confirm(`Delete ${selectedIds.size} selected entry(ies)?`, { title: 'Bulk Delete' })) {
      let deleted = 0;
      for (const id of selectedIds) {
        try { await deleteEcph(id); deleted++; } catch { /* skip */ }
      }
      setSelectedIds(new Set());
      refresh();
      notify.success(`Deleted ${deleted} entry(ies).`);
    }
  };

  const handleExportEntries = async () => {
    if (filteredAndSortedEntries.length === 0) {
      notify.error('No entries to export.');
      return;
    }
    const fieldMap = {};
    allFields.forEach((f) => {
      fieldMap[f.id] = {
        name: f.name,
        currentCrop: f.currentCrop,
        crop: f.crop,
        cropHistory: f.cropHistory,
        type: f.type,
        farmAreaId: f.farmAreaId,
        farmAreaName: f.farmAreaName,
        siteName: f.siteName,
      };
    });
    const sheets = buildEcphExcelSheets(filteredAndSortedEntries, {
      fieldInfoMap: fieldMap,
      masterData,
    });
    if (sheets.length === 0) {
      notify.error('No entries to export.');
      return;
    }
    await exportOpsExcel(null, {
      filename: `ECPH_Entries_${new Date().toISOString().split('T')[0]}`,
      sheets,
      ...OPS_EXPORT.ecph,
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedEntries.map((e) => e.id)));
    }
  };

  const handleEditSave = (updatedEntry) => {
    const fieldInfo = getSelectedFieldInfo(updatedEntry.fieldId);
    const valve1Data = calculateValveData(updatedEntry.valve1, fieldInfo.dripperCount, fieldInfo.dripTestCount);
    if (!valve1Data) {
      notify.error('Valve 1 data is required!');
      return;
    }

    const valve2Data = updatedEntry.valves?.[1] || null;
    const valves = [valve1Data];
    if (valve2Data) valves.push(valve2Data);

    const ev1Qty = parseFloat(updatedEntry.valve1?.qtyOfWater) || 0;
    const ev1Cyc = parseFloat(updatedEntry.valve1?.cycle) || 0;
    const ev1TWQ = ev1Qty > 0 && ev1Cyc > 0 ? ev1Qty * ev1Cyc : 0;
    const ev2Qty = parseFloat(valve2Data?.qtyOfWater) || 0;
    const ev2Cyc = parseFloat(valve2Data?.cycle) || 0;
    const ev2TWQ = ev2Qty > 0 && ev2Cyc > 0 ? ev2Qty * ev2Cyc : 0;
    const editAvgTWQ = (valve2Data && ev2TWQ > 0) ? (ev1TWQ + ev2TWQ) / 2 : ev1TWQ;

    const buildEditValvePayload = (valve) => {
      const qty = parseFloat(valve.qtyOfWater) || 0;
      const cyc = parseFloat(valve.cycle) || 0;
      const twq = qty > 0 && cyc > 0 ? qty * cyc : 0;
      return {
        valveNumber: Number(valve.valveNumber),
        dripVolume: valve.dripVolume ? parseFloat(valve.dripVolume) : undefined,
        drain: valve.drainVolume ? parseFloat(valve.drainVolume) : undefined,
        ecIn: valve.ecIn !== '' && valve.ecIn != null ? parseFloat(valve.ecIn) : undefined,
        ec: valve.ecOut !== '' && valve.ecOut != null ? parseFloat(valve.ecOut) : undefined,
        phIn: valve.phIn !== '' && valve.phIn != null ? parseFloat(valve.phIn) : undefined,
        ph: valve.phOut !== '' && valve.phOut != null ? parseFloat(valve.phOut) : undefined,
        ...(twq > 0 ? { totalWaterQty: Number(twq.toFixed(3)) } : {}),
      };
    };

    const payload = {
      date: updatedEntry.date,
      time: updatedEntry.time || undefined,
      ...(editAvgTWQ > 0 ? { totalWaterQty: Number(editAvgTWQ.toFixed(3)) } : {}),
      ...(fieldInfo.dripperCount > 0 ? { dripperCount: Math.round(fieldInfo.dripperCount) } : {}),
      ...(fieldInfo.dripTestCount > 0 ? { dripTestCount: Math.round(fieldInfo.dripTestCount) } : {}),
      valveReadings: valves.map(buildEditValvePayload),
    };

    updateEcph(updatedEntry.id, payload)
      .then(() => {
        refresh();
        setEditDialogOpen(false);
        setEditingEntry(null);
        notify.success('Entry updated successfully!');
      })
      .catch((error) => notify.error(error.message));
  };

  const renderEcPhChip = (value, type) => (
    <Chip
      label={value || '0.00'}
      color={type === 'ec' ? getECColor(parseFloat(value) || 0) : getPHColor(parseFloat(value) || 0)}
      size="small"
      sx={{ fontWeight: 600, fontSize: '10px', height: 22 }}
    />
  );

  return (
    <Box sx={{ mt: 4 }}>
      <Paper elevation={0} sx={{ overflow: 'hidden' }}>
        <EntryHistoryToolbar
          title="All Entries"
          datePreset={datePreset}
          onDatePresetChange={(v) => { setDatePreset(v); setPage(0); }}
          filterText={filterText}
          onFilterTextChange={(v) => { setFilterText(v); setPage(0); }}
          farmAreas={farmAreaOptions}
          farmAreaId={filterFarmAreaId}
          onFarmAreaChange={(id) => {
            setFilterFarmAreaId(id);
            if (id && filterFieldId) {
              const field = siteFields.find((f) => f.id === filterFieldId);
              if (field && field.farmAreaId !== id) setFilterFieldId('');
            }
            setPage(0);
          }}
          fields={fieldOptions}
          fieldId={filterFieldId}
          onFieldChange={(id) => { setFilterFieldId(id); setPage(0); }}
          onExport={handleExportEntries}
          loading={loading}
          entryCount={filteredAndSortedEntries.length}
          bulkDeleteSlot={selectedIds.size > 0 ? (
            <Button
              size="small"
              color="error"
              variant="outlined"
              startIcon={<BulkDeleteIcon />}
              onClick={handleBulkDelete}
              sx={{ mr: 1, whiteSpace: 'nowrap' }}
            >
              Delete ({selectedIds.size})
            </Button>
          ) : null}
        />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : paginatedEntries.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, px: 2 }}>
            <InboxIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {filterText ? 'No entries found' : 'No entries in this date range'}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {filterText ? 'Try adjusting your search filters' : 'Change the date filter or add a new entry above'}
            </Typography>
          </Box>
        ) : (
          <>
            {filteredAndSortedEntries.length > 2000 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
                Showing {filteredAndSortedEntries.length} entries — narrow the date range for faster loading
              </Typography>
            )}
            <TableContainer sx={{ maxHeight: 520 }}>
              <Table size="small" sx={[excelTableSx, freezeColumnsSx(ENTRY_FROZEN_WIDTHS), twoRowHeadSx, { minWidth: 1100 }]}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" className="col-frozen-0">
                      <Checkbox
                        size="small"
                        sx={headerCheckboxSx}
                        checked={paginatedEntries.length > 0 && selectedIds.size === paginatedEntries.length}
                        indeterminate={selectedIds.size > 0 && selectedIds.size < paginatedEntries.length}
                        onChange={toggleSelectAll}
                      />
                    </TableCell>
                    <TableCell className="col-frozen-1">
                      <TableSortLabel active={orderBy === 'date'} direction={orderBy === 'date' ? order : 'asc'} onClick={() => handleSort('date')}>
                        Date
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="col-frozen-2">
                      <TableSortLabel active={orderBy === 'site'} direction={orderBy === 'site' ? order : 'asc'} onClick={() => handleSort('site')}>
                        Site
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="col-frozen-3">
                      <TableSortLabel active={orderBy === 'farmArea'} direction={orderBy === 'farmArea' ? order : 'asc'} onClick={() => handleSort('farmArea')}>
                        Farm Area
                      </TableSortLabel>
                    </TableCell>
                    <TableCell className="col-frozen-4">
                      <TableSortLabel active={orderBy === 'field'} direction={orderBy === 'field' ? order : 'asc'} onClick={() => handleSort('field')}>
                        Field
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={orderBy === 'time'} direction={orderBy === 'time' ? order : 'asc'} onClick={() => handleSort('time')}>
                        Time
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center" colSpan={10}>First Valve</TableCell>
                    <TableCell align="center" colSpan={10}>Second Valve</TableCell>
                    <TableCell align="center" colSpan={6}>Field Total</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="col-frozen-0" />
                    <TableCell className="col-frozen-1" />
                    <TableCell className="col-frozen-2" />
                    <TableCell className="col-frozen-3" />
                    <TableCell className="col-frozen-4" />
                    <TableCell />
                    {valveMetricLabels.map((lbl) => (
                      <TableCell key={`v1-${lbl}`} className="col-numeric">{lbl}</TableCell>
                    ))}
                    {valveMetricLabels.map((lbl) => (
                      <TableCell key={`v2-${lbl}`} className="col-numeric">{lbl}</TableCell>
                    ))}
                    <TableCell className="col-numeric">Qty Water</TableCell>
                    <TableCell className="col-numeric">Cycle</TableCell>
                    <TableCell className="col-numeric">Water (M³)</TableCell>
                    <TableCell className="col-numeric">Avg (M³)</TableCell>
                    <TableCell>Weather</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedEntries.map((entry) => {
                    const valve1 = entry.valves?.[0] || {};
                    const valve2 = entry.valves?.[1] || null;
                    const valves = entry.valves || [];
                    const fieldInfo = allFields.find((f) => f.id === entry.fieldId);
                    const metrics1 = valveRowMetrics(valve1, entry, fieldInfo, masterData);
                    const metrics2 = valve2
                      ? valveRowMetrics(valve2, entry, fieldInfo, masterData)
                      : null;
                    const waterQty1 = resolveValveWaterQty(valve1, entry, {
                      valveIndex: 0,
                      valves,
                      dripperCount: metrics1.dripperCount,
                    });
                    const waterQty2 = valve2
                      ? resolveValveWaterQty(valve2, entry, {
                        valveIndex: 1,
                        valves,
                        dripperCount: metrics2.dripperCount,
                      })
                      : null;
                    const qtyWater = valve1.qtyOfWater || entry.qtyOfWater;
                    const cycle = valve1.cycle || entry.cycle;
                    return (
                      <TableRow key={entry.id} hover selected={selectedIds.has(entry.id)}>
                        <TableCell padding="checkbox" className="col-frozen-0">
                          <Checkbox size="small" checked={selectedIds.has(entry.id)} onChange={() => toggleSelect(entry.id)} />
                        </TableCell>
                        <TableCell className="col-frozen-1" title={entry.date || ''}>{entry.date}</TableCell>
                        <TableCell className="col-frozen-2" title={getSiteName(entry.siteId) || ''}>{getSiteName(entry.siteId)}</TableCell>
                        <TableCell className="col-frozen-3" title={getFarmAreaName(entry.farmAreaId) || ''}>{getFarmAreaName(entry.farmAreaId)}</TableCell>
                        <TableCell className="col-frozen-4" title={getFieldName(entry.fieldId) || ''}>{getFieldName(entry.fieldId)}</TableCell>
                        <TableCell>{entry.time}</TableCell>
                        <TableCell className="col-numeric">{renderEcPhChip(valve1.ecIn, 'ec')}</TableCell>
                        <TableCell className="col-numeric">{renderEcPhChip(valve1.ecOut, 'ec')}</TableCell>
                        <TableCell className="col-numeric">{renderEcPhChip(valve1.phIn, 'ph')}</TableCell>
                        <TableCell className="col-numeric">{renderEcPhChip(valve1.phOut, 'ph')}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(valve1.dripVolume)}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(valve1.drainVolume)}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(metrics1.nDrip)}</TableCell>
                        <TableCell className="col-numeric">{metrics1.drainPercent || '-'}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(metrics1.waterDrip)}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(waterQty1)}</TableCell>
                        <TableCell className="col-numeric">
                          {valve2 ? renderEcPhChip(valve2.ecIn, 'ec') : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">
                          {valve2 ? renderEcPhChip(valve2.ecOut, 'ec') : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">
                          {valve2 ? renderEcPhChip(valve2.phIn, 'ph') : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">
                          {valve2 ? renderEcPhChip(valve2.phOut, 'ph') : '-'}
                        </TableCell>
                        <TableCell className="col-numeric">{valve2 ? displayEcphNumber(valve2.dripVolume) : '-'}</TableCell>
                        <TableCell className="col-numeric">{valve2 ? displayEcphNumber(valve2.drainVolume) : '-'}</TableCell>
                        <TableCell className="col-numeric">{valve2 ? displayEcphNumber(metrics2.nDrip) : '-'}</TableCell>
                        <TableCell className="col-numeric">{valve2 ? (metrics2.drainPercent || '-') : '-'}</TableCell>
                        <TableCell className="col-numeric">{valve2 ? displayEcphNumber(metrics2.waterDrip) : '-'}</TableCell>
                        <TableCell className="col-numeric">{valve2 ? displayEcphNumber(waterQty2) : '-'}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(qtyWater)}</TableCell>
                        <TableCell className="col-numeric">{displayEcphNumber(cycle)}</TableCell>
                        <TableCell className="col-numeric">{entry.totalWaterQty || '0.000'}</TableCell>
                        <TableCell className="col-numeric">{toNumber(entry.fieldTotalWaterBasedOnDrip).toFixed(3)}</TableCell>
                        <TableCell>{entry.weatherCondition || entry.weather || '-'}</TableCell>
                        <TableCell>{entry.irrigationStatus || entry.status || '-'}</TableCell>
                        <TableCell align="center">
                          <IconButton color="primary" size="small" onClick={() => { setEditingEntry({ ...entry, valve1 }); setEditDialogOpen(true); }} aria-label="Edit">
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton color="error" size="small" onClick={() => handleDelete(entry.id)} aria-label="Delete">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredAndSortedEntries.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </>
        )}
      </Paper>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Entry</DialogTitle>
        <DialogContent>
          {editingEntry && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={12}>
                <Typography variant="subtitle2" color="text.secondary">Editing Valve 1 (Quick Edit)</Typography>
              </Grid>
              {['ecIn', 'ecOut', 'phIn', 'phOut'].map((field) => (
                <Grid size={{ xs: 12, sm: 6 }} key={field}>
                  <TextField
                    fullWidth
                    label={field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                    type="number"
                    value={editingEntry.valve1?.[field] || ''}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      valve1: { ...editingEntry.valve1, [field]: parseFloat(e.target.value) || 0 },
                    })}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => handleEditSave(editingEntry)} startIcon={<SaveIcon />}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Box>
  );
}
