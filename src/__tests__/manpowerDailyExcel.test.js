import * as XLSX from 'xlsx';
import {
  attachWorkerIds,
  applyActivityNameMap,
  chunkItems,
  classifySheetActivities,
  excelFractionToTime,
  excelSerialToIsoDate,
  formatImportDateSummary,
  mappingsPayload,
  mergeParsedWorkbooks,
  normalizeEmployeeId,
  normalizeImportedVariety,
  normalizeWorkerCategory,
  parseExcelDate,
  parseHours,
  parseManpowerWorkbook,
  parseRecordSheet,
  recordsPayloadFromBlocks,
  reviewDailyImport,
  selectRecordSheetName,
  updatesPayloadFromBlocks,
} from '../utils/manpowerDailyExcel';

const HEADER = [
  'Date', 'ID', 'Employee Name', 'Employee Category',
  ...Array.from({ length: 8 }, () => (
    ['Activity', 'Unit', 'Crop', 'Location', 'Section', 'Start time', 'End time', 'Target', 'Work done Qty', 'Work Hours']
  )).flat(),
  'Total Hours',
];

function emptyBlock() {
  return ['', '', '', '', '', '', '', '', '', 0];
}

function hookBlock(overrides = {}) {
  return [
    overrides.activity ?? 'Hook installation ',
    overrides.unit ?? 'Bed',
    overrides.crop ?? 0,
    overrides.location ?? 'NH 13',
    overrides.section ?? 'All',
    overrides.start ?? 0.22916666666666666,
    overrides.end ?? 0.4791666666666667,
    overrides.target ?? 5.4,
    overrides.qty ?? 5,
    overrides.hours ?? 6,
  ];
}

function afternoonHook() {
  return hookBlock({
    start: 0.625,
    end: 0.7916666666666666,
    target: 3.6,
    qty: 4,
    hours: 3.999999999999999,
  });
}

describe('manpowerDailyExcel primitives', () => {
  it('maps Excel serial 45901 to 2025-09-01 without UTC shift', () => {
    expect(excelSerialToIsoDate(45901)).toBe('2025-09-01');
    expect(parseExcelDate(45901)).toBe('2025-09-01');
    expect(parseExcelDate('2025-09-01')).toBe('2025-09-01');
    expect(parseExcelDate('01/09/2025')).toBe('2025-09-01');
  });

  it('converts time fractions and carries 60 minutes', () => {
    expect(excelFractionToTime(0.22916666666666666)).toBe('05:30');
    expect(excelFractionToTime(0.4791666666666667)).toBe('11:30');
    expect(excelFractionToTime(0.625)).toBe('15:00');
    expect(excelFractionToTime(0.7916666666666666)).toBe('19:00');
    expect(excelFractionToTime(19 / 24)).toBe('19:00');
    expect(excelFractionToTime(18.999999999 / 24)).toBe('19:00');
  });

  it('normalizes ids, categories, crop 0, and hours', () => {
    expect(normalizeEmployeeId(4)).toBe('4');
    expect(normalizeEmployeeId(' 8853 ')).toBe('8853');
    expect(normalizeWorkerCategory('Permanent')).toBe('Permanent');
    expect(normalizeWorkerCategory('EAG')).toBe('Permanent');
    expect(normalizeWorkerCategory('casual')).toBe('Casual');
    expect(normalizeWorkerCategory('')).toBe('Casual');
    expect(normalizeImportedVariety(0)).toBe('');
    expect(normalizeImportedVariety('0')).toBe('');
    expect(normalizeImportedVariety('Astronaut')).toBe('Astronaut');
    expect(parseHours(3.999999999999999)).toBe(4);
    expect(parseHours(0)).toBe(0);
  });

  it('prefers Record and never Data reference', () => {
    expect(selectRecordSheetName(['Data reference', 'Record'])).toBe('Record');
    expect(selectRecordSheetName(['Data reference', 'Sheet1'])).toBe('Sheet1');
  });
});

