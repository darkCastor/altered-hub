// Test setup file for Vitest
// This file is run before each test file

import { vi, beforeEach } from 'vitest'

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Set up any global test utilities or mocks here
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
});