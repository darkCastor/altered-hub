// Test setup file for Jest
// This file is run before each test file

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up any global test utilities or mocks here
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});