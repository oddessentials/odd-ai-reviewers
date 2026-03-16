# Quickstart: Fix Remaining Deduplication and Path Normalization Bugs

**Feature**: 406-fix-remaining-bugs
**Date**: 2026-01-30

## Prerequisites

- Node.js >= 22.0.0
- pnpm (installed globally)
- Git repository cloned

## Setup

```bash
# Navigate to project root
cd /path/to/odd-ai-reviewers

# Install dependencies
pnpm install

# Verify existing tests pass
pnpm test
```

## Development Workflow

### 1. Run Tests in Watch Mode

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test router/src/__tests__/report/deduplication.test.ts

# Watch mode for development
pnpm test -- --watch
```

### 2. Type Checking

```bash
# Check types
pnpm typecheck
```

### 3. Linting

```bash
# Run ESLint
pnpm lint

# Auto-fix lint issues
pnpm lint:fix
```

## Files to Modify

| File                              | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `router/src/report/github.ts`     | GitHub reporter - proximityMap, deletedFiles, staleCount |
| `router/src/report/ado.ts`        | ADO reporter - same fixes + path documentation           |
| `router/src/report/resolution.ts` | Empty marker guard                                       |
| `router/src/cache/store.ts`       | Immutable cache entry                                    |

## Files to Create

| File                                                | Purpose                  |
| --------------------------------------------------- | ------------------------ |
| `router/src/__tests__/report/deduplication.test.ts` | 11+ new regression tests |

## Testing Strategy

### Unit Tests to Add

1. **ProximityMap Update Test**
   - Post a finding, verify proximityMap updated
   - Post second finding within threshold, verify skipped

2. **DeletedFiles Path Test**
   - Create deleted file with `./src/file.ts` format
   - Create finding with `src/file.ts` format
   - Verify finding is filtered

3. **StaleCount Test**
   - Full resolution (all stale) → staleCount = total
   - Partial resolution → staleCount = partial count

4. **Cache Immutability Test**
   - Store entry, verify original object unchanged

5. **Empty Marker Test**
   - Process malformed marker body
   - Verify no empty strings in result

6. **ADO Path Format Test**
   - Verify thread context uses leading slash
   - Verify dedupe key uses no leading slash

### Edge Case Tests

1. Finding without fingerprint (should generate one)
2. Boundary at exactly 20 lines (inclusive)
3. Unicode file path in deleted files
4. Empty proximityMap initial state
5. Grouped comment multiple findings

## Verification Commands

```bash
# Run all tests with coverage
pnpm test -- --coverage

# Run specific test patterns
pnpm test -- --grep "proximityMap"
pnpm test -- --grep "deletedFiles"
pnpm test -- --grep "staleCount"

# Verify no lint warnings
pnpm lint --max-warnings 0

# Check circular dependencies
pnpm depcruise
```

## Common Issues

### Import Paths

Use `.js` extension for ESM imports:

```typescript
import { generateFingerprint } from '../formats.js';
```

### Test Mocking

Use Vitest's `vi.mock()` for external dependencies:

```typescript
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => mockOctokit),
}));
```

## Reference Functions

### Path Canonicalization

```typescript
// diff.ts:445
export function canonicalizeDiffFiles(files: DiffFile[]): CanonicalDiffFile[];
```

### Line Resolution

```typescript
// line-resolver.ts:506
export function normalizeFindingsForDiff(
  findings: Finding[],
  resolver: LineResolver,
  options?: { additionsOnly?: boolean; autoFix?: boolean }
);
```

### Fingerprint Generation

```typescript
// formats.ts:31
export function generateFingerprint(finding: Finding): string;
```

### Dedupe Key

```typescript
// formats.ts:55
export function getDedupeKey(finding: Finding): string;
```
