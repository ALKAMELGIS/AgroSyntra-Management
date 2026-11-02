"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: {
        query: jest.fn(),
        connect: jest.fn(),
    },
}));
const client_1 = require("../../db/client");
const mockQuery = client_1.dbPool.query;
const mockConnect = client_1.dbPool.connect;
// Import the repository directly since the service is thin
const recipe_repository_1 = require("../../repositories/recipe.repository");
describe('Recipe Repository', () => {
    let repo;
    beforeEach(() => {
        jest.clearAllMocks();
        repo = new recipe_repository_1.RecipeRepository();
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
