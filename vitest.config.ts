import { defineConfig } from 'vitest/config';

/**
 * Root-level Vitest configuration for docs-viewer tests
 *
 * These tests are independent from the router workspace tests
 * and test the documentation viewer functionality.
 */

export default defineConfig({
  test: {
    // Only include docs-viewer tests at root level
    include: ['tests/docs-viewer/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'router/**'],

    // Longer timeout for server startup tests
    testTimeout: 30000,

    // No coverage for docs-viewer tests (they test browser code)
    coverage: {
      enabled: false,
    },
  },
});
