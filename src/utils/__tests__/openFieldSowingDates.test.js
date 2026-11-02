import { applyOpenFieldSowingDates } from '../openFieldSowingDates';

describe('applyOpenFieldSowingDates', () => {
  it('leaves greenhouse dates independent', () => {
    expect(applyOpenFieldSowingDates('Greenhouse', '2026-01-01', '2026-02-01', 'seedingDate'))
      .toEqual({ seedingDate: '2026-01-01', transplantDate: '2026-02-01' });
  });

  it('copies seeding onto transplant for open field', () => {
    expect(applyOpenFieldSowingDates('Open Field', '2026-03-10', '', 'seedingDate'))
      .toEqual({ seedingDate: '2026-03-10', transplantDate: '2026-03-10' });
  });

  it('copies transplant back onto seeding for farm plots', () => {
    expect(applyOpenFieldSowingDates('Farm Plots', '2026-03-10', '2026-03-12', 'transplantDate'))
      .toEqual({ seedingDate: '2026-03-12', transplantDate: '2026-03-12' });
  });

  it('syncs both dates when the field becomes open field', () => {
    expect(applyOpenFieldSowingDates('Open Field', '2026-04-01', '', 'fieldId'))
      .toEqual({ seedingDate: '2026-04-01', transplantDate: '2026-04-01' });
  });
});
