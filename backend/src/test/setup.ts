// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set default test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/almahafarm_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Silence console in tests unless explicitly enabled
if (!process.env.VERBOSE_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    // Keep error and warn for debugging test failures
    error: console.error,
    warn: console.warn,
  };
}
