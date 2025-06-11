/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/unit/setup.ts'],
    include: [
      'tests/unit/**/*.vitest.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/unit/**/*.test.vitest.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/*.vitest.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      '__tests__/**/*.vitest.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'tests/e2e/**',
      'tests/*.spec.ts', // Exclude Playwright tests
      'tests/unit/**/*.test.ts', // Exclude Jest tests
      'tests/unit/**/*.spec.ts' // Exclude Jest tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/app/**', // Next.js app directory
        'src/components/ui/**', // UI components
        'src/types/**', // Type definitions
        '**/*.d.ts',
        '**/*.stories.*',
        '**/*.test.*',
        '**/*.spec.*'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './')
    }
  }
})