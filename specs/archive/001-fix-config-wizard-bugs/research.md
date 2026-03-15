# Research: Fix Config Wizard Validation Bugs

**Feature Branch**: `001-fix-config-wizard-bugs`
**Date**: 2026-01-31

## 1. ResolvedConfig Type Design

### Decision: Extend existing ResolvedConfigTuple pattern

**Rationale**: The 015-config-wizard-validate branch already has a `ResolvedConfigTuple` type and `buildResolvedConfigTuple` function. We should extend this pattern rather than create a new type.

**Existing Type (router/src/config/providers.ts)**:

```typescript
export interface ResolvedConfigTuple {
  provider: LlmProvider | null;
  model: string;
  modelSource: 'env' | 'config' | 'default' | 'auto';
  keySource: string | null; // e.g., 'OPENAI_API_KEY'
  configPath: string | null;
}
```

**Required Changes**:

1. Return this type from `runPreflightChecks` in `PreflightResult.resolved`
2. Use `resolved.model` to update `agentContext.effectiveModel` after preflight
3. No new type needed—existing ResolvedConfigTuple covers all fields

**Alternatives Considered**:

- New separate type: Rejected (duplicates existing work, adds complexity)
- Extend AgentContext with resolved info: Rejected (pollutes context with validation concerns)

---

## 2. Vitest Spy Pattern

### Decision: Use vi.spyOn with module imports

**Rationale**: Vitest supports spying on module exports. The `resolveEffectiveModelWithDefaults` function is exported from `router/src/preflight.ts`, so we can spy on it directly.

**Pattern**:

```typescript
import * as preflight from '../preflight.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('resolution guardrail', () => {
  let resolverSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resolverSpy = vi.spyOn(preflight, 'resolveEffectiveModelWithDefaults');
  });

  afterEach(() => {
    resolverSpy.mockRestore();
  });

  it('resolves model exactly once per review command', async () => {
    await runReview(options);
    expect(resolverSpy).toHaveBeenCalledTimes(1);
  });
});
```

**Alternatives Considered**:

- Dependency injection: Rejected (requires significant refactoring for bug fix)
- Module mock with vi.mock: Rejected (harder to assert call counts)

---

## 3. Exit Code Verification

### Decision: Explicit exit code handling based on errors vs warnings

**Current Behavior (from 015-config-wizard-validate branch)**:

- `validate` command: Uses `defaultExitHandler(report.valid ? 0 : 1)`
- `config init` command: Same pattern after validation

**Issue**: `report.valid` is computed from `preflightResult.valid`, which is `errors.length === 0`. This is correct for errors, but warnings are not currently tracked.

**Required Changes**:

1. Add `warnings: string[]` to `PreflightResult`
2. Add `warnings: string[]` to validation report
3. Exit logic: `exit(errors.length > 0 ? 1 : 0)` (unchanged)
4. Print warnings before exit (new behavior)

**Pattern for warning-safe exit**:

```typescript
const report = formatValidationReport(preflightResult);
printValidationReport(report); // Shows both errors and warnings

// Exit based on errors only - warnings don't block
defaultExitHandler(report.errors.length > 0 ? 1 : 0);
```

**Alternatives Considered**:

- Warnings as soft errors: Rejected (spec FR-020 says warnings never block)
- Separate warning exit code (e.g., 2): Rejected (non-standard, confusing)

---

## 4. Dual Platform Config Generation

### Decision: Generate both reporting blocks when platform is 'both'

**Current Behavior (buggy)**:

```typescript
// Convert 'both' to 'github' for config generation (both means github reporting config)
platform = platformResult.value === 'both' ? 'github' : platformResult.value;
```

This silently drops ADO reporting.

**Required Config Structure for 'both'**:

```yaml
reporting:
  github:
    mode: checks_and_comments
  ado:
    mode: comments
```

**Implementation in generateDefaultConfig**:

```typescript
if (platform === 'both') {
  return {
    ...config,
    reporting: {
      github: { mode: 'checks_and_comments' },
      ado: { mode: 'comments' },
    },
  };
}
```

