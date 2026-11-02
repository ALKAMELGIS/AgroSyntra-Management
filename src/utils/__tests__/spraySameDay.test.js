import {
  applicationDateYmd,
  filterSameDaySprays,
  formatSameDaySprayLine,
} from '../spraySameDay';

describe('spraySameDay', () => {
  const switchMorning = {
    id: 'a1',
    field_id: 'f1',
    application_date: '2026-09-01',
    application_start_time: '08:00:00',
    product_name: 'Switch',
    approval_status: 'approved',
  };

  it('normalizes ISO application_date to YMD', () => {
    expect(applicationDateYmd({ application_date: '2026-09-01T00:00:00.000Z' })).toBe('2026-09-01');
    expect(applicationDateYmd({ applicationDate: '2026-09-01' })).toBe('2026-09-01');
  });

  it('lists other sprays on the same field and date, including a different product', () => {
    const hits = filterSameDaySprays([
      switchMorning,
      {
        id: 'a2',
        field_id: 'f1',
        application_date: '2026-09-01',
        application_start_time: '16:00',
        product_name: 'Score',
        approval_status: 'pending',
      },
      {
        id: 'a3',
        field_id: 'f2',
        application_date: '2026-09-01',
        product_name: 'Other field',
        approval_status: 'approved',
      },
      {
        id: 'a4',
        field_id: 'f1',
        application_date: '2026-09-02',
        product_name: 'Next day',
        approval_status: 'approved',
      },
    ], { fieldId: 'f1', dateYmd: '2026-09-01' });

    expect(hits.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('skips rejected applications and the row being edited', () => {
    const hits = filterSameDaySprays([
      switchMorning,
      { ...switchMorning, id: 'rej', approval_status: 'rejected', product_name: 'Rejected' },
    ], { fieldId: 'f1', dateYmd: '2026-09-01', excludeId: 'a1' });

    expect(hits).toEqual([]);
  });

  it('formats product and clock time', () => {
    expect(formatSameDaySprayLine(switchMorning)).toBe('Switch 8:00 AM');
    expect(formatSameDaySprayLine({
      product_name: 'Score',
      application_end_time: '16:30',
    })).toBe('Score 4:30 PM');
    expect(formatSameDaySprayLine({ product_name: 'No time' })).toBe('No time');
  });
});
