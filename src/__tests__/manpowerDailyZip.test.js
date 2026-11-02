import {
  FOLDER_DROP_ERROR,
  filesFromDataTransfer,
  folderImportLabel,
  importFileCountWarning,
  importSourceFromPickedFiles,
  isExcelZipPath,
  isJunkZipPath,
  listExcelFolderFiles,
  listExcelZipEntries,
  loadDailyImportFiles,
} from '../utils/manpowerDailyZip';

function fakeFile(name, extra = {}) {
  if (typeof extra === 'string') {
    return { name, webkitRelativePath: extra };
  }
  return { name, webkitRelativePath: '', ...extra };
}

describe('manpowerDailyZip listing', () => {
  it('keeps nested xlsx and skips junk, lock files, and non-excel', () => {
    expect(isJunkZipPath('__MACOSX/._01.xlsx')).toBe(true);
    expect(isJunkZipPath('Sep/~$Format.xlsx')).toBe(true);
    expect(isJunkZipPath('.DS_Store')).toBe(true);
    expect(isExcelZipPath('2025/Sep/01.xlsx')).toBe(true);
    expect(isExcelZipPath('notes.txt')).toBe(false);

    const zip = {
      files: {
        '2025/Sep/01.xlsx': { dir: false },
        '2025/Sep/02.xls': { dir: false },
        '2025/Sep/': { dir: true },
        '__MACOSX/._01.xlsx': { dir: false },
        'Sep/~$Format.xlsx': { dir: false },
        'readme.txt': { dir: false },
        '.DS_Store': { dir: false },
      },
    };
    expect(listExcelZipEntries(zip)).toEqual([
      '2025/Sep/01.xlsx',
      '2025/Sep/02.xls',
    ]);
  });

  it('keeps nested month folder Excel files and skips junk', () => {
    const files = [
      fakeFile('01.xlsx', 'Manpower - 2025/Sep/01.xlsx'),
      fakeFile('02.xls', 'Manpower - 2025/Oct/02.xls'),
      fakeFile('notes.txt', 'Manpower - 2025/readme.txt'),
      fakeFile('01.xlsx', '__MACOSX/._01.xlsx'),
      fakeFile('Format.xlsx', 'Manpower - 2025/Sep/~$Format.xlsx'),
      fakeFile('.DS_Store', 'Manpower - 2025/.DS_Store'),
    ];
    expect(listExcelFolderFiles(files).map((file) => file.webkitRelativePath)).toEqual([
      'Manpower - 2025/Oct/02.xls',
      'Manpower - 2025/Sep/01.xlsx',
    ]);
    expect(folderImportLabel(listExcelFolderFiles(files))).toBe(
      '2 Excel files from Manpower - 2025',
    );
    expect(folderImportLabel([fakeFile('01.xlsx')])).toBe('1 Excel file');
  });

  it('returns a folder error when a folder has no Excel files', async () => {
    const result = await loadDailyImportFiles([
      fakeFile('notes.txt', 'Manpower - 2025/readme.txt'),
      fakeFile('.DS_Store', 'Manpower - 2025/.DS_Store'),
    ]);
    expect(result.error).toBe('No Excel files found in this folder.');
    expect(result.fileCount).toBe(0);
  });

  it('warns when an import has more than a month of Excel files', () => {
    expect(importFileCountWarning(40)).toBeNull();
    expect(importFileCountWarning(41)).toBe(
      'This import has 41 Excel files (more than a month). Existing worker-days will still be skipped.',
    );
  });

  it('lets Import take several Excel files and rejects a zip mixed with Excel', () => {
    const many = importSourceFromPickedFiles([
      fakeFile('V14.xlsx'),
      fakeFile('V15.xlsx'),
    ]);
    expect(many.error).toBeUndefined();
    expect(many.source.label).toBe('2 Excel files');
    expect(many.source.files).toHaveLength(2);

    const mixed = importSourceFromPickedFiles([
      fakeFile('Manpower - 2025.zip'),
      fakeFile('V14.xlsx'),
    ]);
    expect(mixed.error).toBe('Pick either one zip or Excel files.');

    const zipOnly = importSourceFromPickedFiles([fakeFile('Manpower - 2025.zip')]);
    expect(zipOnly.source.label).toBe('Manpower - 2025.zip');
  });

  it('treats several dropped Excels as one import and rejects a dropped folder', () => {
    const many = importSourceFromPickedFiles([
      fakeFile('V14.xlsx'),
      fakeFile('V15.xlsx'),
    ]);
    expect(many.source.label).toBe('2 Excel files');

    expect(filesFromDataTransfer({
      items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }],
      files: [],
    }).error).toBe(FOLDER_DROP_ERROR);

    expect(filesFromDataTransfer({ items: [], files: [] }).error).toBe(FOLDER_DROP_ERROR);

    const droppedFiles = filesFromDataTransfer({
      items: [
        { webkitGetAsEntry: () => ({ isDirectory: false, isFile: true }) },
        { webkitGetAsEntry: () => ({ isDirectory: false, isFile: true }) },
      ],
      files: [fakeFile('V14.xlsx'), fakeFile('V15.xlsx')],
    });
    expect(droppedFiles.files).toHaveLength(2);
    expect(importSourceFromPickedFiles(droppedFiles.files).source.label).toBe('2 Excel files');
  });
});
