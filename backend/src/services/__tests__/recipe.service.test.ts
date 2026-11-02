jest.mock('../../db/client', () => ({
  dbPool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

import { dbPool } from '../../db/client';

const mockQuery = dbPool.query as jest.Mock;
const mockConnect = dbPool.connect as jest.Mock;

// Import the repository directly since the service is thin
import { RecipeRepository } from '../../repositories/recipe.repository';
import { RecipeService, assertRecipesApproved } from '../recipe.service';
import * as auditLog from '../auditLog.service';

describe('Recipe Repository', () => {
  let repo: RecipeRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new RecipeRepository();
  });

  describe('list', () => {
    it('excludes soft-deleted recipes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1' }, { id: 'r2', name: 'R2' }, { id: 'r3', name: 'R3' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await repo.list({});
      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('deleted_at IS NULL');
      expect(result.items).toHaveLength(3);
    });

    it('returns pagination info', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({ rows: Array(20).fill({ id: 'rx', name: 'test' }) })
        .mockResolvedValueOnce({ rows: [] });

      const result = await repo.list({ page: 1, limit: 20 });
      expect(result.total).toBe(25);
    });
  });

  describe('getById', () => {
    it('returns recipe with fertilizers', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'f1', name: 'NPK', dose: 10 }] });

      const recipe = await repo.getById('r1');
      expect(recipe.name).toBe('R1');
      expect(recipe.fertilizers).toHaveLength(1);
    });

    it('throws NotFoundError for missing recipe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repo.getById('nonexistent')).rejects.toThrow('Recipe not found');
    });

    it('excludes soft-deleted recipes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repo.getById('deleted-id')).rejects.toThrow();
      expect(mockQuery.mock.calls[0][0]).toContain('deleted_at IS NULL');
    });
  });

  describe('approval status', () => {
    function mockClient() {
      const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'r1', name: 'R1', status: 'draft' }], rowCount: 1 }), release: jest.fn() };
      mockConnect.mockResolvedValue(client);
      return client;
    }

    it('maps status and approval fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1', status: 'approved', approved_by: 'u1', approved_at: '2026-01-01' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });
      const recipe = await repo.getById('r1');
      expect(recipe.status).toBe('approved');
      expect(recipe.approvedBy).toBe('u1');
    });

    it('creates new recipes as draft', async () => {
      const client = mockClient();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1', status: 'draft' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });
      const recipe = await repo.create({ name: 'R1' });
      const insert = client.query.mock.calls.find((c: unknown[]) => String(c[0]).includes('INSERT INTO recipes'));
      expect(insert[0]).toContain("'draft'");
      expect(recipe.status).toBe('draft');
    });

    it('sends an edited recipe back to draft and clears the approval', async () => {
      const client = mockClient();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R2', status: 'draft' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });
      await repo.update('r1', { name: 'R2' });
      const update = client.query.mock.calls.find((c: unknown[]) => String(c[0]).includes('UPDATE recipes'));
      expect(update[0]).toContain("status = 'draft'");
      expect(update[0]).toContain('approved_by = NULL');
      expect(update[0]).toContain('approved_at = NULL');
    });

    it('resets to draft when only fertilizers change', async () => {
      const client = mockClient();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1', status: 'draft' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });
      await repo.update('r1', { fertilizers: [{ name: 'Urea' }] });
      const update = client.query.mock.calls.find((c: unknown[]) => String(c[0]).includes('UPDATE recipes'));
      expect(update[0]).toContain("status = 'draft'");
    });

    it('approves a draft recipe and records who approved it', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ status: 'draft' }], rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1', status: 'approved', approved_by: 'u1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });
      const { recipe, alreadyApproved } = await repo.approve('r1', 'u1');
      expect(alreadyApproved).toBe(false);
      expect(mockQuery.mock.calls[1][0]).toContain("status = 'approved'");
      expect(mockQuery.mock.calls[1][1]).toEqual(['r1', 'u1']);
      expect(recipe.status).toBe('approved');
    });

    it('approve is idempotent for an already approved recipe', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ status: 'approved' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'r1', name: 'R1', status: 'approved' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });
      const { alreadyApproved } = await repo.approve('r1', 'u2');
      expect(alreadyApproved).toBe(true);
      expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('UPDATE recipes'))).toBe(false);
    });

    it('approve throws NotFound for a missing recipe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repo.approve('missing', 'u1')).rejects.toThrow('Recipe not found');
    });
  });

  describe('delete', () => {
    it('performs soft delete', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await repo.delete('r1');
      expect(mockQuery.mock.calls[0][0]).toContain('SET deleted_at');
      expect(mockQuery.mock.calls[0][0]).not.toContain('DELETE FROM');
    });

    it('throws for non-existent recipe', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      await expect(repo.delete('nonexistent')).rejects.toThrow('Recipe not found');
    });
  });
});

describe('RecipeService.approve', () => {
  beforeEach(() => jest.clearAllMocks());

  it('audits a draft -> approved change', async () => {
    const spy = jest.spyOn(auditLog, 'logAuditEvent').mockResolvedValue();
    const service = new RecipeService();
    const repo = (service as unknown as { repository: { approve: jest.Mock } }).repository;
    repo.approve = jest.fn().mockResolvedValue({ recipe: { id: 'r1', name: 'R1', status: 'approved' }, alreadyApproved: false });

    const recipe = await service.approve('r1', 'u1');
    expect(recipe.status).toBe('approved');
    expect(repo.approve).toHaveBeenCalledWith('r1', 'u1');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVE', entity: 'recipe', entityId: 'r1', userId: 'u1' })
    );
  });

  it('does not audit when the recipe was already approved', async () => {
    const spy = jest.spyOn(auditLog, 'logAuditEvent').mockResolvedValue();
    const service = new RecipeService();
    const repo = (service as unknown as { repository: { approve: jest.Mock } }).repository;
    repo.approve = jest.fn().mockResolvedValue({ recipe: { id: 'r1', status: 'approved' }, alreadyApproved: true });

    await service.approve('r1', 'u1');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('assertRecipesApproved', () => {
  const repoWith = (entries: Record<string, string>) => ({
    findStatuses: jest.fn().mockResolvedValue(new Map(Object.entries(entries))),
  });

  it('ignores null / undefined recipe ids without querying', async () => {
    const repo = repoWith({});
    await expect(assertRecipesApproved([null, undefined], repo)).resolves.toBeUndefined();
    expect(repo.findStatuses).not.toHaveBeenCalled();
  });

  it('accepts approved recipes', async () => {
    await expect(assertRecipesApproved(['r1'], repoWith({ r1: 'approved' }))).resolves.toBeUndefined();
  });

  it('rejects a draft recipe with a 400 validation error', async () => {
    await expect(assertRecipesApproved(['r1'], repoWith({ r1: 'draft' }))).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Recipe is not approved',
    });
  });

  it('rejects an unknown recipe', async () => {
    await expect(assertRecipesApproved(['missing'], repoWith({}))).rejects.toMatchObject({ status: 400 });
  });
});
