import * as XLSX from 'xlsx';
import { matchMasterOption } from './masterDataFuzzyMatch';

export const MAX_ACTIVITY_BLOCKS = 8;
export const BLOCK_WIDTH = 10;
export const WORKER_COL_COUNT = 4;
export const DATA_REFERENCE_SHEET = 'data reference';
export const RECORD_SHEET = 'record';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function normalizeEmployeeId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 1e-9) return String(rounded);
    return String(value);
  }
  return String(value).trim();
}

export function normalizeWorkerCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'permanent' || key === 'eag' || key === 'e.a.g') return 'Permanent';
  return 'Casual';
}

export function normalizeImportedVariety(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  if (text === '' || text === '0' || text === '-' || text.toLowerCase() === 'n/a') return '';
  return text;
}

export function isGeneralCropValue(value) {
  if (value == null || value === '') return true;
  const text = String(value).trim();
  return text === '' || text === '0' || text === '-' || text.toLowerCase() === 'n/a';
}

export function excelSerialToIsoDate(serial) {
  const n = Math.trunc(Number(serial));
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = Date.UTC(1899, 11, 30) + n * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === 'number') return excelSerialToIsoDate(value);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  return null;
}

function parseTimeString(value) {
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function excelFractionToTime(frac) {
  if (frac == null || frac === '') return null;
  if (typeof frac === 'string') return parseTimeString(frac);
  const n = Number(frac);
  if (!Number.isFinite(n)) return null;
  const dayFrac = n >= 1 ? n % 1 : n;
  let totalMins = Math.round(dayFrac * 24 * 60);
  if (totalMins === 24 * 60) totalMins = 0;
  if (totalMins < 0) return null;
  const hours = Math.floor(totalMins / 60) % 24;
  const minutes = totalMins % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function parseExcelTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  if (typeof value === 'number') return excelFractionToTime(value);
  return parseTimeString(value);
}

export function parseHours(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function parseNullableNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function timeToMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).substring(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function namesMatch(a, b) {
  const left = String(a || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const right = String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(left) && left === right;
}

function historicalBlockIsBlank(raw) {
  return [
    raw.activity,
    raw.unit,
    raw.variety,
    raw.location,
    raw.section,
    raw.startTime,
    raw.endTime,
    raw.target,
    raw.actual,
  ].every((value) => isBlank(value) || value == null);
}

export function historicalBlockError(block) {
  if (!block.location) return 'Location is required';
  if (!block.section) return 'Section is required';
  if (!block.startTime || !block.endTime) return 'Start and end times are required';
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  if (start == null || end == null || end <= start) return 'End time must be after start time';
  if (block.activity && !block.unit) return 'Unit is required when activity is filled';
  return null;
}

export function selectRecordSheetName(sheetNames) {
  const names = sheetNames || [];
  const record = names.find((name) => String(name).trim().toLowerCase() === RECORD_SHEET);
  if (record) return record;
  return names.find((name) => String(name).trim().toLowerCase() !== DATA_REFERENCE_SHEET) || null;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => (
    Array.isArray(row)
    && row.includes('Date')
    && row.includes('Employee Name')
  ));
}

function parseRawBlock(row, base) {
  const cropValue = row[base + 2];
  return {
    activity: isBlank(row[base]) ? '' : String(row[base]).trim(),
    unit: isBlank(row[base + 1]) ? '' : String(row[base + 1]).trim(),
    cropValue,
    variety: normalizeImportedVariety(cropValue),
    location: isBlank(row[base + 3]) ? '' : String(row[base + 3]).trim(),
    section: isBlank(row[base + 4]) ? '' : String(row[base + 4]).trim(),
    startTime: parseExcelTime(row[base + 5]),
    endTime: parseExcelTime(row[base + 6]),
    target: parseNullableNumber(row[base + 7]),
    actual: parseNullableNumber(row[base + 8]),
    workHours: parseHours(row[base + 9]),
    general: isGeneralCropValue(cropValue),
  };
}

export function parseRecordSheet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'The Record sheet is empty.' };
  }
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    return { error: 'Could not find a Date / Employee Name header on the Record sheet.' };
  }

  const workersById = new Map();
  const blocks = [];
  const incomplete = [];
  const skippedRows = [];
  const dates = new Set();

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const employeeId = normalizeEmployeeId(row[1]);
    const workerName = isBlank(row[2]) ? '' : String(row[2]).trim();
    const recordDate = parseExcelDate(row[0]);
    if (!recordDate && !employeeId && !workerName) continue;

    if (!recordDate) {
      skippedRows.push({ rowIndex: i + 1, reason: 'Missing or invalid date' });
      continue;
    }
    if (!employeeId && !workerName) {
      skippedRows.push({ rowIndex: i + 1, reason: 'Missing employee ID and name' });
      continue;
    }

    const category = normalizeWorkerCategory(row[3]);
    dates.add(recordDate);
    if (employeeId && workerName && !workersById.has(employeeId)) {
      workersById.set(employeeId, {
        employeeId,
        name: workerName,
        category,
        rowIndex: i + 1,
      });
    }

    let taskSequence = 0;
    for (let t = 0; t < MAX_ACTIVITY_BLOCKS; t += 1) {
      const base = WORKER_COL_COUNT + t * BLOCK_WIDTH;
      const raw = parseRawBlock(row, base);
      if (historicalBlockIsBlank(raw)) continue;
      const parsedBlock = {
        rowIndex: i + 1,
        employeeId,
        workerName,
        category,
        recordDate,
        activity: raw.activity || null,
        unit: raw.unit,
        variety: raw.variety,
        location: raw.location,
        section: raw.section,
        startTime: raw.startTime,
        endTime: raw.endTime,
        target: raw.target,
        actual: raw.actual,
        workHours: raw.workHours,
        general: raw.general,
      };
      const error = historicalBlockError(parsedBlock);
      if (error) {
        incomplete.push({
          rowIndex: i + 1,
          employeeId,
          workerName,
          activity: parsedBlock.activity,
          reason: error,
        });
        continue;
      }
      taskSequence += 1;
      blocks.push({ ...parsedBlock, taskSequence });
    }
  }

  return {
    sheetName: 'Record',
    dates: [...dates].sort(),
    workers: [...workersById.values()],
    blocks,
    incomplete,
    skippedRows,
  };
}

