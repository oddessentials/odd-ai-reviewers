# Quickstart: Local Review Improvements

**Feature**: 001-local-review-improvements
**Date**: 2026-02-03

## Overview

This document provides a quick reference for implementing the Local Review Improvements feature. It covers the key changes, file locations, and implementation patterns.

## Key Changes Summary

| Change                            | Primary File                                     | Effort |
| --------------------------------- | ------------------------------------------------ | ------ |
| 1. Add `local-review` alias       | `router/src/main.ts`                             | Small  |
| 2. Range operator parsing         | `router/src/cli/options/local-review-options.ts` | Medium |
| 3. Error classification           | `router/src/types/errors.ts`                     | Small  |
| 4. Diff-mode invariant            | `router/src/diff.ts`                             | Small  |
| 5. Remove `resolveBaseRef` export | `router/src/cli/options/index.ts`                | Small  |
| 6. `makeTempRepo` helper          | `router/tests/helpers/temp-repo.ts`              | Medium |
| 7. Documentation                  | `README.md`, CLI help text                       | Small  |

---

## Implementation Patterns

### 1. Adding the CLI Alias

```typescript
// router/src/main.ts - find the local command definition and add .alias()

program
  .command('local')
  .alias('local-review') // ADD THIS LINE
  .description('Run AI review on local changes');
// ... rest unchanged
```

### 2. Range Parsing with Operator Scan

```typescript
// router/src/cli/options/local-review-options.ts

export function parseRangeString(input: string): RangeParseResult {
  const trimmed = input.trim();

  // Count operators (check ... first to avoid partial match)
  const threeDotCount = (trimmed.match(/\.\.\./g) || []).length;
  const twoDotCount = (trimmed.match(/\.\./g) || []).length - threeDotCount;
  const totalOperators = threeDotCount + twoDotCount;

  if (totalOperators > 1) {
    return {
      ok: false,
      error: {
        code: RangeErrorCode.MULTIPLE_OPERATORS,
        message: `Invalid range format: multiple operators found in '${input}'. Use 'base..head' or 'base...head'.`,
        input,
      },
    };
  }

  // Determine operator and split
  let operator: RangeOperator;
  let parts: string[];

  if (threeDotCount === 1) {
    operator = '...';
    parts = trimmed.split('...');
  } else if (twoDotCount === 1) {
    operator = '..';
    parts = trimmed.split('..');
  } else {
    // Single ref (base only)
    return {
      ok: true,
      value: { baseRef: trimmed, headRef: undefined, operator: '...' },
    };
  }

  const baseRef = parts[0].trim();
  const headRef = parts[1]?.trim();

  // Validate non-empty refs
  if (!baseRef && !headRef) {
    return {
      ok: false,
      error: {
        code: RangeErrorCode.MISSING_REFS,
        message: `Invalid range format: '${input}' requires at least one reference.`,
        input,
      },
    };
  }

  if (!baseRef) {
    return {
      ok: false,
      error: {
        code: RangeErrorCode.EMPTY_BASE_REF,
        message: `Invalid range format: empty base reference in '${input}'.`,
        input,
      },
    };
  }

  return {
    ok: true,
    value: { baseRef, headRef: headRef || undefined, operator },
  };
}
```

### 3. Error Code Extensions

```typescript
// router/src/types/errors.ts - add to ValidationErrorCode

export enum ValidationErrorCode {
  // ... existing codes ...

  // Range validation (before git)
  MALFORMED_RANGE_MULTIPLE_OPERATORS = 'VALIDATION_MALFORMED_RANGE_MULTIPLE_OPERATORS',
  MALFORMED_RANGE_EMPTY_REF = 'VALIDATION_MALFORMED_RANGE_EMPTY_REF',
  MALFORMED_RANGE_MISSING_REFS = 'VALIDATION_MALFORMED_RANGE_MISSING_REFS',

  // Git ref validation (after parse)
  INVALID_GIT_REF = 'VALIDATION_INVALID_GIT_REF',
}
```

### 4. Diff-Mode Invariant Check

```typescript
// router/src/diff.ts - add at start of getLocalDiff()

export function getLocalDiff(repoPath: string, options: LocalDiffOptions): DiffSummary {
  // Compute resolved mode
  const resolvedMode = computeResolvedDiffMode(options);

  // Invariant check
  assertDiffModeResolved(resolvedMode, 'getLocalDiff');

  // ... rest of implementation based on resolvedMode
}

function computeResolvedDiffMode(options: LocalDiffOptions): ResolvedDiffMode | undefined {
  if (options.stagedOnly) {
    return { mode: 'staged' };
  }
  if (options.uncommitted) {
    return { mode: 'uncommitted' };
  }
  if (options.baseRef) {
    const rangeSpec = options.headRef
      ? `${options.baseRef}${options.rangeOperator || '...'}${options.headRef}`
      : `${options.baseRef}${options.rangeOperator || '...'}HEAD`;
    return {
      mode: 'range',
      rangeSpec,
      operator: options.rangeOperator || '...',
    };
  }
  return undefined; // Invariant violation
}
```

### 5. Export Surface Update

```typescript
// router/src/cli/options/index.ts - remove resolveBaseRef

export {
  parseLocalReviewOptions,
  applyOptionDefaults,
  resolveDiffRange, // Keep this
  // resolveBaseRef,  // REMOVE THIS EXPORT
  type LocalReviewOptions,
  type ParsedOptionsResult,
  type ResolvedDiffRange,
} from './local-review-options.js';
```

