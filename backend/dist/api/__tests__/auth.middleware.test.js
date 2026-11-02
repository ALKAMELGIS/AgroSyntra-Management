"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errors_1 = require("../../utils/errors");
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
jest.mock('../../cache/client', () => ({
    redisClient: { get: jest.fn(), setex: jest.fn() },
}));
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-at-least-32-chars';
const auth_1 = require("../middleware/auth");
function mockReqResNext(headers = {}) {
    const req = {
        headers: { ...headers },
    };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
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
            const token = jsonwebtoken_1.default.sign({ userId: 'user-1', email: 'test@test.com', role: 'farm_manager', organizationId: 'org-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });
            await (0, auth_1.auth)(req, res, next);
            expect(next).toHaveBeenCalledWith();
            expect(req.user).toBeDefined();
            expect(req.user.userId).toBe('user-1');
            expect(req.user.email).toBe('test@test.com');
            expect(req.user.role).toBe('farm_manager');
            expect(req.organizationId).toBe('org-1');
        });
        it('calls next with error when no auth header present', () => {
            const { req, res, next } = mockReqResNext({});
            (0, auth_1.auth)(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(errors_1.AppError));
            const error = next.mock.calls[0][0];
            expect(error.status).toBe(401);
        });
        it('calls next with error for expired token', () => {
            const token = jsonwebtoken_1.default.sign({ userId: 'user-1', email: 'test@test.com', role: 'worker' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
            const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });
            (0, auth_1.auth)(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });
        it('calls next with error for invalid secret', () => {
            const token = jsonwebtoken_1.default.sign({ userId: 'user-1', email: 'test@test.com', role: 'worker' }, 'wrong-secret-key-that-does-not-match-the-real-one', { expiresIn: '1h' });
            const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });
            (0, auth_1.auth)(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });
        it('calls next with error for non-Bearer auth header', () => {
            const { req, res, next } = mockReqResNext({ authorization: 'Basic abc123' });
            (0, auth_1.auth)(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });
    });
    describe('optionalAuth', () => {
        it('attaches user when valid token present', () => {
            const token = jsonwebtoken_1.default.sign({ userId: 'user-1', email: 'test@test.com', role: 'ceo' }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const { req, res, next } = mockReqResNext({ authorization: `Bearer ${token}` });
            (0, auth_1.optionalAuth)(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
            expect(req.user.userId).toBe('user-1');
        });
        it('continues without user when no token present', () => {
            const { req, res, next } = mockReqResNext({});
            (0, auth_1.optionalAuth)(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(req.user).toBeUndefined();
        });
        it('continues without user when token is invalid', () => {
            const { req, res, next } = mockReqResNext({ authorization: 'Bearer invalid-token' });
            (0, auth_1.optionalAuth)(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(req.user).toBeUndefined();
        });
    });
    describe('authorize (role check)', () => {
        it('allows authorized role', () => {
            const middleware = (0, auth_1.authorize)('ceo', 'farm_manager');
            const { req, res, next } = mockReqResNext({});
            req.user = { userId: 'u1', role: 'ceo', email: 'ceo@test.com' };
            middleware(req, res, next);
            expect(next).toHaveBeenCalledWith();
        });
        it('calls next with AppError for unauthorized role', () => {
            const middleware = (0, auth_1.authorize)('ceo');
            const { req, res, next } = mockReqResNext({});
            req.user = { userId: 'u1', role: 'worker', email: 'w@test.com' };
            middleware(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(errors_1.AppError));
            const error = next.mock.calls[0][0];
            expect(error.status).toBe(403);
            expect(error.code).toBe('FORBIDDEN');
        });
        it('calls next with error when no user on request', () => {
            const middleware = (0, auth_1.authorize)('ceo');
            const { req, res, next } = mockReqResNext({});
            middleware(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(errors_1.AppError));
            const error = next.mock.calls[0][0];
            expect(error.status).toBe(401);
        });
        it('accepts multiple allowed roles', () => {
            const middleware = (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager');
            ['ceo', 'farm_manager', 'operation_manager'].forEach((role) => {
                const { req, res, next } = mockReqResNext({});
                req.user = { userId: 'u1', role, email: 'test@test.com' };
                middleware(req, res, next);
                expect(next).toHaveBeenCalledWith();
            });
        });
    });
});
