/**
 * One tank-mix application holds at most 3 products (main + 2 mixtures), on application
 * records (spray / drench sheets) and on work orders.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../seasons.service', () => ({
  assertFieldDateWritable: jest.fn(async () => undefined),
}));

import { dbPool } from '../../db/client';
import { MAX_PRODUCTS_PER_MIXTURE, alignMixtureItems, assertMixtureSizes } from '../../utils/mixtureGroups';
import {
  bulkCreatePesticideApplications,
  createPesticideApplication,
  updatePesticideApplication,
} from '../ipm.service';

const mockQuery = dbPool.query as jest.Mock;
const GROUP = '0b9c6f3e-5a8d-4c2e-9f1a-2b3c4d5e6f70';
const actor = { userId: 'u-1', role: 'pest_agronomist' } as any;

beforeEach(() => mockQuery.mockReset());

describe('assertMixtureSizes', () => {
  it('allows up to 3 rows per group and ignores rows without a group', () => {
    expect(MAX_PRODUCTS_PER_MIXTURE).toBe(3);
    expect(() => assertMixtureSizes([GROUP, GROUP, GROUP, null, undefined, 'other'])).not.toThrow();
    expect(() => assertMixtureSizes([GROUP, GROUP, GROUP, GROUP])).toThrow(/at most 3 products/);
  });
});

describe('alignMixtureItems', () => {
  it('copies the main row\'s times, machinery and completed by onto its mixtures only', () => {
    const items = [
      { groupId: GROUP, startTime: '07:00', endTime: '08:00', machineryRef: 'T-1', completedByName: 'Ravi', rate: '1ml' },
      { groupId: GROUP, isMixtureChild: true, startTime: '', machineryRef: 'x', rate: '2ml' },
      { groupId: null, startTime: '09:00' },
    ];
    const out = alignMixtureItems(items);
    expect(out[1]).toMatchObject({ startTime: '07:00', endTime: '08:00', machineryRef: 'T-1', completedByName: 'Ravi', rate: '2ml' });
    expect(out[0]).toBe(items[0]);
    expect(out[2]).toBe(items[2]);
  });

  it('leaves a mixture without its main row alone and can read the group from elsewhere', () => {
    const orphan = [{ groupId: GROUP, isMixtureChild: true, startTime: '05:00' }];
    expect(alignMixtureItems(orphan)[0].startTime).toBe('05:00');
    const stored: Record<string, string> = { a: GROUP, b: GROUP };
    const out = alignMixtureItems(
      [{ id: 'a', startTime: '06:00' }, { id: 'b', isMixtureChild: true, startTime: '' }],
      (it: any) => stored[it.id],
    );
    expect(out[1].startTime).toBe('06:00');
  });
});

describe('application records', () => {
  it('refuses a 4th product in a mixture before writing anything', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ n: 3 }] });
    await expect(createPesticideApplication({ groupId: GROUP, isMixtureChild: true }, actor, 'site-1'))
      .rejects.toMatchObject({ status: 400 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('FROM pesticide_applications');
    expect(mockQuery.mock.calls[0][1]).toEqual([GROUP, null]);
  });

  it('lets a 3rd product join a mixture of 2', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ n: 2 }] })
      .mockResolvedValue({ rows: [{ id: 'pa-3', field_id: null, phi_end_date: null }] });
    await expect(createPesticideApplication({ groupId: GROUP, isMixtureChild: true }, actor, null))
      .resolves.toBeDefined();
  });

  it('does not count when the row has no mixture group', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'pa-1', field_id: null, phi_end_date: null }] });
    await createPesticideApplication({}, actor, null);
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('COUNT(*)::int AS n'))).toBe(false);
  });

  it('refuses moving a row into a full mixture, but not editing a row already in it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ field_id: null, group_id: null }] })
      .mockResolvedValueOnce({ rows: [{ n: 3 }] });
    await expect(updatePesticideApplication('pa-9', { groupId: GROUP }, 'u-1', null))
      .rejects.toMatchObject({ status: 400 });

    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ field_id: null, group_id: GROUP }] })
      .mockResolvedValue({ rows: [{ id: 'pa-1' }] });
    await updatePesticideApplication('pa-1', { groupId: GROUP }, 'u-1', null);
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('COUNT(*)::int AS n'))).toBe(false);
  });

  it('refuses a bulk import with 4 products in one mixture', async () => {
    const rows = [1, 2, 3, 4].map(() => ({ groupId: GROUP }));
    await expect(bulkCreatePesticideApplications(rows, actor, null)).rejects.toMatchObject({ status: 400 });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
