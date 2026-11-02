jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));

import type { Response } from 'express';
import { recipesRouter, requireRecipeApprover } from '../v1/recipes.routes';
import type { AuthRequest } from '../middleware/auth';

function runGuard(role: string) {
  const next = jest.fn();
  const req = { user: { userId: 'u1', role } } as unknown as AuthRequest;
  requireRecipeApprover(req, {} as Response, next);
  return next.mock.calls[0][0];
}

describe('recipe approval route guard', () => {
  it('lets the operations manager approve', () => {
    expect(runGuard('operation_manager')).toBeUndefined();
  });

  it.each(['ceo', 'farm_manager', 'agronomist', 'supervisor'])('blocks %s with 403', (role) => {
    expect(runGuard(role)).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('mounts POST /:id/approve behind the operations-manager guard', () => {
    type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> } };
    const layer = (recipesRouter.stack as unknown as Layer[]).find(
      (l) => l.route?.path === '/:id/approve' && l.route.methods.post
    );
    expect(layer).toBeDefined();
    expect(layer!.route!.stack[0].handle).toBe(requireRecipeApprover);
  });
});
