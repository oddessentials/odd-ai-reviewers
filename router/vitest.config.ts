import { defineConfig } from 'vitest/config';

/**
 * Coverage threshold configuration
 *
 * CI environment enforces stricter thresholds to prevent regressions.
 * Local development uses relaxed thresholds for faster iteration.
 *
 * @see specs/006-quality-enforcement/contracts/coverage-config.ts
 * @see FR-002, FR-005, FR-005a
 */

// Detect environment: CI=true triggers strict thresholds
const isCI = process.env['CI'] === 'true';
const coverageMode = isCI ? 'ci' : 'local';

// CI thresholds: Baseline established January 2026
// Must be >= local thresholds per ThresholdPair contract
const ciThresholds = {
  statements: 65,
  branches: 60,
  functions: 68,
  lines: 66,
};

// Local thresholds: Relaxed for development iteration
const localThresholds = {
  statements: 60,
  branches: 55,
  functions: 63,
  lines: 61,
};

const activeThresholds = isCI ? ciThresholds : localThresholds;

// FR-005a: Log active coverage configuration at test start
// Only log when running in Vitest context to avoid polluting other tool output
if (process.env['VITEST'] || process.env['VITEST_WORKER_ID']) {
  console.log(`[coverage] mode=${coverageMode}`);
  console.log(
    `[coverage] thresholds: statements=${activeThresholds.statements}%, branches=${activeThresholds.branches}%, functions=${activeThresholds.functions}%, lines=${activeThresholds.lines}%`
  );
}

export default defineConfig({
  test: {
    // Test configuration
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['tests/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: './coverage',

      // Include only source files, exclude tests and type definitions
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**/*', 'node_modules', 'dist'],

      // Coverage thresholds - environment-specific
      // CI: Enforced strictly to prevent regressions
      // Local: Relaxed for development iteration
      thresholds: activeThresholds,
    },
  },
});
