'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.integration.test.js'],
  globalSetup: '<rootDir>/tests/integration/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/integration/setup/globalTeardown.js',
  setupFiles: ['<rootDir>/tests/integration/setup/jestSetup.js'],
  testTimeout: 60000,
  transform: {},
};
