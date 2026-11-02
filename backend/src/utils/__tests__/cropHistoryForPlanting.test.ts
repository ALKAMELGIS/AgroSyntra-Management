jest.mock('../fieldCropSync', () => ({
  autoClosePrevious: jest.fn().mockResolvedValue(undefined),
  syncFieldCrop: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/seasons.service', () => ({
  seasonIdForWritableField: jest.fn(),
}));

import { seasonIdForWritableField } from '../../services/seasons.service';
import { autoClosePrevious, syncFieldCrop } from '../fieldCropSync';
import {
  CROP_HISTORY_UPSERT_SQL,
  createCropHistoryForPlanting,
  rotationStartDate,
} from '../cropHistoryForPlanting';

const seasonId = seasonIdForWritableField as jest.Mock;
const autoClose = autoClosePrevious as jest.Mock;
const sync = syncFieldCrop as jest.Mock;

describe('createCropHistoryForPlanting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seasonId.mockResolvedValue('season-1');
  });

  it('reuses an open rotation for the same field, crop and season', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'hist-existing' }] }),
    };

    const id = await createCropHistoryForPlanting(
      'field-1', 'crop-1', null, '2026-09-08', client as never,
    );

    expect(id).toBe('hist-existing');
    expect(autoClose).not.toHaveBeenCalled();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('LEAST'))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
  });

  it('inserts once when 22 bay rows share a field, crop, season and date', async () => {
    let openId: string | null = null;
    const client = {
      query: jest.fn(async (sql: string) => {
        const text = String(sql);
        if (text.includes('SELECT id FROM crop_history')) {
          return { rows: openId ? [{ id: openId }] : [] };
        }
        if (text.includes('INSERT INTO crop_history')) {
          openId = 'hist-1';
          return { rows: [{ id: 'hist-1' }] };
        }
        if (text.includes('LEAST')) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const ids = [];
    for (let i = 0; i < 22; i += 1) {
      ids.push(await createCropHistoryForPlanting(
        'field-1', 'crop-1', null, '2026-09-08', client as never,
      ));
    }

    expect(new Set(ids)).toEqual(new Set(['hist-1']));
    const inserts = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO crop_history'));
    expect(inserts).toHaveLength(1);
    expect(autoClose).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(22);
  });

  it('uses seeding date when transplant is missing', () => {
    expect(rotationStartDate(null, '2026-03-01')).toBe('2026-03-01');
    expect(rotationStartDate('2026-04-01', '2026-03-01')).toBe('2026-04-01');
  });

  it('collapses a second insert for the same field, crop and start date', () => {
    expect(CROP_HISTORY_UPSERT_SQL).toContain('ON CONFLICT (field_id, crop_id, start_date)');
    expect(CROP_HISTORY_UPSERT_SQL).toContain('COALESCE(crop_history.variety_id, EXCLUDED.variety_id)');
  });
});
