jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import api from '../api';
import { listAllPesticideApplications } from '../listPesticideApplications';

describe('listAllPesticideApplications', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('pages until every matching row is loaded', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: [{ id: 'a' }, { id: 'b' }], meta: { total: 3 } } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'c' }], meta: { total: 3 } } });

    const { items, meta } = await listAllPesticideApplications(new URLSearchParams(), 2);

    expect(items.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(meta.total).toBe(3);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get.mock.calls[0][0]).toContain('page=1');
    expect(api.get.mock.calls[1][0]).toContain('page=2');
  });
});
