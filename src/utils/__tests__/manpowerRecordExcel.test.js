import {
  buildManpowerRecordExportRows,
  fetchAllManpowerRecords,
  manpowerRecordExportHeaders,
  toExportYmd,
} from '../manpowerRecordExcel';

describe('toExportYmd', () => {
  it('keeps a calendar day from an ISO timestamp without UTC shift', () => {
    expect(toExportYmd('2026-09-17T00:00:00.000Z')).toBe('2026-09-17');
    expect(toExportYmd('2026-09-17')).toBe('2026-09-17');
  });
});

describe('buildManpowerRecordExportRows', () => {
  const headers = manpowerRecordExportHeaders();

  it('uses unique Activity 1–8 keys in a stable order', () => {
    expect(headers[0]).toBe('Date');
    expect(headers).toContain('Activity 1');
    expect(headers).toContain('Work Hours 1');
    expect(headers).toContain('Activity 2');
    expect(headers).toContain('Work Hours 8');
    expect(headers[headers.length - 1]).toBe('Total Hours');
    expect(headers.filter((h) => h === 'Activity')).toEqual([]);
  });

  it('always emits eight blocks so a one-task first row cannot drop later activities', () => {
    const rows = buildManpowerRecordExportRows([
      {
        date: '2026-09-17T00:00:00.000Z',
        employeeId: 'E1',
        workerName: 'Ali',
        workerCategory: 'Permanent',
        tasks: [{
          activity: 'Harvest',
          unit: 'kg',
          variety: 'Tomato',
          location: 'NH-1',
          section: 'A',
          start_time: '08:00:00',
          end_time: '12:00:00',
          target: '10',
          actual: '9',
          work_hours: '4',
        }],
        totalHours: 4,
      },
      {
        date: '2026-09-17',
        employeeId: 'E2',
        workerName: 'Omar',
        workerCategory: 'Casual',
        tasks: [
          {
            activity: 'Harvest',
            unit: 'kg',
            variety: 'Tomato',
            location: 'NH-1',
            section: 'A',
            start_time: '08:00',
            end_time: '11:00',
            target: 10,
            actual: 10,
            work_hours: 3,
          },
          {
            activity: 'Pruning',
            unit: 'plants',
            variety: 'Cucumber',
            location: 'GH-2',
            section: 'B',
            start_time: '13:00',
            end_time: '16:30',
            target: 20,
            actual: 18,
            work_hours: 3.5,
          },
        ],
        totalHours: 6.5,
      },
    ]);

    expect(Object.keys(rows[0])).toEqual(headers);
    expect(Object.keys(rows[1])).toEqual(headers);

    expect(rows[0].Date).toBe('2026-09-17');
    expect(rows[0]['Activity 1']).toBe('Harvest');
    expect(rows[0]['Start time 1']).toBe('08:00');
    expect(rows[0]['Work Hours 1']).toBe(4);
    expect(rows[0]['Activity 2']).toBe('');
    expect(rows[0]['Total Hours']).toBe(4);

    expect(rows[1]['Activity 1']).toBe('Harvest');
    expect(rows[1]['Activity 2']).toBe('Pruning');
    expect(rows[1]['Work Hours 2']).toBe(3.5);
    expect(rows[1]['Target 2']).toBe(20);
    expect(rows[1]['Total Hours']).toBe(6.5);
  });

  it('maps the second task onto Activity 2 when both blocks are filled', () => {
    const rows = buildManpowerRecordExportRows([{
      date: '2026-09-17',
      employeeId: 'E3',
      workerName: 'Sara',
      workerCategory: 'Permanent',
      tasks: [
        { activity: 'Harvest', work_hours: 2 },
        { activity: 'Packing', work_hours: 3 },
      ],
      totalHours: 5,
    }]);
    expect(rows[0]['Activity 1']).toBe('Harvest');
    expect(rows[0]['Activity 2']).toBe('Packing');
    expect(rows[0]['Work Hours 2']).toBe(3);
  });
});

describe('fetchAllManpowerRecords', () => {
  it('pages until the API total is consumed past the 100-row cap', async () => {
    const calls = [];
    const requestWithMeta = async (url) => {
      calls.push(url);
      const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset'));
      if (offset === 0) {
        return { data: Array.from({ length: 100 }, (_, i) => ({ id: i })), meta: { total: 150 } };
      }
      return { data: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })), meta: { total: 150 } };
    };

    const rows = await fetchAllManpowerRecords({ date: '2026-09-17' }, requestWithMeta);
    expect(rows).toHaveLength(150);
    expect(calls[0]).toContain('limit=100');
    expect(calls[0]).toContain('offset=0');
    expect(calls[1]).toContain('offset=100');
    expect(calls).toHaveLength(2);
  });
});