### 6. makeTempRepo Helper

```typescript
// router/tests/helpers/temp-repo.ts

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { afterEach, afterAll } from 'vitest';

const tempDirs: string[] = [];

export interface TempRepo {
  path: string;
  cleanup: () => void;
}

export interface TempRepoOptions {
  initGit?: boolean;
  initialCommit?: boolean;
  files?: Record<string, string>;
}

export function makeTempRepo(options: TempRepoOptions = {}): TempRepo {
  const { initGit = true, initialCommit = false, files = {} } = options;

  const tempDir = mkdtempSync(join(tmpdir(), 'ai-review-test-'));
  tempDirs.push(tempDir);

  // Create files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(tempDir, filePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  // Initialize git
  if (initGit) {
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
  }

  // Initial commit
  if (initGit && initialCommit) {
    writeFileSync(join(tempDir, '.gitkeep'), '');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: tempDir, stdio: 'pipe' });
  }

  const cleanup = () => {
    const index = tempDirs.indexOf(tempDir);
    if (index > -1) {
      tempDirs.splice(index, 1);
      rmSync(tempDir, { recursive: true, force: true });
    }
  };

  return { path: tempDir, cleanup };
}

// Register cleanup hooks
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  // Backstop: verify all temp dirs cleaned up
  const remaining = tempDirs.length;
  if (remaining > 0) {
    console.warn(`WARNING: ${remaining} temp directories not cleaned up`);
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
```

---

## Test Patterns

### Integration Test Matrix

```typescript
// router/tests/integration/local-review-cli.test.ts

describe('local-review CLI integration', () => {
  const entrypoints = ['local', 'local-review'];

  describe.each(entrypoints)('entrypoint: %s', (cmd) => {
    it('executes with path argument', async () => {
      const result = await runCli([cmd, '.']);
      expect(result.exitCode).toBe(0);
    });

    it('executes with valid range', async () => {
      const result = await runCli([cmd, '--range', 'main...HEAD', '.']);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('malformed ranges', () => {
    const malformedRanges = [
      ['a..b..c', 'multiple operators'],
      ['main..feature..extra', 'multiple operators'],
      ['..', 'missing refs'],
      ['...', 'missing refs'],
      [' .. ', 'empty refs'],
    ];

    it.each(malformedRanges)('rejects %s (%s)', async (range) => {
      const result = await runCli(['local', '--range', range, '.']);
      expect(result.exitCode).toBe(2); // INVALID_ARGS
      expect(result.stderr).toContain('Invalid range format');
    });
  });

  it('help text is identical for both entrypoints', async () => {
    const localHelp = await runCli(['local', '--help']);
    const localReviewHelp = await runCli(['local-review', '--help']);
    expect(localHelp.stdout).toBe(localReviewHelp.stdout);
  });
});
```

### Config Error Tests

```typescript
// router/tests/unit/config.test.ts

describe('config error handling', () => {
  it('returns FILE_NOT_FOUND for missing config', async () => {
    const result = await loadConfigFromPath('/nonexistent/config.yml');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ConfigErrorCode.FILE_NOT_FOUND);
    }
  });

  it('handles deletion race condition', async () => {
    const { path, cleanup } = makeTempRepo({ initGit: false });
    const configPath = join(path, '.ai-review.yml');
    writeFileSync(configPath, 'valid: true');

    // Simulate race: delete after exists check
    const originalReadFile = fs.readFile;
    vi.spyOn(fs, 'readFile').mockImplementationOnce(() => {
      unlinkSync(configPath);
      return originalReadFile(configPath);
    });

    const result = await loadConfigFromPath(configPath);
    expect(isErr(result)).toBe(true);
    cleanup();
  });

  it('reports parsing error for malformed YAML', async () => {
    const { path, cleanup } = makeTempRepo({ initGit: false });
    const configPath = join(path, '.ai-review.yml');
    writeFileSync(configPath, 'invalid: yaml: [unclosed');

    const result = await loadConfigFromPath(configPath);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe(ConfigErrorCode.YAML_PARSE_ERROR);
    }
    cleanup();
  });
});
```

---

## Commands Reference

```bash
# Run unit tests
pnpm --filter @odd-ai-reviewers/router test

# Run specific test file
pnpm --filter @odd-ai-reviewers/router test local-review-options.test.ts

# Run integration tests
pnpm --filter @odd-ai-reviewers/router test:integration

# Type check
pnpm --filter @odd-ai-reviewers/router typecheck

# Lint
pnpm --filter @odd-ai-reviewers/router lint

# Build
pnpm --filter @odd-ai-reviewers/router build
```

---

## Checklist

Before marking implementation complete:

- [ ] `local-review` alias added and tested
- [ ] Range parsing rejects all malformed inputs
- [ ] Error messages are distinct for validation vs git errors
- [ ] Diff-mode invariant throws programmer error
- [ ] `resolveBaseRef` removed from exports
- [ ] `makeTempRepo` helper used in all temp-dir tests
- [ ] Cleanup test verifies hooks work even on failure
- [ ] Config error paths have full coverage
- [ ] CLI help documents range operators
- [ ] README updated with range operator documentation
- [ ] Integration test matrix passes
- [ ] All existing tests still pass
