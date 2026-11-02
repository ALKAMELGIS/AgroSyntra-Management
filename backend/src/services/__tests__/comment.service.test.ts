jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { getComments, addComment, deleteComment } from '../comment.service';

const mockQuery = dbPool.query as jest.Mock;

describe('Comment Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getComments', () => {
    it('returns comments for an entity', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: 'c1', comment: 'Great harvest!', user_name: 'Ahmed', created_at: new Date() },
          { id: 'c2', comment: 'Needs more water', user_name: 'Sara', created_at: new Date() },
        ],
      });

      const comments = await getComments('harvest', 'harvest-1');
      expect(comments).toHaveLength(2);
      expect(comments[0].comment).toBe('Great harvest!');
    });

    it('passes entity_type and entity_id to query', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await getComments('field', 'field-123');
      
      expect(mockQuery.mock.calls[0][1]).toEqual(['field', 'field-123']);
    });

    it('orders by created_at ascending', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await getComments('harvest', 'h1');
      
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY ec.created_at ASC');
    });
  });

  describe('addComment', () => {
    it('creates a comment and returns it with user info', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [{ id: 'c1', comment: 'Test', user_name: 'Ahmed', user_email: 'a@test.com' }] }); // SELECT

      const result = await addComment('harvest', 'h1', 'user-1', 'Test');
      expect(result.id).toBe('c1');
      expect(result.user_name).toBe('Ahmed');
    });

    it('passes correct params to insert', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

      await addComment('field', 'f1', 'user-1', 'Nice field');
      
      const insertParams = mockQuery.mock.calls[0][1];
      expect(insertParams).toEqual(['field', 'f1', 'user-1', 'Nice field']);
    });
  });

  describe('deleteComment', () => {
    it('allows author to delete their own comment', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      
      const result = await deleteComment('c1', 'user-1', false);
      expect(result).toBe(true);
      expect(mockQuery.mock.calls[0][1]).toEqual(['c1', 'user-1']);
    });

    it('allows admin to delete any comment', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      
      const result = await deleteComment('c1', 'admin-1', true);
      expect(result).toBe(true);
      expect(mockQuery.mock.calls[0][1]).toEqual(['c1']); // no user_id check
    });

    it('returns false when comment not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      
      const result = await deleteComment('nonexistent', 'user-1', false);
      expect(result).toBe(false);
    });
  });
});
