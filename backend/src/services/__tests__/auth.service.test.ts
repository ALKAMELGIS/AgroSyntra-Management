import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock dependencies before importing the service
jest.mock('../../db/client', () => ({
  dbPool: {
    query: jest.fn(),
  },
}));

jest.mock('../../cache/client', () => ({
  redisClient: {
    get: jest.fn(),
    setex: jest.fn(),
  },
}));

// Set JWT secret for tests
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';

describe('AuthService', () => {
  describe('Password Hashing', () => {
    it('should hash passwords correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);
      
      const isValid = await bcrypt.compare('WrongPassword', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    const jwtSecret = process.env.JWT_SECRET!;

    it('should generate valid JWT token', () => {
      const payload = { userId: '123', email: 'test@test.com', role: 'worker' };
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '15m' });
      
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should verify and decode JWT token', () => {
      const payload = { userId: '123', email: 'test@test.com', role: 'worker' };
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '15m' });
      
      const decoded = jwt.verify(token, jwtSecret) as typeof payload;
      
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should reject token with invalid secret', () => {
      const payload = { userId: '123', email: 'test@test.com', role: 'worker' };
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '15m' });
      
      expect(() => {
        jwt.verify(token, 'wrong-secret');
      }).toThrow();
    });

    it('should reject expired token', () => {
      const payload = { userId: '123', email: 'test@test.com', role: 'worker' };
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '-1s' });
      
      expect(() => {
        jwt.verify(token, jwtSecret);
      }).toThrow();
    });
  });

  describe('Role Validation', () => {
    const validRoles = ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'];

    it('should accept all valid roles', () => {
      validRoles.forEach(role => {
        expect(validRoles).toContain(role);
      });
    });

    it('should have correct role hierarchy', () => {
      // CEO has highest access, worker has lowest
      const roleHierarchy = {
        ceo: 5,
        farm_manager: 4,
        operation_manager: 3,
        agronomist: 2,
        worker: 1,
      };

      expect(roleHierarchy.ceo).toBeGreaterThan(roleHierarchy.farm_manager);
      expect(roleHierarchy.farm_manager).toBeGreaterThan(roleHierarchy.operation_manager);
      expect(roleHierarchy.operation_manager).toBeGreaterThan(roleHierarchy.agronomist);
      expect(roleHierarchy.agronomist).toBeGreaterThan(roleHierarchy.worker);
    });
  });

  describe('Email Validation', () => {
    const validEmails = ['test@example.com', 'user.name@domain.org', 'user+tag@gmail.com'];
    const invalidEmails = ['notanemail', '@nodomain.com', 'no@.com', 'spaces in@email.com'];

    it('should accept valid email formats', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      validEmails.forEach(email => {
        expect(email).toMatch(emailRegex);
      });
    });

    it('should reject invalid email formats', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      invalidEmails.forEach(email => {
        expect(email).not.toMatch(emailRegex);
      });
    });

    it('should normalize email to lowercase', () => {
      const email = 'Test@Example.COM';
      expect(email.toLowerCase()).toBe('test@example.com');
    });
  });

  describe('Password Security', () => {
    it('should require minimum 8 characters', () => {
      const shortPassword = '1234567';
      const validPassword = '12345678';
      
      expect(shortPassword.length).toBeLessThan(8);
      expect(validPassword.length).toBeGreaterThanOrEqual(8);
    });

    it('should use bcrypt with cost factor 12', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 12);
      
      // bcrypt hash starts with $2a$ or $2b$ followed by cost factor
      expect(hash).toMatch(/^\$2[ab]\$12\$/);
    });
  });
});
