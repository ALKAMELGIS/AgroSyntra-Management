import { coerceOpenFieldPlantingDates, isOpenFieldTypeName } from '../openFieldSowing';

describe('isOpenFieldTypeName', () => {
  it('treats Open Field and Farm Plots as sowing-in-place', () => {
    expect(isOpenFieldTypeName('Open Field')).toBe(true);
    expect(isOpenFieldTypeName('farm plots')).toBe(true);
  });

  it('leaves greenhouse and nethouse alone', () => {
    expect(isOpenFieldTypeName('Greenhouse')).toBe(false);
    expect(isOpenFieldTypeName('Nethouse')).toBe(false);
    expect(isOpenFieldTypeName(null)).toBe(false);
  });
});

describe('coerceOpenFieldPlantingDates', () => {
  it('sets transplant date to seeding date for open field', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ name: 'Open Field' }] }),
    };
    const out = await coerceOpenFieldPlantingDates(
      { fieldId: 'field-1', seedingDate: '2026-03-10', transplantDate: null },
      null,
      db as never,
    );
    expect(out.transplantDate).toBe('2026-03-10');
  });

  it('does not overwrite greenhouse transplant date', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [{ name: 'Greenhouse' }] }),
    };
    const out = await coerceOpenFieldPlantingDates(
      { fieldId: 'field-1', seedingDate: '2026-01-01', transplantDate: '2026-02-01' },
      null,
      db as never,
    );
    expect(out.transplantDate).toBe('2026-02-01');
  });
});
