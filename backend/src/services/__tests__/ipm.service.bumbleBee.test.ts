jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { validateBumbleBeeInspectionProposedPayload } from '../ipm.service';
import { AppError } from '../../utils/errors';

const mockQuery = dbPool.query as jest.Mock;

describe('validateBumbleBeeInspectionProposedPayload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when total is zero', async () => {
    await expect(
      validateBumbleBeeInspectionProposedPayload('field-1', {
        boxes100: 0,
        boxes80: 0,
        boxes60: 0,
        boxes40: 0,
        boxes20: 0,
        boxes0: 0,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects when total does not match deployment', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ box_count_total: 10, box_count: 10 }],
    });

    await expect(
      validateBumbleBeeInspectionProposedPayload('field-1', {
        boxes100: 5,
        boxes80: 0,
        boxes60: 0,
        boxes40: 0,
        boxes20: 0,
        boxes0: 0,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('does not match last deployment'),
    });
  });

  it('accepts when total matches deployment', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ box_count_total: 5, box_count: 5 }],
    });

    await expect(
      validateBumbleBeeInspectionProposedPayload('field-1', {
        boxes100: 3,
        boxes80: 2,
        boxes60: 0,
        boxes40: 0,
        boxes20: 0,
        boxes0: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
