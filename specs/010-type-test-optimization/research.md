# Research: Type and Test Optimization

**Feature**: 010-type-test-optimization
**Date**: 2026-01-29
**Status**: Complete

## Research Tasks

### R-001: TypeScript 5.9 Branded Type Patterns

**Decision**: Use unique symbol pattern (matches existing CanonicalDiffFile)

**Rationale**: The codebase already has a proven branded type pattern in `diff.ts`:

```typescript
declare const __canonical: unique symbol;
export type CanonicalDiffFile = DiffFile & { readonly [__canonical]: true };
```

This pattern:

- Has zero runtime overhead (compile-time only)
- Prevents construction outside designated factory functions
- Is already familiar to codebase maintainers
- Compatible with TypeScript 5.9.x strict mode

**Alternatives Considered**:

1. **Opaque types library (ts-brand, newtype-ts)**: Rejected - adds dependency, same functionality achievable natively
2. **Class-based nominal types**: Rejected - runtime overhead, less flexible
3. **Intersection with private field**: Rejected - more verbose, same effect as unique symbol

### R-002: Result<T, E> Type Pattern

**Decision**: Implement discriminated union with `ok` boolean discriminant

**Rationale**: Standard TypeScript pattern that enables exhaustive checking:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

This pattern:

- Enables type narrowing via `if (result.ok)`
- Forces handling of both success and failure at compile time
- Compatible with `assertNever` for exhaustive switch
- No runtime library dependency

**Alternatives Considered**:

1. **neverthrow library**: Rejected - adds dependency, project prefers zero-runtime-dependency type utilities
2. **fp-ts Either**: Rejected - heavy FP paradigm mismatch with codebase style
3. **Promise-based error handling**: Rejected - doesn't provide compile-time enforcement

### R-003: Custom Error Wire Format

**Decision**: Canonical format with five fields: name, code, message, cause, context

**Rationale**: Per clarification session, all custom errors must round-trip through JSON without losing `cause` or stack. Format:

```typescript
interface ErrorWireFormat {
  name: string; // Error class name (e.g., "ConfigError")
  code: string; // Machine-readable code (e.g., "CONFIG_INVALID_SCHEMA")
  message: string; // Human-readable message
  cause?: ErrorWireFormat; // Nested cause (recursive)
  context: Record<string, unknown>; // Domain-specific metadata
  stack?: string; // Optional stack trace (preserved in serialization)
}
```

**Alternatives Considered**:

1. **Standard Error only**: Rejected - loses context and cause chain
2. **AggregateError**: Rejected - only for multiple errors, not cause chains
3. **Custom properties without wire format**: Rejected - breaks serialization round-trip

### R-004: Error Categories

**Decision**: Four error categories covering all 16+ current patterns

**Rationale**: Analysis of existing error handling reveals these categories:

1. **ConfigError**: Configuration validation, schema parsing, missing fields
2. **AgentError**: Agent execution failures, timeout, parsing agent output
3. **NetworkError**: API calls (GitHub, Azure DevOps, Anthropic, OpenAI)
4. **ValidationError**: Input validation (git refs, paths, arguments)

Each category gets:

- Unique code prefix (CONFIG*, AGENT*, NETWORK*, VALIDATION*)
- Typed context interface
- Zod schema for serialization validation

**Alternatives Considered**:

1. **Single CustomError class**: Rejected - loses specificity, harder to handle
2. **Per-module error classes**: Rejected - too many classes, inconsistent handling
3. **Error enum codes only**: Rejected - loses type safety of class hierarchy

### R-005: assertNever Utility Pattern

**Decision**: Standard never-based exhaustiveness check

**Rationale**: TypeScript idiom for exhaustive switch statements:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
```

Usage in switch:

```typescript
switch (result.status) {
  case 'success':
    return handleSuccess(result);
  case 'failure':
    return handleFailure(result);
  case 'skipped':
    return handleSkipped(result);
  default:
    assertNever(result); // Compile error if case missing
}
```

Per clarification: default branches that hide missing cases are forbidden.

**Alternatives Considered**:

1. **exhaustive-check library**: Rejected - trivial utility doesn't need dependency
2. **No default clause**: Rejected - doesn't catch missing cases at compile time
3. **TypeScript noImplicitReturns only**: Rejected - doesn't catch all patterns

### R-006: Hermetic Test Infrastructure

**Decision**: Use Vitest mocking with frozen time/UUID and stubbed providers

**Rationale**: Per clarification requirements:

- No real network: Mock fetch/http at Vitest level
- No real git remotes: Stub execFileSync for git commands
- No wall-clock timing: Use `vi.useFakeTimers()`
- Frozen UUID: Mock `crypto.randomUUID()`

Test utilities needed:

```typescript
// test-utils/hermetic.ts
export function setupHermeticTest() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-29T00:00:00Z'));
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-0000' });
}
```

**Alternatives Considered**:

1. **Real network with nock**: Rejected - still network-dependent, flaky
2. **Docker-based isolation**: Rejected - overkill for unit/integration tests
3. **Dependency injection everywhere**: Rejected - too invasive for existing code

### R-007: Entry Point Testability Pattern

**Decision**: Extract `run(argv, env)` function with injectable process.exit

**Rationale**: Per clarification, main.ts must be testable without side effects:

```typescript
// main.ts
export interface ExitHandler {
  exit(code: number): never;
}