**Platform Environment Detection for Warning (FR-013, FR-017)**:

```typescript
const isGitHub = env['GITHUB_ACTIONS'] === 'true';
const isADO = env['TF_BUILD'] === 'True' || !!env['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'];

if (!isGitHub && !isADO) {
  warnings.push(
    'Neither GitHub nor Azure DevOps CI environment detected. ' +
      'Checked: GITHUB_ACTIONS, TF_BUILD, SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'
  );
}
```

**Alternatives Considered**:

- Remove 'both' option entirely: Rejected (users may have multi-platform CI)
- Auto-detect and generate only detected platform: Rejected (spec says generate both blocks)

---

## 5. Ollama URL Validation

### Decision: Skip required key check for ollama provider; add URL format validation

**Current Bug**:

```typescript
const requiredKeys = PROVIDER_KEY_MAPPING[provider]; // ['OLLAMA_BASE_URL'] for ollama
const missingKeys = requiredKeys.filter((key) => !env[key]);
// Fails if OLLAMA_BASE_URL not set, even though it has a default
```

**Fix in validateExplicitProviderKeys**:

```typescript
if (provider === 'ollama') {
  // OLLAMA_BASE_URL is optional - defaults to http://localhost:11434
  // Only validate URL format if explicitly set
  const ollamaUrl = env['OLLAMA_BASE_URL'];
  if (ollamaUrl) {
    try {
      new URL(ollamaUrl); // Validates scheme + host
    } catch {
      errors.push(
        `Invalid OLLAMA_BASE_URL format: '${ollamaUrl}'\n` +
          `Must be a valid URL (e.g., http://localhost:11434)`
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
```

**URL Validation Boundary**:

- Preflight: URL format validation only (scheme + host parseable)
- Runtime: Connectivity validation (fail-closed in local_llm agent)

**Alternatives Considered**:

- Remove ollama from PROVIDER_KEY_MAPPING: Rejected (would need special handling elsewhere)
- Make all PROVIDER_KEY_MAPPING values optional: Rejected (breaks other providers)

---

## 6. Config Init AgentContext Fix

### Decision: Build minimal AgentContext matching validate command pattern

**Current Bug**:

```typescript
const preflightResult = runPreflightChecks(
  config,
  undefined as never, // ← CRASH: agentContext.effectiveModel throws
  process.env
);
```

**Fix Pattern (from validate command)**:

```typescript
const env = process.env as Record<string, string | undefined>;
const effectiveModel = resolveEffectiveModel(config, env);

const minimalContext: AgentContext = {
  repoPath: process.cwd(),
  diff: {
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
    baseSha: '',
    headSha: '',
    contextLines: 3,
    source: 'local-git',
  },
  files: [],
  config,
  diffContent: '',
  prNumber: undefined,
  env,
  effectiveModel,
  provider: null,
};

const preflightResult = runPreflightChecks(config, minimalContext, env, process.cwd());
```

**Note**: This duplicates code from validate command. Consider extracting a `buildMinimalAgentContext` helper, but that's beyond bug fix scope.

**Alternatives Considered**:

- Make AgentContext optional in runPreflightChecks: Rejected (breaks type safety)
- Pass empty object: Rejected (still throws on property access)

---

## Summary

| Research Item  | Decision                                   | Key Insight                      |
| -------------- | ------------------------------------------ | -------------------------------- |
| ResolvedConfig | Extend existing ResolvedConfigTuple        | Already exists in codebase       |
| Vitest spy     | vi.spyOn on module export                  | Standard pattern, no DI needed   |
| Exit codes     | errors.length > 0 → 1, else 0              | Warnings never affect exit       |
| Dual platform  | Generate both reporting blocks             | Simple config extension          |
| Ollama URL     | Skip required check, add format validation | Boundary: format vs connectivity |
| AgentContext   | Copy validate command pattern              | Minimal context sufficient       |

All research complete. Proceed to Phase 1 design.
