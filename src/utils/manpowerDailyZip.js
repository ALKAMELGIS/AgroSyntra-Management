import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { mergeParsedWorkbooks, parseManpowerWorkbook } from './manpowerDailyExcel';

export const MORE_THAN_A_MONTH_FILES = 40;

export function isZipFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.zip')
    || type === 'application/zip'
    || type === 'application/x-zip-compressed';
}

export function isJunkZipPath(path) {
  const normalized = String(path || '').replace(/\\/g, '/');
  const base = normalized.split('/').pop() || '';
  if (!base || base.startsWith('.')) return true;
  if (normalized.split('/').includes('__MACOSX')) return true;
  if (base.startsWith('~$')) return true;
  if (base.toLowerCase() === '.ds_store') return true;
  return false;
}

export function isExcelZipPath(path) {
  const lower = String(path || '').toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

export function fileImportPath(file) {
  return String(file?.importPath || file?.webkitRelativePath || file?.name || '').replace(/\\/g, '/');
}

export function listExcelZipEntries(zip) {
  const files = zip?.files || {};
  return Object.keys(files)
    .filter((name) => {
      const entry = files[name];
      if (!entry || entry.dir) return false;
      if (isJunkZipPath(name)) return false;
      return isExcelZipPath(name);
    })
    .sort((a, b) => a.localeCompare(b));
}

export function listExcelFolderFiles(files) {
  return Array.from(files || [])
    .filter((file) => {
      const path = fileImportPath(file);
      if (isJunkZipPath(path)) return false;
      return isExcelZipPath(path);
    })
    .sort((a, b) => fileImportPath(a).localeCompare(fileImportPath(b)));
}

export function folderImportLabel(files) {
  const list = Array.from(files || []);
  const n = list.length;
  const fileWord = n === 1 ? 'file' : 'files';
  const path = fileImportPath(list[0]);
  const root = path.split('/').filter(Boolean)[0];
  const baseName = String(list[0]?.name || '');
  if (root && root.toLowerCase() !== baseName.toLowerCase()) {
    return `${n} Excel ${fileWord} from ${root}`;
  }
  return `${n} Excel ${fileWord}`;
}

export function importFileCountWarning(count) {
  if (count <= MORE_THAN_A_MONTH_FILES) return null;
  return `This import has ${count} Excel files (more than a month). Existing worker-days will still be skipped.`;
}

export const FOLDER_DROP_ERROR = 'Drop the Excel files, not the folder.';

export function dataTransferHasDirectory(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  return items.some((item) => {
    if (!item || typeof item.webkitGetAsEntry !== 'function') return false;
    try {
      return Boolean(item.webkitGetAsEntry()?.isDirectory);
    } catch {
      return false;
    }
  });
}

export function filesFromDataTransfer(dataTransfer) {
  if (dataTransferHasDirectory(dataTransfer)) {
    return { error: FOLDER_DROP_ERROR };
  }
  const files = Array.from(dataTransfer?.files || []).filter(Boolean);
  if (files.length === 0) {
    return { error: FOLDER_DROP_ERROR };
  }
  return { files };
}

export function importSourceFromPickedFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (list.length === 0) {
    return { error: 'No file selected.' };
  }
  const zips = list.filter((file) => isZipFile(file));
  const excels = listExcelFolderFiles(list);
  if (zips.length > 0 && (zips.length > 1 || excels.length > 0)) {
    return { error: 'Pick either one zip or Excel files.' };
  }
  if (zips.length === 1) {
    return { source: { files: zips, label: zips[0].name } };
  }
  if (excels.length === 0) {
    return { error: 'No Excel files found.' };
  }
  if (excels.length === 1 && !excels[0].webkitRelativePath && !excels[0].importPath) {
    return { source: { files: excels, label: excels[0].name } };
  }
  return { source: { files: excels, label: folderImportLabel(excels) } };
}

function sourceNoun(kind) {
  if (kind === 'folder') return 'folder';
  if (kind === 'file') return 'file';
  return 'zip';
}

async function parseWorkbookSources(sources, onProgress, kind) {
  const noun = sourceNoun(kind);
  const parsedList = [];
  const failedFiles = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    onProgress?.({ current: i + 1, total: sources.length, name: source.name });
    try {
      const buffer = await source.read();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const parsed = parseManpowerWorkbook(workbook);
      if (parsed.error) {
        failedFiles.push({ name: source.name, reason: parsed.error });
        continue;
      }
      parsedList.push({ parsed, sourceFile: source.name });
    } catch (err) {
      failedFiles.push({ name: source.name, reason: err.message || 'Could not read this Excel file.' });
    }
  }
  if (parsedList.length === 0) {
    return {
      error: failedFiles[0]?.reason || `No Record sheets found in this ${noun}.`,
      failedFiles,
      fileCount: sources.length,
    };
  }
  return {
    parsed: mergeParsedWorkbooks(parsedList),
    failedFiles,
    fileCount: sources.length,
    warning: importFileCountWarning(sources.length),
  };
}

async function loadZipFile(file, onProgress) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = listExcelZipEntries(zip);
  if (names.length === 0) {
    return { error: 'No Excel files found in this zip.', failedFiles: [], fileCount: 0 };
  }
  const sources = names.map((name) => ({
    name,
    read: () => zip.files[name].async('arraybuffer'),
  }));
  return parseWorkbookSources(sources, onProgress, 'zip');
}

async function loadExcelFiles(files, onProgress, kind) {
  const sources = files.map((file) => ({
    name: fileImportPath(file),
    read: () => file.arrayBuffer(),
  }));
  return parseWorkbookSources(sources, onProgress, kind);
}

export async function loadDailyImportFiles(files, onProgress) {
  const list = Array.from(files || []).filter(Boolean);
  if (list.length === 0) {
    return { error: 'No file selected.', failedFiles: [], fileCount: 0 };
  }
  if (list.length === 1 && isZipFile(list[0])) {
    return loadZipFile(list[0], onProgress);
  }
  if (list.some((file) => isZipFile(file))) {
    return { error: 'Pick either one zip or Excel files.', failedFiles: [], fileCount: 0 };
  }
  const excelFiles = listExcelFolderFiles(list);
  if (excelFiles.length === 0) {
    const fromFolder = list.length > 1
      || Boolean(list[0]?.webkitRelativePath)
      || Boolean(list[0]?.importPath);
    return {
      error: fromFolder ? 'No Excel files found in this folder.' : 'No Excel files found.',
      failedFiles: [],
      fileCount: 0,
    };
  }
  const kind = excelFiles.some((file) => file.webkitRelativePath || file.importPath) || excelFiles.length > 1
    ? 'folder'
    : 'file';
  return loadExcelFiles(excelFiles, onProgress, kind);
}

export async function loadDailyImportFile(file, onProgress) {
  if (!file) return { error: 'No file selected.', failedFiles: [], fileCount: 0 };
  return loadDailyImportFiles([file], onProgress);
}
