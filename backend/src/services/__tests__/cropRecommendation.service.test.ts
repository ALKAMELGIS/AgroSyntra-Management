jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { recommendCrops } from '../cropRecommendation.service';

const mockQuery = dbPool.query as jest.Mock;

describe('CropRecommendation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupMocks = (options: {
    crops?: any[];
    field?: any;
    ecph?: any;
    weather?: any;
    yields?: any[];
  } = {}) => {
    mockQuery
      .mockResolvedValueOnce({ rows: options.crops || [{ id: 'c1', name: 'Tomato' }, { id: 'c2', name: 'Cucumber' }, { id: 'c3', name: 'Pepper' }] }) // crops
      .mockResolvedValueOnce({ rows: [options.field || { current_crop_id: 'c1', current_crop_name: 'Tomato' }] }) // field
      .mockResolvedValueOnce({ rows: [options.ecph || { avg_ec: '2.0', avg_ph: '6.5' }] }) // ecph
      .mockResolvedValueOnce({ rows: [options.weather || { avg_temp: '30', avg_humidity: '45' }] }) // weather
      .mockResolvedValueOnce({ rows: options.yields || [] }); // yields
  };

  it('returns top 5 recommendations', async () => {
    const crops = [];
    for (let i = 0; i < 10; i++) {
      crops.push({ id: `c${i}`, name: `Crop ${i}` });
    }
    setupMocks({ crops });

    const recs = await recommendCrops('field-1');
    expect(recs).toHaveLength(5);
  });

  it('penalizes currently planted crop', async () => {
    setupMocks();

    const recs = await recommendCrops('field-1');
    const currentCrop = recs.find((r) => r.crop_id === 'c1');
    const otherCrop = recs.find((r) => r.crop_id === 'c2');
    
    if (currentCrop && otherCrop) {
      expect(currentCrop.score).toBeLessThan(otherCrop.score);
    }
  });

  it('includes reasoning in each recommendation', async () => {
    setupMocks();

    const recs = await recommendCrops('field-1');
    recs.forEach((rec) => {
      expect(rec.reasoning).toBeDefined();
      expect(rec.reasoning.length).toBeGreaterThan(0);
      expect(rec.crop_name).toBeDefined();
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(100);
    });
  });

  it('mentions crop rotation in reasoning for current crop', async () => {
    setupMocks();

    const recs = await recommendCrops('field-1');
    const currentCrop = recs.find((r) => r.crop_id === 'c1');
    if (currentCrop) {
      expect(currentCrop.reasoning.some((r) => r.toLowerCase().includes('rotation'))).toBe(true);
    }
  });

  it('boosts score for crops with good EC range', async () => {
    setupMocks({ ecph: { avg_ec: '2.0', avg_ph: '6.0' } });

    const recs = await recommendCrops('field-1');
    // All non-current crops should get an EC boost
    const nonCurrent = recs.filter((r) => r.crop_id !== 'c1');
    nonCurrent.forEach((r) => {
      expect(r.reasoning.some((reason) => reason.toLowerCase().includes('ec'))).toBe(true);
    });
  });

  it('results are sorted by score descending', async () => {
    setupMocks();

    const recs = await recommendCrops('field-1');
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
  });

  it('handles missing ecph data gracefully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Tomato' }] })
      .mockResolvedValueOnce({ rows: [{ current_crop_id: null, current_crop_name: null }] })
      .mockResolvedValueOnce({ rows: [{ avg_ec: null, avg_ph: null }] })
      .mockResolvedValueOnce({ rows: [{ avg_temp: null, avg_humidity: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const recs = await recommendCrops('field-1');
    expect(recs.length).toBeGreaterThanOrEqual(0);
  });
});
