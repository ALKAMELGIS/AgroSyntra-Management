jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { listTasks, createTask, updateTask, deleteTask } from '../task.service';

const mockQuery = dbPool.query as jest.Mock;

/**
 * listTasks issues the row query and a COUNT query together, in that order, so
 * both need a result. Postgres returns the count as a string.
 */
function mockListTasksQueries(rows: unknown[]) {
  mockQuery
    .mockResolvedValueOnce({ rows })
    .mockResolvedValueOnce({ rows: [{ total: String(rows.length) }] });
}

describe('Task Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listTasks', () => {
    it('returns tasks with correct structure', async () => {
      mockListTasksQueries([
        { id: 't1', title: 'Water Field A', status: 'pending', priority: 'high', assigned_to_name: 'Ahmed' },
        { id: 't2', title: 'Check EC levels', status: 'in_progress', priority: 'medium', assigned_to_name: 'Sara' },
      ]);

      const result = await listTasks({});
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].title).toBe('Water Field A');
      expect(result.tasks[1].status).toBe('in_progress');
      expect(result.total).toBe(2);
    });

    it('filters by status', async () => {
      mockListTasksQueries([]);
      await listTasks({ status: 'pending' });
      
      expect(mockQuery.mock.calls[0][0]).toContain('status');
      expect(mockQuery.mock.calls[0][1]).toContain('pending');
    });

    it('filters by assigned_to', async () => {
      mockListTasksQueries([]);
      await listTasks({ assigned_to: 'user-1' });
      
      expect(mockQuery.mock.calls[0][0]).toContain('assigned_to');
      expect(mockQuery.mock.calls[0][1]).toContain('user-1');
    });

    it('filters by priority', async () => {
      mockListTasksQueries([]);
      await listTasks({ priority: 'high' });
      
      expect(mockQuery.mock.calls[0][0]).toContain('priority');
      expect(mockQuery.mock.calls[0][1]).toContain('high');
    });
  });

  describe('createTask', () => {
    it('creates task with all required fields', async () => {
      const taskData = {
        title: 'New task',
        description: 'Description',
        priority: 'high',
        assigned_to: 'user-2',
        field_id: 'field-1',
        due_date: '2025-12-31',
        created_by: 'user-1',
      };

      mockQuery.mockResolvedValue({ rows: [{ id: 'task-1', ...taskData }] });
      const result = await createTask(taskData);
      
      expect(result.id).toBe('task-1');
      expect(result.title).toBe('New task');
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO tasks');
    });
  });

  describe('updateTask', () => {
    it('updates task status', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1', status: 'completed' }] });
      const result = await updateTask('t1', { status: 'completed' });
      
      expect(result.status).toBe('completed');
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE tasks');
    });
  });

  describe('deleteTask', () => {
    it('deletes task by id', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await deleteTask('t1');
      
      expect(mockQuery).toHaveBeenCalled();
      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('DELETE');
      expect(call[1]).toContain('t1');
    });
  });
});
