# Quickstart: Fix Agent Result Union Regressions

**Feature**: 012-fix-agent-result-regressions
**Date**: 2026-01-29

## Overview

This feature fixes three regressions from the AgentResult discriminated union migration:

1. **Partial findings preserved** - Failed agents' partial findings now appear in reports
2. **Legacy cache graceful** - Old cache entries trigger re-run, not crash
3. **BrandHelpers.is consistent** - `.is()` and `.parse()` now always agree

## Key Changes

### 1. Finding Type - New `provenance` Field

```typescript
import { Finding } from './agents/types.js';

// Findings from successful agents
const completeFinding: Finding = {
  severity: 'error',
  file: 'src/app.ts',
  line: 42,
  message: 'Unused variable',
  sourceAgent: 'eslint',
  provenance: 'complete', // Agent finished successfully
};

// Findings from failed agents (partial analysis)
const partialFinding: Finding = {
  severity: 'warning',
  file: 'src/utils.ts',
  line: 15,
  message: 'Potential SQL injection',
  sourceAgent: 'semgrep',
  provenance: 'partial', // Agent failed mid-execution
};
```

### 2. Execute Phase - Separate Collections

```typescript
import { executeAllPasses } from './phases/execute.js';

const result = await executeAllPasses(config, context, env, budget, options);

// Access findings by provenance
console.log('Complete:', result.completeFindings.length);
console.log('Partial:', result.partialFindings.length);

// Gating uses complete findings only
checkGating(config, result.completeFindings);

// Reporting includes both (separate sections)
dispatchReport({
  completeFindings: result.completeFindings,
  partialFindings: result.partialFindings,
  // ...
});
```

### 3. Cache - Version-Based Invalidation

```typescript
import { CACHE_SCHEMA_VERSION } from './agents/types.js';
import { getCached, setCache } from './cache/store.js';

// Cache keys now include version
const key = `ai-review-v${CACHE_SCHEMA_VERSION}-${prNumber}-${hash}`;

// Retrieval validates schema - legacy entries return null
const cached = await getCached(key);
if (cached === null) {
  // Cache miss OR legacy entry - execute agent
}
```

### 4. BrandHelpers - Consistent Validation

```typescript
import { SafeGitRefHelpers, isOk } from './types/branded.js';

// BEFORE (broken): .is() could pass values that .parse() rejects
SafeGitRefHelpers.is('refs/../main'); // true (wrong!)
SafeGitRefHelpers.parse('refs/../main'); // Err (correct)

// AFTER (fixed): .is() and .parse() always agree
SafeGitRefHelpers.is('refs/../main'); // false
isOk(SafeGitRefHelpers.parse('refs/../main')); // false

// Safe to use .is() as type guard before executing commands
if (SafeGitRefHelpers.is(userInput)) {
  execSync(`git checkout ${userInput}`); // Safe
}
```

## Testing

### Test Partial Findings Collection

```typescript
import { describe, it, expect } from 'vitest';
import { executeAllPasses } from './phases/execute.js';
import { AgentFailure } from './agents/types.js';

describe('partial findings', () => {
  it('collects partialFindings from failed agents', async () => {
    // Mock agent that fails with partial findings
    const failedResult = AgentFailure({
      agentId: 'semgrep',
      error: 'Process timeout',
      failureStage: 'exec',
      partialFindings: [
        {
          /* finding */
        },
      ],
      metrics: {
        /* ... */
      },
    });

    const result = await executeAllPasses(/* ... */);

    expect(result.partialFindings).toHaveLength(1);
    expect(result.partialFindings[0].provenance).toBe('partial');
  });
});
```

### Test Legacy Cache Handling

```typescript
import { describe, it, expect } from 'vitest';
import { getCached } from './cache/store.js';

describe('legacy cache entries', () => {
  it('returns null for legacy format (cache miss)', async () => {
    // Legacy entry has success: boolean, no status field
    const legacyEntry = { success: true, findings: [] };
    await writeLegacyEntry('test-key', legacyEntry);

    const result = await getCached('test-key');

    expect(result).toBeNull(); // Treated as cache miss
  });
});
```

### Test BrandHelpers Consistency (FR-009)

Uses fixed wide corpus + fuzz loop (no new dependencies):

