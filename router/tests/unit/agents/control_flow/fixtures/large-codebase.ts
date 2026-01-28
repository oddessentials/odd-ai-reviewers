/**
 * Test Fixtures: Large Codebase Simulation
 *
 * Fixtures for testing budget enforcement and graceful degradation
 * when analyzing large codebases that exceed time/size limits.
 */

// =============================================================================
// File Priority Categories
// =============================================================================

/**
 * High priority files (always analyze).
 * Security-sensitive files that should never be skipped.
 */
export const HIGH_PRIORITY_FILES = [
  'src/auth/login.ts',
  'src/auth/session.ts',
  'src/api/handlers/users.ts',
  'src/api/handlers/payments.ts',
  'src/security/sanitize.ts',
  'src/security/validate.ts',
  'src/database/queries.ts',
  'src/middleware/auth.ts',
];

/**
 * Medium priority files (analyze if budget allows).
 * Business logic that may have security implications.
 */
export const MEDIUM_PRIORITY_FILES = [
  'src/services/userService.ts',
  'src/services/orderService.ts',
  'src/utils/formatting.ts',
  'src/utils/parsing.ts',
  'src/models/user.ts',
  'src/models/order.ts',
];

/**
 * Low priority files (skip in degraded mode).
 * Tests, documentation, and configuration files.
 */
export const LOW_PRIORITY_FILES = [
  'src/__tests__/userService.test.ts',
  'src/__tests__/orderService.test.ts',
  'src/types/index.ts',
  'src/constants/index.ts',
  'src/config/defaults.ts',
  'scripts/build.ts',
  'scripts/deploy.ts',
];

// =============================================================================
// Simulated Large Files
// =============================================================================

/**
 * Generate a large function with many branches.
 */
export function generateLargeFunction(branches: number): string {
  const conditions = Array.from(
    { length: branches },
    (_, i) => `
    if (condition${i}) {
      result += process${i}(input);
    }`
  ).join(' else ');

  return `
function processLargeInput(input: unknown, ${Array.from({ length: branches }, (_, i) => `condition${i}: boolean`).join(', ')}) {
  let result = '';
  ${conditions}
  return result;
}
`;
}

/**
 * Generate a deeply nested function.
 */
export function generateDeeplyNestedFunction(depth: number): string {
  let code = 'function deeplyNested(input: unknown) {\n';
  for (let i = 0; i < depth; i++) {
    code += '  '.repeat(i + 1) + `if (check${i}(input)) {\n`;
  }
  code += '  '.repeat(depth + 1) + 'return process(input);\n';
  for (let i = depth - 1; i >= 0; i--) {
    code += '  '.repeat(i + 1) + '}\n';
  }
  code += '}\n';
  return code;
}

/**
 * Generate a file with many functions.
 */
export function generateLargeFile(functionCount: number, linesPerFunction: number): string {
  const functions = Array.from({ length: functionCount }, (_, i) => {
    const body = Array.from(
      { length: linesPerFunction },
      (_, j) => `  const var${j} = process${j}(input);`
    ).join('\n');
    return `
function func${i}(input: unknown) {
${body}
  return input;
}
`;
  });

  return functions.join('\n');
}

// =============================================================================
// Simulated File Sets
// =============================================================================

/**
 * Small codebase: well within limits.
 */
export const SMALL_CODEBASE = {
  files: [
    { path: 'src/index.ts', lines: 50 },
    { path: 'src/utils.ts', lines: 100 },
    { path: 'src/handlers.ts', lines: 150 },
  ],
  totalLines: 300,
  expectedStatus: 'ok' as const,
};

/**
 * Medium codebase: approaches warning threshold.
 */
export const MEDIUM_CODEBASE = {
  files: [
    { path: 'src/auth/login.ts', lines: 500 },
    { path: 'src/auth/session.ts', lines: 400 },
    { path: 'src/api/users.ts', lines: 800 },
    { path: 'src/api/orders.ts', lines: 700 },
    { path: 'src/services/core.ts', lines: 1500 },
    { path: 'src/services/helpers.ts', lines: 1000 },
    { path: 'src/utils/index.ts', lines: 600 },
    { path: 'src/models/index.ts', lines: 500 },
  ],
  totalLines: 6000,
  expectedStatus: 'ok' as const,
};

/**
 * Large codebase: exceeds warning threshold (80%).
 */
export const LARGE_CODEBASE = {
  files: [
    { path: 'src/auth/login.ts', lines: 1000 },
    { path: 'src/auth/session.ts', lines: 800 },
    { path: 'src/auth/oauth.ts', lines: 600 },
    { path: 'src/api/users.ts', lines: 1200 },
    { path: 'src/api/orders.ts', lines: 1000 },
    { path: 'src/api/products.ts', lines: 900 },
    { path: 'src/services/user.ts', lines: 800 },
    { path: 'src/services/order.ts', lines: 700 },
    { path: 'src/services/product.ts', lines: 600 },
    { path: 'src/utils/helpers.ts', lines: 500 },
    { path: 'src/utils/validators.ts', lines: 400 },
  ],
  totalLines: 8500,
  expectedStatus: 'warning' as const,
};

