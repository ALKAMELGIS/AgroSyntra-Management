import { droppedKeys } from '../middleware/validate';

describe('droppedKeys', () => {
  it('lists body fields the schema removed', () => {
    expect(droppedKeys({ name: 'a', minStockLevel: 3, empty: '' }, { name: 'a' })).toEqual(['minStockLevel']);
  });
  it('ignores non-objects and arrays', () => {
    expect(droppedKeys([1, 2], [1])).toEqual([]);
    expect(droppedKeys('x', 'x')).toEqual([]);
  });
});