```typescript
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { SafeGitRefHelpers, isOk } from './types/branded.js';

describe('BrandHelpers.is consistency', () => {
  // Fixed wide corpus covering known edge cases
  const corpus = [
    'main',
    'refs/heads/feature',
    'refs/../main', // Forbidden pattern
    'feature--name',
    '',
    null,
    undefined,
    'refs/heads/a'.repeat(300), // Length limit
    '-leading-dash', // Invalid start
    'valid/branch/name',
    'refs/tags/v1.0.0',
    '$(whoami)', // Shell injection attempt
    'branch`id`', // Backtick injection
  ];

  it.each(corpus)('is() agrees with parse() for corpus entry %#', (input) => {
    const isResult = SafeGitRefHelpers.is(input);
    const parseResult = isOk(SafeGitRefHelpers.parse(input));
    expect(isResult).toBe(parseResult);
  });

  it('is() agrees with parse() for 100 random fuzz inputs', () => {
    for (let i = 0; i < 100; i++) {
      const fuzzInput = randomBytes(Math.floor(Math.random() * 64)).toString('base64');
      const isResult = SafeGitRefHelpers.is(fuzzInput);
      const parseResult = isOk(SafeGitRefHelpers.parse(fuzzInput));
      expect(isResult, `Failed for fuzz input: ${fuzzInput}`).toBe(parseResult);
    }
  });
});
```

### Test Dedup Within Partials Only (FR-011)

```typescript
import { describe, it, expect } from 'vitest';
import { processFindings } from './phases/report.js';

describe('deduplication rules', () => {
  it('preserves same finding in both collections (no cross-collection dedup)', () => {
    const sharedFinding = {
      severity: 'error' as const,
      file: 'app.ts',
      line: 10,
      ruleId: 'no-unused',
      message: 'Unused variable',
      sourceAgent: 'eslint',
    };

    const complete = [{ ...sharedFinding, provenance: 'complete' as const }];
    const partial = [
      { ...sharedFinding, provenance: 'partial' as const, sourceAgent: 'eslint-retry' },
    ];

    const result = processFindings({ completeFindings: complete, partialFindings: partial });

    expect(result.completeFindings).toHaveLength(1);
    expect(result.partialFindings).toHaveLength(1); // Not deduped against complete
  });

  it('dedupes within partialFindings using sourceAgent+file+line+ruleId', () => {
    const partial = [
      {
        severity: 'error' as const,
        file: 'app.ts',
        line: 10,
        ruleId: 'rule1',
        sourceAgent: 'agent1',
        provenance: 'partial' as const,
        message: 'first',
      },
      {
        severity: 'error' as const,
        file: 'app.ts',
        line: 10,
        ruleId: 'rule1',
        sourceAgent: 'agent1',
        provenance: 'partial' as const,
        message: 'duplicate',
      },
      {
        severity: 'error' as const,
        file: 'app.ts',
        line: 10,
        ruleId: 'rule1',
        sourceAgent: 'agent2',
        provenance: 'partial' as const,
        message: 'different agent',
      },
    ];

    const result = deduplicatePartialFindings(partial);

    expect(result).toHaveLength(2); // agent1 deduped, agent2 preserved
  });
});
```

## Migration

### Cache Invalidation

When this feature deploys:

1. Cache key format changes from `ai-review-{pr}-{hash}` to `ai-review-v2-{pr}-{hash}`
2. All existing cache entries become unreachable (different key)
3. First review after upgrade re-executes all agents (one-time cost)
4. Legacy entries in `.ai-review-cache` remain but are never matched

**No manual migration required** - cache entries are ephemeral (24h TTL).

### API Changes

| Component          | Change                                                 | Backwards Compatible       |
| ------------------ | ------------------------------------------------------ | -------------------------- |
| Finding.provenance | New optional field                                     | ✅ Yes                     |
| ExecuteResult      | `allFindings` → `completeFindings` + `partialFindings` | ⚠️ Requires caller updates |
| BrandHelpers.is()  | Implementation change                                  | ✅ Yes (stricter)          |
| Cache keys         | Version prefix added                                   | ✅ Yes (old keys unused)   |

### Caller Updates Required

Files that use `ExecuteResult.allFindings`:

- `router/src/phases/report.ts` - Update to use both collections
- `router/src/index.ts` - Update main entry point if it accesses findings

## Troubleshooting

### "All agents re-running after upgrade"

**Expected** - Cache version bumped, legacy entries invalidated. One-time cost.

### "Partial findings not appearing in report"

Check:

1. Agent returns `partialFindings` in failure result
2. Report template includes partial findings section
3. `provenance: 'partial'` is set on findings

### "BrandHelpers.is() rejecting previously valid inputs"

**Expected** - `.is()` now runs full validation including `additionalValidation`. Inputs that passed before but fail `additionalValidation` are now correctly rejected.