export const defaultExitHandler: ExitHandler = {
  exit: (code) => process.exit(code),
};

export async function run(
  argv: string[],
  env: Record<string, string | undefined>,
  exitHandler: ExitHandler = defaultExitHandler
): Promise<number> {
  // ... implementation
  return exitCode;
}

// Only runs when executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv, process.env);
}
```

**Alternatives Considered**:

1. **Mock process.exit globally**: Rejected - affects other tests, not isolated
2. **Wrap in try-catch for exit codes**: Rejected - doesn't prevent actual exit
3. **Separate CLI module**: Rejected - unnecessary indirection

### R-008: Zod as Single Source of Truth Enforcement

**Decision**: Use `z.infer<>` consistently + add compile-time type tests

**Rationale**: Per clarification, hand-duplicated interfaces are forbidden. Enforcement:

1. All exported types derive from Zod schemas via `z.infer<typeof Schema>`
2. Add type tests that fail if schema and type diverge:

```typescript
// Type test: ensures ConfigSchema matches Config type
const _configTypeCheck: z.infer<typeof ConfigSchema> extends Config ? true : never = true;
const _configReverseCheck: Config extends z.infer<typeof ConfigSchema> ? true : never = true;
```

Current codebase already uses `z.infer<>` pattern correctly in most places.

**Alternatives Considered**:

1. **Runtime type comparison**: Rejected - compile-time is sufficient and faster
2. **Code generation from Zod**: Rejected - adds build step, overkill
3. **Manual review process**: Rejected - error-prone, not enforced

### R-009: CI Toolchain Version Enforcement

**Decision**: Add version check script to CI workflow

**Rationale**: Per clarification, CI must fail if TypeScript isn't 5.9.x or Vitest isn't declared major. Implementation:

```yaml
# .github/workflows/ci.yml
- name: Verify toolchain versions
  run: |
    TS_VERSION=$(npx tsc --version | grep -oP '\d+\.\d+')
    if [[ ! "$TS_VERSION" =~ ^5\.9 ]]; then
      echo "ERROR: TypeScript must be 5.9.x, got $TS_VERSION"
      exit 1
    fi
    VITEST_VERSION=$(npx vitest --version | head -1)
    if [[ ! "$VITEST_VERSION" =~ ^4\. ]]; then
      echo "ERROR: Vitest must be 4.x, got $VITEST_VERSION"
      exit 1
    fi
```

**Alternatives Considered**:

1. **Package.json engines field**: Rejected - doesn't fail CI, just warns
2. **lockfile-lint**: Rejected - checks lockfile integrity, not version enforcement
3. **Renovate/Dependabot pinning**: Rejected - updates versions, doesn't enforce

### R-010: Module-by-Module Migration Strategy

**Decision**: Migrate Record<string, unknown> in dependency order with test gates

**Rationale**: Per clarification, no big-bang sweep. Migration order based on dependency analysis:

1. **types/** (new, no deps) - establish patterns
2. **config/** (foundational) - schemas already Zod-based
3. **agents/types.ts** (core interfaces) - AgentResult, Finding, AgentContext
4. **agents/\*.ts** (per-agent) - one PR per agent
5. **report/** (depends on agents)
6. **phases/** (orchestration)

Each slice:

- Must have passing tests before merge
- Must not break dependent modules
- Reviewed for silent widening/narrowing regressions

**Alternatives Considered**:

1. **Alphabetical order**: Rejected - ignores dependencies, causes breakage
2. **By file size**: Rejected - no semantic relevance
3. **All at once**: Rejected - explicitly forbidden by clarification

## Summary of Decisions

| Research Item       | Decision                                       | Key Rationale                                     |
| ------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Branded types       | unique symbol pattern                          | Zero overhead, matches existing CanonicalDiffFile |
| Result type         | Discriminated union with `ok`                  | Compile-time enforcement, no dependency           |
| Error wire format   | 5-field canonical format                       | Round-trip safe, preserves cause/stack            |
| Error categories    | 4 categories (Config/Agent/Network/Validation) | Covers all 16+ existing patterns                  |
| assertNever         | Standard never utility                         | Exhaustive switch enforcement                     |
| Hermetic tests      | Vitest mocking + frozen time/UUID              | No network, deterministic                         |
| Entry point testing | run(argv, env) extraction                      | Injectable exit, no side effects                  |
| Zod enforcement     | z.infer<> + compile-time tests                 | Single source of truth                            |
| CI toolchain        | Version check script                           | Prevents drift                                    |
| Migration order     | Dependency-based slicing                       | Safe incremental rollout                          |
