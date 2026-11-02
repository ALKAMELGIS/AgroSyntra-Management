jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

// deliverWebhooks picks between the queue and a direct fetch based on
// isBullMQAvailable, which reads REDIS_URL at module load. Without these mocks
// the test's outcome depends on the environment it runs in, and importing the
// real queue modules opens an ioredis connection for the whole run.
jest.mock('../../jobs/bullQueue', () => ({
  isBullMQAvailable: jest.fn(),
}));
jest.mock('../../jobs/webhookQueue', () => ({
  enqueueWebhookDelivery: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

import { dbPool } from '../../db/client';
import { isBullMQAvailable } from '../../jobs/bullQueue';
import { enqueueWebhookDelivery } from '../../jobs/webhookQueue';
import { deliverWebhooks, createWebhook, listWebhooks, getDeliveries, deleteWebhook } from '../webhook.service';

const mockQuery = dbPool.query as jest.Mock;
const mockFetch = global.fetch as jest.Mock;
const mockIsBullMQAvailable = isBullMQAvailable as jest.Mock;
const mockEnqueue = enqueueWebhookDelivery as jest.Mock;

describe('Webhook Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsBullMQAvailable.mockReturnValue(false);
    mockEnqueue.mockResolvedValue(undefined);
  });

  describe('createWebhook', () => {
    it('creates a webhook with a generated secret', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: 'wh1', url: 'https://example.com/hook', events: ['harvest.created'] }],
      });

      const result = await createWebhook('user-1', 'https://example.com/hook', ['harvest.created']);
      expect(result.id).toBe('wh1');
      
      // Verify secret was generated (64 hex chars = 32 bytes)
      const insertParams = mockQuery.mock.calls[0][1];
      expect(insertParams[2]).toHaveLength(64); // hex string
    });
  });

  describe('listWebhooks', () => {
    it('returns webhooks for a user', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'wh1', url: 'https://a.com', events: ['harvest.created'] },
          { id: 'wh2', url: 'https://b.com', events: ['task.updated'] },
        ],
      });

      const hooks = await listWebhooks('user-1');
      expect(hooks).toHaveLength(2);
      expect(mockQuery.mock.calls[0][1]).toEqual(['user-1', 100]);
    });
  });

  describe('getDeliveries', () => {
    it('returns delivery history for a webhook', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'd1', event: 'harvest.created', status_code: 200 },
        ],
      });

      const deliveries = await getDeliveries('wh1');
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status_code).toBe(200);
    });
  });

  describe('deleteWebhook', () => {
    it('deletes by id and user_id', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      
      await deleteWebhook('wh1', 'user-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM webhooks WHERE id = $1 AND user_id = $2',
        ['wh1', 'user-1']
      );
    });
  });

  describe('deliverWebhooks', () => {
    it('fetches matching webhooks and delivers', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'wh1', url: 'https://example.com/hook', secret: 'abc123', events: ['harvest.created'], is_active: true }],
        })
        .mockResolvedValue({ rows: [] }); // delivery log insert

      mockFetch.mockResolvedValue({ status: 200, text: () => Promise.resolve('OK') });

      await deliverWebhooks('harvest.created', { id: 'h1' });
      
      // Give async delivery time to complete
      await new Promise((r) => setTimeout(r, 100));
      
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://example.com/hook');
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['X-Webhook-Event']).toBe('harvest.created');
    });

    it('skips delivery when no webhooks match', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await deliverWebhooks('nonexistent.event', {});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('queues delivery instead of sending it when BullMQ is available', async () => {
      mockIsBullMQAvailable.mockReturnValue(true);
      mockQuery.mockResolvedValue({
        rows: [{ id: 'wh1', url: 'https://example.com/hook', secret: 'abc123', events: ['harvest.created'], is_active: true }],
      });

      await deliverWebhooks('harvest.created', { id: 'h1' });

      expect(mockEnqueue).toHaveBeenCalledWith({
        webhookId: 'wh1',
        url: 'https://example.com/hook',
        secret: 'abc123',
        event: 'harvest.created',
        payload: { id: 'h1' },
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
