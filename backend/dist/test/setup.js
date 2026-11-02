"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Test setup file
const dotenv_1 = __importDefault(require("dotenv"));
// Load test environment variables
dotenv_1.default.config({ path: '.env.test' });
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
