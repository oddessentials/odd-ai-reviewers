/**
 * Shared Test Utilities
 *
 * Provides type-safe helpers for test files that work with TypeScript's strict mode.
 * These utilities eliminate the need for non-null assertions (!) and type casts (as).
 */

import type { ControlFlowConfig } from '../src/agents/control_flow/types.js';
import type { AgentContext } from '../src/agents/types.js';
import type { Config } from '../src/config/schemas.js';
import type { DiffFile } from '../src/diff.js';

/**
 * Assert a value is defined, throwing if not.
 * Provides type narrowing for TypeScript.
 *
 * @example
 * const cfg = assertDefined(cfgs[0], 'Expected at least one CFG');
 * // cfg is now guaranteed to be non-null
 */
export function assertDefined<T>(
  value: T | undefined | null,
  message = 'Expected value to be defined'
): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

/**
 * Create a complete ControlFlowConfig with all required properties.
 * Use this in tests to ensure config objects satisfy TypeScript's strict checks.
 *
 * @example
 * const config = createTestControlFlowConfig({ timeBudgetMs: 1000 });
 */
export function createTestControlFlowConfig(
  overrides: Partial<ControlFlowConfig> = {}
): ControlFlowConfig {
  return {
    enabled: true,
    timeBudgetMs: 60000,
    sizeBudgetLines: 5000,
    maxCallDepth: 5,
    mitigationPatterns: [],
    patternOverrides: [],
    disabledPatterns: [],
    patternTimeoutMs: 100,
    whitelistedPatterns: [],
    validationTimeoutMs: 10,
    rejectionThreshold: 'medium',
    ...overrides,
  };
}

/**
 * Create a minimal Config object for tests.
 * Use this in tests that need a full Config object.
 */
export function createTestConfig(controlFlowOverrides: Partial<ControlFlowConfig> = {}): Config {
  return {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
      max_completion_tokens: 4000,
    },
    models: { default: 'gpt-4o-mini' },
    reporting: {},
    gating: { enabled: false, fail_on_severity: 'error' },
    control_flow: createTestControlFlowConfig(controlFlowOverrides),
  };
}

/**
 * Create a minimal AgentContext object for tests.
 * Use this in tests that need a full AgentContext object.
 */
export function createTestAgentContext(
  files: DiffFile[] = [],
  controlFlowOverrides: Partial<ControlFlowConfig> = {}
): AgentContext {
  return {
    repoPath: '/test/repo',
    diff: {
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      baseSha: 'abc123',
      headSha: 'def456',
      contextLines: 3,
      source: 'local-git',
    },
    files,
    config: createTestConfig(controlFlowOverrides),
    diffContent: '',
    prNumber: 123,
    env: {},
    effectiveModel: 'gpt-4o-mini',
    provider: 'openai',
  };
}

/**
 * Create a DiffFile object for tests.
 */
export function createTestDiffFile(
  path: string,
  patch: string,
  status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified'
): DiffFile {
  return {
    path,
    patch,
    additions: patch.split('\n').filter((l) => l.startsWith('+')).length,
    deletions: patch.split('\n').filter((l) => l.startsWith('-')).length,
    status,
  };
}
