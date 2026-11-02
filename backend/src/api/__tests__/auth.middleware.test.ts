import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/errors';

jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

jest.mock('../../cache/client', () => ({
  redisClient: { get: jest.fn(), setex: jest.fn() },
}));

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-at-least-32-chars';

import { auth, authorize, authorizeFieldStaffRead, optionalAuth } from '../middleware/auth';
import { assertCanApproveApplication, canCreatePesticideApplication, resolveInitialApproval } from '../../utils/ipmAccess';

function mockReqResNext(headers: Record<string, string> = {}) {
  const req = {
    headers: { ...headers },
  } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction & jest.Mock;
  return { req, res, next };
}

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('auth (JWT)', () => {
    // Once the token verifies, auth hands the request to tenantMiddleware, which
    // is async, so this has to await rather than assert on the next line. The
    // organizationId claim also keeps that middleware off its database fallback
    // for legacy tokens, since dbPool is mocked here.
    it('passes with valid JWT token and attaches user', async () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@test.com', role: 'farm_manager', organizationId: 'org-1' },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );
      const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });

      await auth(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toBeDefined();
      expect((req as any).user.userId).toBe('user-1');
      expect((req as any).user.email).toBe('test@test.com');
      expect((req as any).user.role).toBe('farm_manager');
      expect((req as any).organizationId).toBe('org-1');
    });

    it('calls next with error when no auth header present', () => {
      const { req, res, next } = mockReqResNext({});

      auth(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.status).toBe(401);
    });

    it('calls next with error for expired token', () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@test.com', role: 'worker' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1s' }
      );
      const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });

      auth(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('calls next with error for invalid secret', () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@test.com', role: 'worker' },
        'wrong-secret-key-that-does-not-match-the-real-one',
        { expiresIn: '1h' }
      );
      const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });

      auth(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('calls next with error for non-Bearer auth header', () => {
      const { req, res, next } = mockReqResNext({ authorization: 'Basic abc123' });

      auth(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('optionalAuth', () => {
    it('attaches user when valid token present', () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@test.com', role: 'ceo' },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );
      const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });

      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect((req as any).user).toBeDefined();
      expect((req as any).user.userId).toBe('user-1');
    });

    it('continues without user when no token present', () => {
      const { req, res, next } = mockReqResNext({});

      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect((req as any).user).toBeUndefined();
    });

    it('continues without user when token is invalid', () => {
      const { req, res, next } = mockReqResNext({ authorization: 'Bearer invalid-token' });

      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
      expect((req as any).user).toBeUndefined();
    });
  });

  describe('authorize (role check)', () => {
    it('allows authorized role', () => {
      const middleware = authorize('ceo', 'farm_manager');
      const { req, res, next } = mockReqResNext({});
      (req as any).user = { userId: 'u1', role: 'ceo', email: 'ceo@test.com' };

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('calls next with AppError for unauthorized role', () => {
      const middleware = authorize('ceo');
      const { req, res, next } = mockReqResNext({});
      (req as any).user = { userId: 'u1', role: 'worker', email: 'w@test.com' };

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.status).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('calls next with error when no user on request', () => {
      const middleware = authorize('ceo');
      const { req, res, next } = mockReqResNext({});

      middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0] as AppError;
      expect(error.status).toBe(401);
    });

    it('accepts multiple allowed roles', () => {
      const middleware = authorize('ceo', 'farm_manager', 'operation_manager');
      
      ['ceo', 'farm_manager', 'operation_manager'].forEach((role) => {
        const { req, res, next } = mockReqResNext({});
        (req as any).user = { userId: 'u1', role, email: 'test@test.com' };
        middleware(req, res, next);
        expect(next).toHaveBeenCalledWith();
      });
    });
  });

  describe('authorizeFieldStaffRead', () => {
    function run(method: string, role: string) {
      const { req, res, next } = mockReqResNext({});
      (req as any).method = method;
      (req as any).user = { userId: 'u1', role, email: 'x@test.com' };
      authorizeFieldStaffRead(req as any, res, next);
      return next;
    }

    it('lets an operator read', () => {
      expect(run('GET', 'operator')).toHaveBeenCalledWith();
      expect(run('HEAD', 'operator')).toHaveBeenCalledWith();
    });

    it('blocks operator writes', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const next = run(method, 'operator');
        expect((next.mock.calls[0][0] as AppError).status).toBe(403);
      }
    });

    it('keeps field staff read and write access', () => {
      expect(run('GET', 'agronomist')).toHaveBeenCalledWith();
      expect(run('POST', 'agronomist')).toHaveBeenCalledWith();
    });

    it('still blocks roles outside field staff', () => {
      expect((run('GET', 'auditor').mock.calls[0][0] as AppError).status).toBe(403);
    });
  });

  describe('operator spray permissions', () => {
    const operator = { userId: 'op-1', email: 'op@test.com', role: 'operator' as const };

    it('operator can create spray records, which start pending', () => {
      expect(canCreatePesticideApplication(operator)).toBe(true);
      expect(resolveInitialApproval(operator).status).toBe('pending');
    });

    it('operator cannot approve spray records', () => {
      expect(() => assertCanApproveApplication(operator)).toThrow(AppError);
    });
  });
});
