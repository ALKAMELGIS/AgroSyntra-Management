import {
  buildSprayCalendarFieldRows,
  formatCalendarDate,
  dayTypeTooltip,
  formatClockTime,
  formatPhiEndDateTime,
} from '../sprayCalendarPhi';

describe('sprayCalendarPhi', () => {
  const year = 2026;
  const month = 0;
  const daysInMonth = 31;

  it('marks spray and PHI window through phi_end_date', () => {
    const apps = [{
      field_id: 'f1',
      field_name: 'GH-01',
      approval_status: 'approved',
      application_date: '2026-01-05',
      phi_end_date: '2026-01-08',
      product_name: 'Product A',
    }];

    const rows = buildSprayCalendarFieldRows({
      applications: apps,
      fields: [],
      year,
      month,
      daysInMonth,
      filterField: '',
    });

    expect(rows).toHaveLength(1);
    const days = rows[0][1].days;

    expect(days[formatCalendarDate(year, month, 5)].type).toBe('spray');
    expect(days[formatCalendarDate(year, month, 6)].type).toBe('phiActive');
    expect(days[formatCalendarDate(year, month, 7)].type).toBe('phiEnding');
    expect(days[formatCalendarDate(year, month, 8)].type).toBe('phiEnding');
    expect(days[formatCalendarDate(year, month, 9)]?.type || 'clear').toBe('clear');
  });

  it('only marks spray day when phi_end_date missing', () => {
    const apps = [{
      field_id: 'f1',
      field_name: 'GH-01',
      approval_status: 'approved',
      application_date: '2026-01-10',
      phi_end_date: null,
      product_name: 'Product B',
    }];

    const rows = buildSprayCalendarFieldRows({
      applications: apps,
      fields: [],
      year,
      month,
      daysInMonth,
      filterField: '',
    });

    const days = rows[0][1].days;
    expect(days['2026-01-10'].type).toBe('spray');
    expect(days['2026-01-11']?.type || 'clear').toBe('clear');
  });

  it('dayTypeTooltip describes PHI active', () => {
    expect(dayTypeTooltip({ type: 'phiActive', apps: [{}] })).toMatch(/No Harvest/i);
  });

  it('dayTypeTooltip includes PHI end time', () => {
    const phiEnd = '2026-06-30T12:04:00.000Z';
    const tip = dayTypeTooltip({
      type: 'phiActive',
      apps: [{ phi_end_date: phiEnd, application_end_time: '12:04' }],
    });
    expect(tip).toBe(`PHI Active - No Harvest (ends ${formatPhiEndDateTime(phiEnd, '12:04')})`);
    expect(tip).toMatch(/12:04 PM/);
  });
});

describe('formatClockTime', () => {
  it('formats as 12-hour AM/PM', () => {
    expect(formatClockTime('8:05')).toBe('8:05 AM');
    expect(formatClockTime('11:04')).toBe('11:04 AM');
    expect(formatClockTime('12:04')).toBe('12:04 PM');
    expect(formatClockTime('14:30:00')).toBe('2:30 PM');
    expect(formatClockTime('00:04')).toBe('12:04 AM');
  });

  it('returns dash when missing', () => {
    expect(formatClockTime('')).toBe('—');
    expect(formatClockTime(null)).toBe('—');
  });
});

describe('formatPhiEndDateTime', () => {
  it('uses application end clock, not UTC-shifted local hours', () => {
    const out = formatPhiEndDateTime('2026-06-30T12:04:00.000Z', '12:04');
    expect(out).toMatch(/12:04 PM/);
    expect(out).not.toMatch(/4:04/);
  });

  it('returns dash when missing', () => {
    expect(formatPhiEndDateTime('')).toBe('—');
    expect(formatPhiEndDateTime(null)).toBe('—');
  });
});
