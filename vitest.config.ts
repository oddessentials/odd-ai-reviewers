import { defineConfig } from 'vitest/config';

/**
 * Root-level Vitest configuration for docs-viewer and scripts tests
 *
 * These tests are independent from the router workspace tests
 * and test the documentation viewer functionality and build scripts.
 */

export default defineConfig({
  test: {
    // Include docs-viewer tests and scripts tests at root level
    include: ['tests/docs-viewer/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'router/**'],

    // Longer timeout for server startup tests
    testTimeout: 30000,

    // No coverage for docs-viewer / scripts tests
    coverage: {
      enabled: false,
    },
  },
});
