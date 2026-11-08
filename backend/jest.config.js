/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // geotiff: use its CommonJS build (the default ESM build and quick-lru are not transformed by ts-jest).
  moduleNameMapper: { '^geotiff$': '<rootDir>/node_modules/geotiff/dist-node/geotiff.js' },
  transformIgnorePatterns: ['/node_modules/(?!(quick-lru)/)'],
  transform: { '^.+\\.ts$': 'ts-jest', '^.+quick-lru.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true, module: 'commonjs' } }] },
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