export function parseManpowerWorkbook(workbook) {
  const sheetName = selectRecordSheetName(workbook?.SheetNames);
  if (!sheetName) {
    return { error: 'No Record sheet found in this file.' };
  }
  if (String(sheetName).trim().toLowerCase() === DATA_REFERENCE_SHEET) {
    return { error: 'This file has no Record sheet to import.' };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const parsed = parseRecordSheet(rows);
  if (parsed.error) return parsed;
  return { ...parsed, sheetName };
}

export function formatImportDateSummary(dates, fileCount) {
  const sorted = [...(dates || [])].filter(Boolean).sort();
  if (!sorted.length) return '—';
  const range = sorted[0] === sorted[sorted.length - 1]
    ? sorted[0]
    : `${sorted[0]} – ${sorted[sorted.length - 1]}`;
  const count = Number(fileCount) || 0;
  if (count > 1) return `${range} · ${count} files`;
  return range;
}

export function chunkItems(items, size = 400) {
  const chunks = [];
  const step = Number(size) > 0 ? Number(size) : 400;
  const list = items || [];
  for (let i = 0; i < list.length; i += step) {
    chunks.push(list.slice(i, i + step));
  }
  return chunks;
}

function withSourceFile(row, sourceFile) {
  if (!sourceFile) return row;
  return { ...row, sourceFile };
}

export function mergeParsedWorkbooks(parsedList) {
  const workersById = new Map();
  const blocks = [];
  const incomplete = [];
  const skippedRows = [];
  const dates = new Set();
  const items = parsedList || [];

  items.forEach((item) => {
    const parsed = item?.parsed || item;
    if (!parsed || parsed.error) return;
    const sourceFile = item.sourceFile || parsed.sourceFile || '';
    (parsed.dates || []).forEach((date) => dates.add(date));
    (parsed.workers || []).forEach((worker) => {
      if (worker.employeeId && !workersById.has(worker.employeeId)) {
        workersById.set(worker.employeeId, worker);
      }
    });
    (parsed.blocks || []).forEach((block) => {
      blocks.push({ ...withSourceFile(block, sourceFile), mergeIndex: blocks.length });
    });
    (parsed.incomplete || []).forEach((row) => {
      incomplete.push(withSourceFile(row, sourceFile));
    });
    (parsed.skippedRows || []).forEach((row) => {
      skippedRows.push(withSourceFile(row, sourceFile));
    });
  });

  blocks.sort((a, b) => {
    const dateCmp = String(a.recordDate).localeCompare(String(b.recordDate));
    if (dateCmp !== 0) return dateCmp;
    const idCmp = String(a.employeeId).localeCompare(String(b.employeeId));
    if (idCmp !== 0) return idCmp;
    const fileOrder = (a.mergeIndex || 0) - (b.mergeIndex || 0);
    if (fileOrder !== 0) return fileOrder;
    return (a.taskSequence || 0) - (b.taskSequence || 0);
  });

  const datesSorted = [...dates].sort();
  return {
    sheetName: items.length > 1 ? 'Record' : (items[0]?.parsed?.sheetName || items[0]?.sheetName || 'Record'),
    dates: datesSorted,
    workers: [...workersById.values()],
    blocks,
    incomplete,
    skippedRows,
    fileCount: items.length,
  };
}

function workerLookupMaps(existingWorkers) {
  const byId = new Map();
  const byName = new Map();
  (existingWorkers || []).forEach((worker) => {
    const employeeId = normalizeEmployeeId(worker.employee_id ?? worker.employeeId);
    if (employeeId) byId.set(employeeId, worker);
    const nameKey = String(worker.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!nameKey) return;
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(worker);
  });
  return { byId, byName };
}

export function mappedActivityName(name, nameMap) {
  const key = normalizeActivityAliasKey(name);
  if (nameMap && nameMap[key]) return nameMap[key];
  return String(name || '').trim();
}

export function canonicalActivityKey(name, nameMap) {
  return normalizeActivityAliasKey(mappedActivityName(name, nameMap));
}

function workerDateKey(workerId, recordDate) {
  return `${workerId}|${String(recordDate).slice(0, 10)}`;
}

export function indexExistingActivities(rows, nameMap) {
  const byMatch = new Map();
  const maxSeqByWorkerDate = new Map();
  (rows || []).forEach((row) => {
    const workerId = row.worker_id || row.workerId;
    const recordDate = String(row.record_date || row.recordDate || '').slice(0, 10);
    if (!workerId || !recordDate) return;
    const matchKey = `${workerDateKey(workerId, recordDate)}|${canonicalActivityKey(row.activity, nameMap)}`;
    if (!byMatch.has(matchKey)) byMatch.set(matchKey, []);
    byMatch.get(matchKey).push(row);
    const seq = Number(row.task_sequence ?? row.taskSequence) || 1;
    const dayKey = workerDateKey(workerId, recordDate);
    maxSeqByWorkerDate.set(dayKey, Math.max(maxSeqByWorkerDate.get(dayKey) || 0, seq));
  });
  byMatch.forEach((list) => {
    list.sort((a, b) => {
      const seqA = Number(a.task_sequence ?? a.taskSequence) || 1;
      const seqB = Number(b.task_sequence ?? b.taskSequence) || 1;
      if (seqA !== seqB) return seqA - seqB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  });
  return { byMatch, maxSeqByWorkerDate };
}

export function reviewDailyImport({
  parsed,
  existingWorkers,
  existingActivities,
  activityNameMap,
  activeSiteId,
}) {
  const { byId, byName } = workerLookupMaps(existingWorkers);
  const nameMap = activityNameMap || {};
  const { byMatch, maxSeqByWorkerDate } = indexExistingActivities(existingActivities, nameMap);
  const newWorkers = [];
  const newWorkerIds = new Set();
  const nameMismatches = [];
  const siteMismatches = [];
  const unmatched = [];
  const skippedExisting = [];
  const skippedExistingKeys = new Set();
  const occBySource = new Map();
  const acceptedSourceByOcc = new Map();
  const importableBlocks = [];
  const updatableBlocks = [];

  const resolveWorker = (employeeId, workerName, category) => {
    if (employeeId && byId.has(employeeId)) {
      const existing = byId.get(employeeId);
      if (workerName && !namesMatch(existing.name, workerName)) {
        nameMismatches.push({
          employeeId,
          excelName: workerName,
          appName: existing.name,
        });
      }
      if (activeSiteId && existing.site_id !== activeSiteId) {
        siteMismatches.push({
          employeeId,
          name: existing.name,
          workerSiteId: existing.site_id,
          activeSiteId,
        });
      }
      return { workerId: existing.id, employeeId, category: existing.category || category };
    }
    if (!employeeId && workerName) {
      const matches = byName.get(workerName.trim().toLowerCase().replace(/\s+/g, ' ')) || [];
      if (matches.length === 1) {
        return {
          workerId: matches[0].id,
          employeeId: normalizeEmployeeId(matches[0].employee_id),
          category: matches[0].category || category,
        };
      }
      unmatched.push({
        employeeId: '',
        name: workerName,
        reason: matches.length === 0
          ? 'Missing employee ID and no unique name match'
          : 'Missing employee ID and name matches more than one worker',
      });
      return null;
    }
    if (!employeeId) {
      unmatched.push({ employeeId: '', name: workerName, reason: 'Missing employee ID' });
      return null;
    }
    if (!newWorkerIds.has(employeeId)) {
      newWorkerIds.add(employeeId);
      newWorkers.push({
        employeeId,
        name: workerName || employeeId,
        category,
      });
    }
    return { workerId: null, employeeId, category };
  };

  const nextInsertSequence = (workerId, recordDate, sheetSequence) => {
    if (!workerId) return sheetSequence || 1;
    const dayKey = workerDateKey(workerId, recordDate);
    const current = maxSeqByWorkerDate.get(dayKey);
    if (current == null) {
      const seq = sheetSequence || 1;
      maxSeqByWorkerDate.set(dayKey, seq);
      return seq;
    }
    const seq = current + 1;
    maxSeqByWorkerDate.set(dayKey, seq);
    return seq;
  };

  const resolvedByRow = new Map();
  parsed.blocks.forEach((block) => {
    const key = `${block.employeeId}|${block.workerName}`;
    if (!resolvedByRow.has(key)) {
      resolvedByRow.set(key, resolveWorker(block.employeeId, block.workerName, block.category));
    }
    const resolved = resolvedByRow.get(key);
    if (!resolved) return;
    const sourceFile = block.sourceFile || '';
    const activityName = mappedActivityName(block.activity, nameMap);
    const activityKey = canonicalActivityKey(block.activity, nameMap);
    const occOwner = resolved.workerId || `emp:${resolved.employeeId || ''}`;
    const matchBase = `${occOwner}|${String(block.recordDate).slice(0, 10)}|${activityKey}`;
    const sourceOccKey = `${sourceFile}|${matchBase}`;
    const occ = occBySource.get(sourceOccKey) || 0;
    occBySource.set(sourceOccKey, occ + 1);
    const occBatchKey = `${matchBase}|${occ}`;
    const acceptedSource = acceptedSourceByOcc.get(occBatchKey);
    if (acceptedSource != null && acceptedSource !== sourceFile) {
      const batchDayKey = resolved.employeeId
        ? `emp:${resolved.employeeId}|${block.recordDate}`
        : `wid:${resolved.workerId || ''}|${block.recordDate}`;
      const dupKey = `${batchDayKey}|dup|${sourceFile}`;
      if (!skippedExistingKeys.has(dupKey)) {
        skippedExistingKeys.add(dupKey);
        skippedExisting.push({
          employeeId: resolved.employeeId,
          name: block.workerName,
          recordDate: block.recordDate,
          sourceFile,
          reason: 'duplicate activity in this import',
        });
      }
      return;
    }
    acceptedSourceByOcc.set(occBatchKey, sourceFile);

    const existingList = resolved.workerId
      ? (byMatch.get(`${workerDateKey(resolved.workerId, block.recordDate)}|${activityKey}`) || [])
      : [];
    const existing = existingList[occ];
    const shared = {
      ...block,
      activity: activityName,
      workerId: resolved.workerId,
      employeeId: resolved.employeeId,
      category: resolved.category,
    };

    if (existing?.id) {
      updatableBlocks.push({
        ...shared,
        existingRecordId: existing.id,
        taskSequence: Number(existing.task_sequence ?? existing.taskSequence) || shared.taskSequence,
      });
      return;
    }

    importableBlocks.push({
      ...shared,
      taskSequence: nextInsertSequence(resolved.workerId, block.recordDate, block.taskSequence),
    });
  });

  const uniqueNameMismatches = [];
  const seenMismatch = new Set();
  nameMismatches.forEach((item) => {
    const key = `${item.employeeId}|${item.appName}|${item.excelName}`;
    if (seenMismatch.has(key)) return;
    seenMismatch.add(key);
    uniqueNameMismatches.push(item);
  });
  const uniqueSiteMismatches = [];
  const seenSite = new Set();
  siteMismatches.forEach((item) => {
    if (seenSite.has(item.employeeId)) return;
    seenSite.add(item.employeeId);
    uniqueSiteMismatches.push(item);
  });

  return {
    dates: parsed.dates,
    sheetName: parsed.sheetName,
    workerCount: parsed.workers.length,
    newWorkers,
    newCasualCount: newWorkers.filter((w) => w.category === 'Casual').length,
    newPermanentCount: newWorkers.filter((w) => w.category === 'Permanent').length,
    nameMismatches: uniqueNameMismatches,
    siteMismatches: uniqueSiteMismatches,
    unmatched,
    skippedExisting,
    incomplete: parsed.incomplete || [],
    skippedRows: parsed.skippedRows || [],
    importableBlocks,
    updatableBlocks,
    sheetActivities: uniqueSheetActivities(parsed.blocks),
    generalBlockCount: [...importableBlocks, ...updatableBlocks].filter((b) => b.general).length,
    needsSiteForNewWorkers: newWorkers.length > 0 && !activeSiteId,
    fileCount: parsed.fileCount || 1,
  };
}

export function attachWorkerIds(blocks, existingWorkers) {
  const { byId } = workerLookupMaps(existingWorkers);
  const missing = [];
  const ready = [];
  (blocks || []).forEach((block) => {
    if (block.workerId) {
      ready.push(block);
      return;
    }
    const existing = byId.get(block.employeeId);
    if (!existing) {
      missing.push(block.employeeId);
      return;
    }
    ready.push({ ...block, workerId: existing.id });
  });
  return { records: ready, missing };
}

export function recordsPayloadFromBlocks(blocks) {
  return (blocks || []).map((block) => ({
    recordDate: block.recordDate,
    workerId: block.workerId,
    taskSequence: block.taskSequence,
    activity: block.activity,
    unit: block.unit || '',
    variety: block.variety || '',
    location: block.location || '',
    section: block.section || '',
    startTime: block.startTime,
    endTime: block.endTime,
    target: block.target,
    actual: block.actual,
    workHours: block.workHours,
  }));
}

export function updatesPayloadFromBlocks(blocks) {
  return (blocks || []).map((block) => ({
    id: block.existingRecordId,
    unit: block.unit || '',
    variety: block.variety || '',
    location: block.location || '',
    section: block.section || '',
    startTime: block.startTime,
    endTime: block.endTime,
    target: block.target,
    actual: block.actual,
    workHours: block.workHours,
    totalHours: block.workHours,
  }));
}

export function existingRecordKey(workerId, recordDate, activity, occurrence = 0) {
  const date = String(recordDate).slice(0, 10);
  if (activity == null) return `${workerId}|${date}`;
  return `${workerId}|${date}|${normalizeActivityAliasKey(activity)}|${occurrence}`;
}

export function normalizeActivityAliasKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function uniqueSheetActivities(blocks) {
  const seen = new Map();
  (blocks || []).forEach((block) => {
    const name = String(block.activity || '').trim();
    if (!name) return;
    const key = normalizeActivityAliasKey(name);
    if (!seen.has(key)) seen.set(key, name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function classifySheetActivities({ sheetActivities, catalog, aliases }) {
  const catalogOptions = (catalog || [])
    .filter((row) => row && row.name)
    .map((row) => ({ id: row.id || row.name, name: row.name }));
  const aliasMap = new Map();
  (aliases || []).forEach((row) => {
    const key = row.source_key || normalizeActivityAliasKey(row.source_name || row.sourceName);
    const target = row.activity_name || row.activityName;
    if (key && target) aliasMap.set(key, target);
  });

  const matched = [];
  const unmatched = [];
  uniqueSheetActivities((sheetActivities || []).map((name) => (
    typeof name === 'string' ? { activity: name } : name
  ))).forEach((sourceName) => {
    const key = normalizeActivityAliasKey(sourceName);
    const aliasTarget = aliasMap.get(key);
    if (aliasTarget) {
      matched.push({ sourceName, catalogName: aliasTarget, via: 'alias' });
      return;
    }
    const exact = catalogOptions.filter((opt) => normalizeActivityAliasKey(opt.name) === key);
    if (exact.length === 1) {
      matched.push({ sourceName, catalogName: exact[0].name, via: 'exact' });
      return;
    }
    const suggestion = matchMasterOption(sourceName, catalogOptions);
    unmatched.push({
      sourceName,
      suggestedName: suggestion?.confidence === 'close' ? suggestion.name : null,
    });
  });
  return { matched, unmatched };
}

export function activityNameMapFromResolution(matched, userMappings) {
  const map = {};
  (matched || []).forEach((item) => {
    map[normalizeActivityAliasKey(item.sourceName)] = item.catalogName;
  });
  Object.entries(userMappings || {}).forEach(([key, value]) => {
    const catalogName = String(value?.catalogName || '').trim();
    if (catalogName) map[key] = catalogName;
  });
  return map;
}

export function applyActivityNameMap(blocks, nameMap) {
  return (blocks || []).map((block) => {
    const mapped = nameMap[normalizeActivityAliasKey(block.activity)];
    if (!mapped) return block;
    return { ...block, activity: mapped };
  });
}

export function mappingsPayload(matched, unmatched, userMappings) {
  const payload = [];
  (matched || []).forEach((item) => {
    if (item.sourceName.trim() === item.catalogName.trim()) return;
    payload.push({
      sourceName: item.sourceName,
      action: 'connect',
      catalogName: item.catalogName,
    });
  });
  (unmatched || []).forEach((item) => {
    const choice = userMappings[normalizeActivityAliasKey(item.sourceName)];
    const catalogName = String(choice?.catalogName || '').trim();
    if (!choice?.action || !catalogName) return;
    payload.push({
      sourceName: item.sourceName,
      action: choice.action,
      catalogName,
    });
  });
  return payload;
}

export function allUnmatchedResolved(unmatched, userMappings) {
  if (!unmatched?.length) return true;
  return unmatched.every((item) => {
    const choice = userMappings[normalizeActivityAliasKey(item.sourceName)];
    return Boolean(choice?.action && String(choice.catalogName || '').trim());
  });
}