/**
 * Very large codebase: exceeds 90% threshold.
 */
export const VERY_LARGE_CODEBASE = {
  files: [
    { path: 'src/auth/login.ts', lines: 1500 },
    { path: 'src/auth/session.ts', lines: 1200 },
    { path: 'src/auth/oauth.ts', lines: 1000 },
    { path: 'src/api/users.ts', lines: 1500 },
    { path: 'src/api/orders.ts', lines: 1300 },
    { path: 'src/api/products.ts', lines: 1100 },
    { path: 'src/services/user.ts', lines: 900 },
    { path: 'src/services/order.ts', lines: 800 },
  ],
  totalLines: 9300,
  expectedStatus: 'exceeded' as const,
};

/**
 * Oversized codebase: exceeds 100% limit.
 */
export const OVERSIZED_CODEBASE = {
  files: [
    { path: 'src/auth/login.ts', lines: 2000 },
    { path: 'src/auth/session.ts', lines: 1800 },
    { path: 'src/api/users.ts', lines: 2500 },
    { path: 'src/api/orders.ts', lines: 2200 },
    { path: 'src/services/core.ts', lines: 2000 },
  ],
  totalLines: 10500,
  expectedStatus: 'terminated' as const,
};

// =============================================================================
// Time Simulation Helpers
// =============================================================================

/**
 * Simulate elapsed time by adjusting the start time.
 * This is for testing purposes only.
 */
export interface TimeSimulator {
  /** Original Date.now function */
  originalNow: () => number;
  /** Simulated current time offset */
  offsetMs: number;
  /** Install the simulator */
  install: () => void;
  /** Advance simulated time */
  advance: (ms: number) => void;
  /** Uninstall and restore original */
  uninstall: () => void;
}

/**
 * Create a time simulator for testing time-based budget checks.
 */
export function createTimeSimulator(): TimeSimulator {
  const originalNow = Date.now.bind(Date);
  let offsetMs = 0;

  return {
    originalNow,
    offsetMs,
    install() {
      (Date as unknown as { now: () => number }).now = () => originalNow() + offsetMs;
    },
    advance(ms: number) {
      offsetMs += ms;
    },
    uninstall() {
      (Date as unknown as { now: () => number }).now = originalNow;
    },
  };
}

// =============================================================================
// File Priority Determination
// =============================================================================

/**
 * Priority levels for files.
 */
export type FilePriority = 'high' | 'medium' | 'low';

/**
 * Patterns for determining file priority.
 */
export const FILE_PRIORITY_PATTERNS: Record<FilePriority, RegExp[]> = {
  high: [
    /\/(auth|security|middleware)\//,
    /\/(handlers|controllers)\//,
    /\/api\//,
    /\/(database|db)\//,
    /sanitize|validate|escape/i,
  ],
  medium: [/\/(services|utils)\//, /\/(models|entities)\//, /\/(helpers|lib)\//],
  low: [
    /\/__tests__\//,
    /\.test\./,
    /\.spec\./,
    /\/(scripts|tools)\//,
    /\/(types|interfaces)\//,
    /\/(constants|config)\//,
  ],
};

/**
 * Determine the priority of a file based on its path.
 */
export function getFilePriority(filePath: string): FilePriority {
  // Check low priority first (tests should always be low)
  for (const pattern of FILE_PRIORITY_PATTERNS.low) {
    if (pattern.test(filePath)) {
      return 'low';
    }
  }

  // Check high priority
  for (const pattern of FILE_PRIORITY_PATTERNS.high) {
    if (pattern.test(filePath)) {
      return 'high';
    }
  }

  // Check medium priority
  for (const pattern of FILE_PRIORITY_PATTERNS.medium) {
    if (pattern.test(filePath)) {
      return 'medium';
    }
  }

  // Default to medium
  return 'medium';
}

/**
 * Sort files by priority (high first, low last).
 */
export function sortFilesByPriority<T extends { path: string }>(files: T[]): T[] {
  const priorityOrder: Record<FilePriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...files].sort((a, b) => {
    const priorityA = priorityOrder[getFilePriority(a.path)];
    const priorityB = priorityOrder[getFilePriority(b.path)];
    return priorityA - priorityB;
  });
}

/**
 * Filter files to skip low priority in degraded mode.
 */
export function filterFilesForDegradedMode<T extends { path: string }>(
  files: T[],
  isDegraded: boolean
): T[] {
  if (!isDegraded) {
    return files;
  }

  return files.filter((f) => getFilePriority(f.path) !== 'low');
}
