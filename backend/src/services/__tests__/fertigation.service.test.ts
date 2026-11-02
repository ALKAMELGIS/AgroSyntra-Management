// The closed-season lock is covered in api/__tests__/dataEntryRoles.access.test.ts.
jest.mock('../seasons.service', () => ({
  assertFieldDateWritable: jest.fn(async () => undefined),
  assertFieldDateNotClosed: jest.fn(async () => undefined),
}));

import { FertigationService } from '../fertigation.service';

describe('FertigationService.bulkImport', () => {
  it('updates an existing field and date instead of skipping', async () => {
    const service = new FertigationService();
    const repo = (service as unknown as { repository: {
      findIdByFieldAndDate: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    } }).repository;
    repo.findIdByFieldAndDate = jest.fn().mockResolvedValue('entry-1');
    repo.update = jest.fn().mockResolvedValue({ id: 'entry-1' });
    repo.create = jest.fn();

    const out = await service.bulkImport([
      { fieldId: 'field-1', date: '2026-03-01', fertilizers: { Urea: 2 }, totalFertilizer: 2 },
    ]);

    expect(out).toEqual({ inserted: 0, updated: 1, skipped: 0, errors: [] });
    expect(repo.update).toHaveBeenCalledWith('entry-1', expect.objectContaining({
      date: '2026-03-01',
      fertilizers: { Urea: 2 },
    }));
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('inserts when the field and date are new', async () => {
    const service = new FertigationService();
    const repo = (service as unknown as { repository: {
      findIdByFieldAndDate: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    } }).repository;
    repo.findIdByFieldAndDate = jest.fn().mockResolvedValue(null);
    repo.update = jest.fn();
    repo.create = jest.fn().mockResolvedValue({ id: 'entry-2' });

    const out = await service.bulkImport([
      { fieldId: 'field-1', date: '2026-03-02' },
    ]);

    expect(out.inserted).toBe(1);
    expect(out.updated).toBe(0);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('FertigationService recipe approval', () => {
  type Internals = {
    repository: { findIdByFieldAndDate: jest.Mock; update: jest.Mock; create: jest.Mock };
    recipeRepository: { findStatuses: jest.Mock };
  };
  function setup(statuses: Record<string, string>) {
    const service = new FertigationService();
    const internals = service as unknown as Internals;
    internals.repository.findIdByFieldAndDate = jest.fn().mockResolvedValue(null);
    internals.repository.update = jest.fn().mockResolvedValue({ id: 'entry-1' });
    internals.repository.create = jest.fn().mockResolvedValue({ id: 'entry-1' });
    internals.recipeRepository.findStatuses = jest.fn().mockResolvedValue(new Map(Object.entries(statuses)));
    return { service, repo: internals.repository, recipeRepo: internals.recipeRepository };
  }

  it('create rejects a draft recipe', async () => {
    const { service, repo } = setup({ r1: 'draft' });
    await expect(service.create({ fieldId: 'f1', date: '2026-03-01', recipeId: 'r1' })).rejects.toMatchObject({
      status: 400,
      message: 'Recipe is not approved',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create rejects an unknown recipe', async () => {
    const { service, repo } = setup({});
    await expect(service.create({ fieldId: 'f1', date: '2026-03-01', recipeId: 'nope' })).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create accepts an approved recipe', async () => {
    const { service, repo } = setup({ r1: 'approved' });
    await service.create({ fieldId: 'f1', date: '2026-03-01', recipeId: 'r1' });
    expect(repo.create).toHaveBeenCalled();
  });

  it('create without a recipe skips the check', async () => {
    const { service, repo, recipeRepo } = setup({});
    await service.create({ fieldId: 'f1', date: '2026-03-01' });
    expect(repo.create).toHaveBeenCalled();
    expect(recipeRepo.findStatuses).not.toHaveBeenCalled();
  });

  it('update rejects switching to a draft recipe', async () => {
    const { service, repo } = setup({ r1: 'draft' });
    (repo as unknown as { getById: jest.Mock }).getById = jest.fn().mockResolvedValue({ id: 'entry-1', recipeId: 'r0' });
    await expect(service.update('entry-1', { recipeId: 'r1' })).rejects.toMatchObject({ status: 400 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('update keeps an entry whose existing recipe went back to draft', async () => {
    const { service, repo } = setup({ r1: 'draft' });
    (repo as unknown as { getById: jest.Mock }).getById = jest.fn().mockResolvedValue({ id: 'entry-1', recipeId: 'r1' });
    await service.update('entry-1', { recipeId: 'r1', valvesCount: 3 });
    expect(repo.update).toHaveBeenCalled();
  });

  it('bulkImport rejects only the rows with an unapproved recipe', async () => {
    const { service, repo } = setup({ ok: 'approved', draft: 'draft' });
    const out = await service.bulkImport([
      { fieldId: 'f1', date: '2026-03-01', recipeId: 'ok' },
      { fieldId: 'f1', date: '2026-03-02', recipeId: 'draft' },
      { fieldId: 'f1', date: '2026-03-03', recipeId: 'unknown' },
      { fieldId: 'f1', date: '2026-03-04' },
    ]);
    expect(out.inserted).toBe(2);
    expect(out.errors).toEqual(['Entry 2: Recipe is not approved', 'Entry 3: Recipe is not approved']);
    expect(repo.create).toHaveBeenCalledTimes(2);
  });
});
