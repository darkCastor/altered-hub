// Test setup file for Bun
// This file is run before each test file

import { beforeEach, mock } from 'bun:test'

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  log: mock(),
  warn: mock(),
  error: mock(),
};

// Set up any global test utilities or mocks here
beforeEach(() => {
  // Clear all mocks before each test
  if (global.console.log.mockClear) global.console.log.mockClear();
  if (global.console.warn.mockClear) global.console.warn.mockClear();
  if (global.console.error.mockClear) global.console.error.mockClear();
});