describe('parseRecordSheet sample layout', () => {
  const rows = [
    HEADER,
    [45901, 4, 'SURESH SINGH DHAMI', 'Casual', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    [45901, 1, 'Bertrand Bigwanya', 'Casual', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    [45901, 8853, 'Wik Norsoongnoen', 'Permanent', ...hookBlock({ location: 'NH 9' }), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    [45901, 8832, 'Shyam Bahadur Basnet', 'Permanent',
      ...hookBlock({ activity: 'Transportation', unit: 'Ha', location: 'All Location', start: 0.22916666666666666, end: 0.3541666666666667, target: 3, qty: 3, hours: 3 }),
      ...hookBlock({ activity: 'Seeds Sowing', unit: 'Tray', location: 'Nursery', start: 0.3541666666666667, end: 0.4791666666666667, target: '', qty: '', hours: 3 }),
      ...hookBlock({ activity: 'Seeds Sowing', unit: 'Tray', location: 'Nursery', start: 0.625, end: 0.7916666666666666, target: '', qty: '', hours: 4 }),
      ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    ['', '', '', '', ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 0],
  ];

  it('parses 87-style blocks: crop 0, leftover hours 0, Excel targets', () => {
    const parsed = parseRecordSheet(rows);
    expect(parsed.error).toBeUndefined();
    expect(parsed.dates).toEqual(['2025-09-01']);
    expect(parsed.workers).toHaveLength(4);
    expect(parsed.workers.map((w) => w.category)).toEqual(['Casual', 'Casual', 'Permanent', 'Permanent']);
    expect(parsed.blocks).toHaveLength(9);
    expect(parsed.incomplete).toEqual([]);
    expect(parsed.blocks[0]).toMatchObject({
      recordDate: '2025-09-01',
      employeeId: '4',
      activity: 'Hook installation',
      unit: 'Bed',
      variety: '',
      location: 'NH 13',
      section: 'All',
      startTime: '05:30',
      endTime: '11:30',
      target: 5.4,
      actual: 5,
      workHours: 6,
      general: true,
      taskSequence: 1,
    });
    expect(parsed.blocks[1]).toMatchObject({
      employeeId: '4',
      startTime: '15:00',
      endTime: '19:00',
      target: 3.6,
      actual: 4,
      workHours: 4,
      taskSequence: 2,
    });
    expect(parsed.blocks.filter((b) => b.employeeId === '8832')).toHaveLength(3);
  });

  it('marks incomplete when location or times are missing', () => {
    const parsed = parseRecordSheet([
      HEADER,
      [45901, 4, 'SURESH SINGH DHAMI', 'Casual',
        ...hookBlock({ location: '' }),
        ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 6],
    ]);
    expect(parsed.blocks).toHaveLength(0);
    expect(parsed.incomplete[0].reason).toBe('Location is required');
  });
});

describe('parseManpowerWorkbook', () => {
  it('reads Record even when Data reference is first', () => {
    const wb = XLSX.utils.book_new();
    const ref = XLSX.utils.aoa_to_sheet([['', 'Activities'], ['', 'Hook installation']]);
    const record = XLSX.utils.aoa_to_sheet([
      HEADER,
      [45901, 4, 'SURESH SINGH DHAMI', 'Casual', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    ]);
    XLSX.utils.book_append_sheet(wb, ref, 'Data reference');
    XLSX.utils.book_append_sheet(wb, record, 'Record');
    const parsed = parseManpowerWorkbook(wb);
    expect(parsed.sheetName).toBe('Record');
    expect(parsed.blocks).toHaveLength(2);
  });
});

function existingActivity(overrides = {}) {
  return {
    id: overrides.id || 'rec-1',
    worker_id: overrides.worker_id || 'w-4',
    record_date: overrides.record_date || '2025-09-01',
    activity: overrides.activity || 'Hook installation',
    task_sequence: overrides.task_sequence ?? 1,
  };
}

function activityBlock(activity, hours, seq) {
  return {
    employeeId: '4',
    workerName: 'SURESH SINGH DHAMI',
    category: 'Casual',
    recordDate: '2025-09-01',
    activity,
    taskSequence: seq,
    unit: 'Bed',
    variety: '',
    location: 'NH 13',
    section: 'All',
    startTime: '05:30',
    endTime: '11:30',
    target: 5,
    actual: 5,
    workHours: hours,
    general: true,
  };
}

describe('reviewDailyImport', () => {
  const parsed = parseRecordSheet([
    HEADER,
    [45901, 4, 'SURESH SINGH DHAMI', 'Casual', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    [45901, 8853, 'Wik Norsoongnoen', 'Permanent', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
  ]);

  it('creates missing Casual and Permanent workers and reuses existing IDs', () => {
    const review = reviewDailyImport({
      parsed,
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI', category: 'Casual', site_id: 'site-1' },
      ],
      existingActivities: [],
      activeSiteId: 'site-1',
    });
    expect(review.newWorkers).toEqual([
      { employeeId: '8853', name: 'Wik Norsoongnoen', category: 'Permanent' },
    ]);
    expect(review.newPermanentCount).toBe(1);
    expect(review.importableBlocks).toHaveLength(4);
    expect(review.updatableBlocks).toHaveLength(0);
    expect(review.importableBlocks.filter((b) => b.workerId === 'w-4')).toHaveLength(2);
    expect(review.generalBlockCount).toBe(4);
  });

  it('warns on name and site mismatch without renaming', () => {
    const review = reviewDailyImport({
      parsed,
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'Someone Else', category: 'Casual', site_id: 'other-site' },
        { id: 'w-8853', employee_id: '8853', name: 'Wik Norsoongnoen', category: 'Permanent', site_id: 'site-1' },
      ],
      existingActivities: [],
      activeSiteId: 'site-1',
    });
    expect(review.nameMismatches).toEqual([
      { employeeId: '4', excelName: 'SURESH SINGH DHAMI', appName: 'Someone Else' },
    ]);
    expect(review.siteMismatches[0].employeeId).toBe('4');
    expect(review.importableBlocks.some((b) => b.workerId === 'w-4')).toBe(true);
  });

  it('updates the first Hook installation and still adds the afternoon block', () => {
    const review = reviewDailyImport({
      parsed,
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI', category: 'Casual', site_id: 'site-1' },
        { id: 'w-8853', employee_id: '8853', name: 'Wik Norsoongnoen', category: 'Permanent', site_id: 'site-1' },
      ],
      existingActivities: [existingActivity({ id: 'hook-am', task_sequence: 1 })],
      activeSiteId: 'site-1',
    });
    expect(review.updatableBlocks).toEqual([
      expect.objectContaining({
        employeeId: '4',
        activity: 'Hook installation',
        existingRecordId: 'hook-am',
        taskSequence: 1,
        workHours: 6,
      }),
    ]);
    expect(review.importableBlocks.filter((b) => b.employeeId === '4')).toEqual([
      expect.objectContaining({
        activity: 'Hook installation',
        taskSequence: 2,
        workHours: 4,
      }),
    ]);
    expect(review.skippedExisting).toEqual([]);
    expect(review.importableBlocks.filter((b) => b.employeeId === '8853')).toHaveLength(2);
  });

  it('updates Harvesting hours and adds Packing on the same day', () => {
    const review = reviewDailyImport({
      parsed: {
        dates: ['2025-09-01'],
        sheetName: 'Record',
        workers: [{ employeeId: '4', name: 'SURESH SINGH DHAMI', category: 'Casual' }],
        blocks: [
          activityBlock('Harvesting', 8, 1),
          activityBlock('Packing', 3, 2),
        ],
        incomplete: [],
        skippedRows: [],
      },
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI', category: 'Casual', site_id: 'site-1' },
      ],
      existingActivities: [existingActivity({ id: 'rec-h', activity: 'Harvesting', task_sequence: 1 })],
      activeSiteId: 'site-1',
    });
    expect(review.updatableBlocks).toEqual([
      expect.objectContaining({
        existingRecordId: 'rec-h',
        activity: 'Harvesting',
        workHours: 8,
        taskSequence: 1,
      }),
    ]);
    expect(review.importableBlocks).toEqual([
      expect.objectContaining({
        activity: 'Packing',
        workHours: 3,
        taskSequence: 2,
      }),
    ]);
    expect(updatesPayloadFromBlocks(review.updatableBlocks)[0]).toMatchObject({
      id: 'rec-h',
      workHours: 8,
      totalHours: 8,
    });
    expect(updatesPayloadFromBlocks(review.updatableBlocks)[0]).not.toHaveProperty('activity');
    expect(updatesPayloadFromBlocks(review.updatableBlocks)[0]).not.toHaveProperty('taskSequence');
  });

  it('matches a misspelled sheet activity to the catalog name already in Records', () => {
    const review = reviewDailyImport({
      parsed: {
        dates: ['2025-09-01'],
        sheetName: 'Record',
        workers: [{ employeeId: '4', name: 'SURESH SINGH DHAMI', category: 'Casual' }],
        blocks: [activityBlock('Supervisior', 6, 1)],
        incomplete: [],
        skippedRows: [],
      },
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI', category: 'Casual', site_id: 'site-1' },
      ],
      existingActivities: [existingActivity({ id: 'rec-s', activity: 'Supervisor' })],
      activityNameMap: { supervisior: 'Supervisor' },
      activeSiteId: 'site-1',
    });
    expect(review.updatableBlocks).toEqual([
      expect.objectContaining({
        existingRecordId: 'rec-s',
        activity: 'Supervisor',
        workHours: 6,
      }),
    ]);
    expect(review.importableBlocks).toHaveLength(0);
  });

  it('attaches ids after create and builds the bulk payload', () => {
    const review = reviewDailyImport({
      parsed,
      existingWorkers: [],
      existingActivities: [],
      activeSiteId: 'site-1',
    });
    const attached = attachWorkerIds(review.importableBlocks, [
      { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI' },
      { id: 'w-8853', employee_id: '8853', name: 'Wik Norsoongnoen' },
    ]);
    expect(attached.missing).toEqual([]);
    const payload = recordsPayloadFromBlocks(attached.records);
    expect(payload[0]).toMatchObject({
      recordDate: '2025-09-01',
      workerId: 'w-4',
      variety: '',
      target: 5.4,
      workHours: 6,
    });
  });

  it('lists sheet activities even when every block is an update', () => {
    const review = reviewDailyImport({
      parsed,
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI', category: 'Casual', site_id: 'site-1' },
        { id: 'w-8853', employee_id: '8853', name: 'Wik Norsoongnoen', category: 'Permanent', site_id: 'site-1' },
      ],
      existingActivities: [
        existingActivity({ id: 'h1', worker_id: 'w-4', task_sequence: 1 }),
        existingActivity({ id: 'h2', worker_id: 'w-4', task_sequence: 2 }),
        existingActivity({ id: 'h3', worker_id: 'w-8853', task_sequence: 1 }),
        existingActivity({ id: 'h4', worker_id: 'w-8853', task_sequence: 2 }),
      ],
      activeSiteId: 'site-1',
    });
    expect(review.importableBlocks).toHaveLength(0);
    expect(review.updatableBlocks).toHaveLength(4);
    expect(review.sheetActivities).toEqual(['Hook installation']);
  });
});

describe('classifySheetActivities', () => {
  const catalog = [
    { id: '1', name: 'Supervisor' },
    { id: '2', name: 'Hook Making' },
    { id: '3', name: 'Irrigation' },
  ];

  it('auto-matches exact catalog names and aliases, suggests unique close spellings', () => {
    const classified = classifySheetActivities({
      sheetActivities: ['Irrigation', 'Supervisior', 'Hook installation', 'Seeds Sowing'],
      catalog,
      aliases: [{ source_key: 'hook installation', source_name: 'Hook installation', activity_name: 'Hook Making' }],
    });
    expect(classified.matched).toEqual([
      { sourceName: 'Hook installation', catalogName: 'Hook Making', via: 'alias' },
      { sourceName: 'Irrigation', catalogName: 'Irrigation', via: 'exact' },
    ]);
    expect(classified.unmatched).toEqual([
      { sourceName: 'Seeds Sowing', suggestedName: null },
      { sourceName: 'Supervisior', suggestedName: 'Supervisor' },
    ]);
  });

  it('builds persist payload and rewrites activity names on blocks', () => {
    const classified = classifySheetActivities({
      sheetActivities: ['Supervisior', 'Seeds Sowing'],
      catalog,
      aliases: [],
    });
    const userMappings = {
      supervisior: { action: 'connect', catalogName: 'Supervisor' },
      'seeds sowing': { action: 'create', catalogName: 'Seeds Sowing' },
    };
    expect(mappingsPayload(classified.matched, classified.unmatched, userMappings)).toEqual([
      { sourceName: 'Seeds Sowing', action: 'create', catalogName: 'Seeds Sowing' },
      { sourceName: 'Supervisior', action: 'connect', catalogName: 'Supervisor' },
    ]);
    const mapped = applyActivityNameMap(
      [{ activity: 'Supervisior' }, { activity: 'Seeds Sowing' }],
      { supervisior: 'Supervisor', 'seeds sowing': 'Seeds Sowing' },
    );
    expect(mapped.map((b) => b.activity)).toEqual(['Supervisor', 'Seeds Sowing']);
  });
});

describe('mergeParsedWorkbooks and zip batch skip', () => {
  const dayOne = parseRecordSheet([
    HEADER,
    [45901, 4, 'SURESH SINGH DHAMI', 'Casual', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
  ]);
  const dayTwo = parseRecordSheet([
    HEADER,
    [45902, 4, 'SURESH SINGH DHAMI', 'Casual', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
    [45902, 8853, 'Wik Norsoongnoen', 'Permanent', ...hookBlock(), ...afternoonHook(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), ...emptyBlock(), 10],
  ]);

  it('merges two days: sorted dates, unique workers, concatenated blocks', () => {
    const merged = mergeParsedWorkbooks([
      { parsed: dayOne, sourceFile: 'Sep/01.xlsx' },
      { parsed: dayTwo, sourceFile: 'Sep/02.xlsx' },
    ]);
    expect(merged.dates).toEqual(['2025-09-01', '2025-09-02']);
    expect(merged.fileCount).toBe(2);
    expect(merged.workers).toHaveLength(2);
    expect(merged.blocks).toHaveLength(6);
    expect(merged.blocks[0].sourceFile).toBe('Sep/01.xlsx');
    expect(merged.blocks[merged.blocks.length - 1].sourceFile).toBe('Sep/02.xlsx');
    expect(formatImportDateSummary(merged.dates, merged.fileCount)).toBe('2025-09-01 – 2025-09-02 · 2 files');
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('skips a second file with the same sheet date instead of double-inserting', () => {
    const merged = mergeParsedWorkbooks([
      { parsed: dayOne, sourceFile: 'Sep/01.xlsx' },
      { parsed: dayOne, sourceFile: 'Sep/01-copy.xlsx' },
    ]);
    const review = reviewDailyImport({
      parsed: merged,
      existingWorkers: [],
      existingActivities: [],
      activeSiteId: 'site-1',
    });
    expect(review.importableBlocks).toHaveLength(2);
    expect(review.updatableBlocks).toHaveLength(0);
    expect(review.importableBlocks.every((b) => b.sourceFile === 'Sep/01.xlsx')).toBe(true);
    expect(review.skippedExisting[0]).toMatchObject({
      employeeId: '4',
      recordDate: '2025-09-01',
      sourceFile: 'Sep/01-copy.xlsx',
      reason: 'duplicate activity in this import',
    });
  });

  it('updates an existing worker-day in a zip and still imports the next day', () => {
    const merged = mergeParsedWorkbooks([
      { parsed: dayOne, sourceFile: 'Sep/01.xlsx' },
      { parsed: dayTwo, sourceFile: 'Sep/02.xlsx' },
    ]);
    const review = reviewDailyImport({
      parsed: merged,
      existingWorkers: [
        { id: 'w-4', employee_id: '4', name: 'SURESH SINGH DHAMI', category: 'Casual', site_id: 'site-1' },
      ],
      existingActivities: [
        existingActivity({ id: 'h1', task_sequence: 1 }),
        existingActivity({ id: 'h2', task_sequence: 2 }),
      ],
      activeSiteId: 'site-1',
    });
    expect(review.importableBlocks.every((b) => b.recordDate !== '2025-09-01' || b.employeeId !== '4')).toBe(true);
    expect(review.updatableBlocks.filter((b) => b.recordDate === '2025-09-01' && b.employeeId === '4')).toHaveLength(2);
    expect(review.importableBlocks.some((b) => b.recordDate === '2025-09-02')).toBe(true);
    expect(review.skippedExisting).toEqual([]);
  });
});
