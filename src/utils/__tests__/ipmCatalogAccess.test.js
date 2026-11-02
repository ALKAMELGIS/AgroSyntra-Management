import { canEditIpmCatalog } from '../ipmAccess';

describe('canEditIpmCatalog', () => {
  it('lets workers, the pest agronomist and the IPM admin edit', () => {
    expect(canEditIpmCatalog({ role: 'worker', email: 'w@example.com' })).toBe(true);
    expect(canEditIpmCatalog({ role: 'pest_agronomist', email: 'p@example.com' })).toBe(true);
    expect(canEditIpmCatalog({ role: 'ceo', email: 'abdullah@elite.com' })).toBe(true);
  });

  it('leaves everyone else watching', () => {
    for (const role of ['agronomist', 'ceo', 'farm_manager', 'operation_manager', 'scouter', 'operator', 'auditor']) {
      expect(canEditIpmCatalog({ role, email: `${role}@example.com` })).toBe(false);
    }
    expect(canEditIpmCatalog(null)).toBe(false);
  });
});
