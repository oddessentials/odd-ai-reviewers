import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test configuration
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: './coverage',

      // Include only source files, exclude tests and type definitions
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**/*', 'node_modules', 'dist'],

      // Coverage thresholds - enforced in CI to prevent regressions
      // Baseline established January 2026: 67.11% stmts, 63.03% branches, 69.79% funcs, 68.14% lines
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 68,
        lines: 66,
      },
    },
  },
});
