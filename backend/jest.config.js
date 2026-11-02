/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/db/migrations/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Ratchet, not a target: these sit just below current coverage so the gate
  // catches regressions instead of failing every build. Raise them as coverage
  // grows; the long-term goal is still 50%.
  coverageThreshold: {
    global: {
      branches: 7,
      functions: 9,
      lines: 9,
      statements: 9,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 10000,
  verbose: true,
};
