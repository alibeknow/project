'use strict';

/** @type {import('jest').Config} */
module.exports = {
  // Use node environment (not jsdom)
  testEnvironment: 'node',

  // Only look for E2E tests in tests/e2e/
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.js'],

  // Global setup/teardown for testcontainer lifecycle
  globalSetup:    '<rootDir>/tests/e2e/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/e2e/setup/globalTeardown.js',

  // Per-test-process setup: sets DB env vars + globals BEFORE any test modules load
  setupFiles: ['<rootDir>/tests/e2e/setup/jestSetup.js'],

  // Timeouts
  testTimeout: 60000,  // 60s per test (PDF generation, carrier API calls)

  // Coverage (optional, run with --coverage flag)
  collectCoverageFrom: [
    'routes/**/*.js',
    'libs/**/*.js',
    'middleware/**/*.js',
    'helpers/**/*.js',
    '!libs/api/wsdl-aramex/**',
    '!node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Verbose output
  verbose: true,

  // No Babel transforms — pure CommonJS Node.js, no transpilation needed
  transform: {},
  transformIgnorePatterns: [],
};
