# Feature Specification: Type and Test Optimization

**Feature Branch**: `010-type-test-optimization`
**Created**: 2026-01-29
**Status**: Draft
**Input**: User description: "Carefully review the current repository for opportunities to optimize the types and tests. Our goal is to refactor anything that will help make the codebase safer, more efficient to work in, and enterprise grade without impacting existing functionality unless a bug is discovered."

## Clarifications

### Session 2026-01-29

- Q: How to handle backward compatibility when converting throwing functions to Result? → A: Keep backward-compatible throwing wrapper for all exported/public functions; Result pattern only for internal use or new APIs
- Q: What is the canonical error wire format? → A: Locked format with fields: name, code, message, cause, context; all custom errors must round-trip without losing cause or stack
- Q: What is the single source of truth for types? → A: Zod schemas are the single source of truth; derive TS types from Zod via `z.infer<>` or enforce via tests; forbid hand-duplicated interfaces
- Q: How do branded types serialize/deserialize at boundaries? → A: Provide explicit `parse`/`brand` and `unbrand` helpers; forbid direct casting (`as SafeGitRef`) outside these helpers
- Q: What are the integration test isolation requirements? → A: Hermetic and deterministic: no real network, no real git remotes, no wall-clock timing assertions; stub providers and freeze time/UUID
- Q: How to test entry points without side effects? → A: Export `run(argv, env)` function from main.ts; keep `process.exit` behind injectable dependency; avoid module-load side effects
- Q: How to approach Record<string, unknown> replacement? → A: Module-by-module with passing tests per slice; no repo-wide sweep in one PR; gate behind compiler-enforced types
- Q: How to enforce exhaustive discriminated unions? → A: Add shared `assertNever(x: never)` utility; require in every switch statement; forbid default branches that hide missing cases
- Q: How to prevent toolchain drift? → A: Pin TypeScript 5.9.x and Vitest major version in CI checks that fail on version mismatch
- Q: What is the implementation process for each phase? → A: Commit each phase to current branch after ensuring all CI and quality checks pass; fix any failures (pre-existing or new) in enterprise-grade fashion before proceeding

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Type-Safe Error Handling (Priority: P1)

As a developer working on the odd-ai-reviewers codebase, I want consistent, type-safe error handling across all modules so that I can understand error contexts at compile time and handle errors predictably without losing diagnostic information.

**Why this priority**: Error handling is currently scattered across 16+ locations with repeated `instanceof Error` patterns. Type-safe errors prevent runtime surprises and improve debugging. This foundational change enables safer development across all modules.

**Independent Test**: Can be fully tested by triggering error scenarios in any module and verifying that error types, contexts, and stack traces are preserved and type-checkable.

**Acceptance Scenarios**:

1. **Given** a configuration validation error occurs, **When** the error is caught, **Then** the error type is statically known and contains the invalid configuration context
2. **Given** an agent execution fails, **When** the error propagates, **Then** the error includes the agent identifier, input context, and original cause
3. **Given** multiple errors occur during a review pass, **When** errors are aggregated, **Then** each error maintains its original type and context
4. **Given** an external API call fails (GitHub, Azure DevOps), **When** the error is caught, **Then** the error distinguishes between network errors, auth errors, and API errors
5. **Given** a custom error is serialized and deserialized, **When** round-tripped through JSON, **Then** the error retains its name, code, message, cause, context, and stack trace

---

### User Story 2 - Branded Types for Validated Data (Priority: P1)

As a developer, I want compile-time guarantees that data has been validated before use, so that I cannot accidentally pass unvalidated inputs to functions that require validated data.

**Why this priority**: The codebase already has a branded type pattern (`CanonicalDiffFile`) that works well. Extending this pattern prevents entire classes of bugs at compile time with zero runtime overhead.

**Independent Test**: Can be fully tested by attempting to pass unbranded types to functions requiring branded types and confirming compile-time errors.

**Acceptance Scenarios**:

1. **Given** a configuration object from user input, **When** passed to functions requiring validated config, **Then** compiler rejects unless the object has been validated through the proper validation function
2. **Given** a git reference string, **When** used in git operations, **Then** compiler rejects unless the string has been validated as a safe git reference
3. **Given** an environment variables object, **When** accessed for required keys, **Then** type system enforces presence checks for required variables
4. **Given** existing branded type `CanonicalDiffFile`, **When** new branded types are added, **Then** they follow the same pattern for consistency
5. **Given** a branded type needs to cross a boundary (cache, JSON, API), **When** serialized, **Then** explicit `unbrand` helper strips the brand; when deserialized, explicit `parse`/`brand` helper re-validates and re-brands
6. **Given** code attempts direct casting (`as SafeGitRef`), **When** not using official helpers, **Then** linting or review process rejects the cast

---

### User Story 3 - Result Type Pattern for Operations (Priority: P2)

As a developer, I want functions that can fail to return a Result type instead of throwing, so that I am forced to handle both success and failure cases at compile time.

**Why this priority**: Result types make error handling explicit and composable. This improves code safety and makes error flows visible without reading implementation details.

**Independent Test**: Can be fully tested by calling any function returning Result and verifying that accessing the success value without checking the result type produces a compile-time error.

**Acceptance Scenarios**:

1. **Given** a function that can fail, **When** it returns a Result type, **Then** the caller must check success/failure before accessing the value
2. **Given** multiple operations that return Results, **When** chained together, **Then** errors can be composed or short-circuited cleanly
3. **Given** an existing try-catch block, **When** converted to Result pattern, **Then** the error context is preserved and type-safe
4. **Given** a Result with an error, **When** unwrapped without checking, **Then** compiler rejects the code
5. **Given** an exported/public function that previously threw, **When** converted to Result internally, **Then** a backward-compatible throwing wrapper preserves existing throw behavior for external callers

---

### User Story 4 - Entry Point Test Coverage (Priority: P2)

As a maintainer, I want test coverage for main entry points (main.ts, config.ts, budget.ts at root level), so that changes to initialization and configuration loading are validated automatically.

**Why this priority**: These files have 0% coverage currently. They handle critical initialization, argument parsing, and orchestration. Bugs here affect all users.

**Independent Test**: Can be fully tested by running the test suite and verifying entry points execute with various argument combinations and configuration scenarios.

**Acceptance Scenarios**:

1. **Given** the main entry point is invoked with valid arguments, **When** tests run, **Then** initialization completes successfully via exported `run(argv, env)` function
2. **Given** invalid command-line arguments, **When** main entry point processes them, **Then** appropriate error messages are produced without calling `process.exit` directly
3. **Given** missing required configuration, **When** config loader runs, **Then** validation errors clearly identify missing fields
4. **Given** budget enforcement at root level, **When** limits are approached or exceeded, **Then** appropriate warnings or stops occur
5. **Given** tests import main.ts, **When** module loads, **Then** no side effects execute at import time; all behavior requires explicit `run()` call

---

### User Story 5 - Integration Test Suite (Priority: P2)

As a maintainer, I want integration tests that verify the full review pipeline (preflight → agent execution → reporting), so that cross-module interactions are validated automatically.

**Why this priority**: Currently only 1 integration test exists. Integration tests catch bugs that unit tests miss, especially in module boundaries and data flow.

**Independent Test**: Can be fully tested by running the integration test suite against mock repositories with known characteristics and verifying end-to-end behavior.

**Acceptance Scenarios**:

1. **Given** a valid PR diff, **When** the full review pipeline executes, **Then** findings are generated and reported correctly using stubbed providers
2. **Given** an agent fails during execution, **When** the pipeline continues, **Then** other agents still produce their findings
3. **Given** cache is warm, **When** a repeated review runs, **Then** cached results are used appropriately
4. **Given** multiple output reporters are configured, **When** review completes, **Then** all reporters receive the findings
5. **Given** any integration test, **When** executed, **Then** no real network calls, git remotes, or wall-clock timing assertions are used; time and UUIDs are frozen/stubbed

---

### User Story 6 - Generic Type Constraints and Inference (Priority: P3)

As a developer, I want generic functions to use TypeScript 5.9 features (const type parameters, better inference), so that type information is preserved more precisely through function calls.

**Why this priority**: Better type inference reduces the need for explicit type annotations and catches more bugs. This is a polish improvement building on the foundation of P1/P2 work.

**Independent Test**: Can be fully tested by verifying that generic functions preserve literal types and that type inference works without explicit annotations.

**Acceptance Scenarios**:

1. **Given** a function with generic parameters, **When** called with literal values, **Then** the return type preserves the literal types
2. **Given** a configuration validation function, **When** validating a partial config, **Then** the return type reflects only the validated keys
3. **Given** an array of mixed types, **When** processed by generic utilities, **Then** type narrowing works correctly

---

### User Story 7 - Discriminated Unions for Agent Results (Priority: P3)

As a developer, I want agent results to use discriminated unions, so that success and failure cases are clearly separated in the type system.

**Why this priority**: Discriminated unions make pattern matching exhaustive and type-safe. This prevents forgetting to handle error cases.

**Independent Test**: Can be fully tested by creating switch statements on agent results and verifying compiler reports missing cases.

**Acceptance Scenarios**:

1. **Given** an agent returns a result, **When** the result is a success type, **Then** only success-specific fields are accessible
2. **Given** an agent returns a result, **When** the result is a failure type, **Then** error information is accessible with correct types
3. **Given** code handles agent results, **When** a new result variant is added, **Then** compiler identifies all locations needing updates via `assertNever(x: never)` utility
4. **Given** a switch statement on a discriminated union, **When** not all cases are handled, **Then** the `assertNever` call in default branch causes a compile error

---

### Edge Cases

- **Branded type serialization**: Branded types crossing boundaries (cache, JSON, env, API) use explicit `parse`/`brand` and `unbrand` helpers; direct casting forbidden
- **Type coercion at boundaries**: All boundary data passes through Zod validation before branding; raw API responses never assumed to match branded types
- **Third-party type conflicts**: Branded types wrap external types; no modification of third-party type definitions
- **Error composition**: Multiple errors aggregated using typed error arrays; each error retains its cause chain
- **Test mocking for branded types**: Test fixtures use official `brand` helpers; no direct casting even in tests
- **Module-by-module migration**: `Record<string, unknown>` replacement proceeds module-by-module with passing tests per slice; no big-bang repo-wide sweep

## Requirements _(mandatory)_

### Functional Requirements

#### Type Safety

- **FR-001**: System MUST define custom error types for each error category (ConfigError, AgentError, NetworkError, ValidationError) conforming to canonical wire format: name, code, message, cause, context
- **FR-002**: System MUST preserve error context including original cause, stack trace, and domain-specific metadata through serialization round-trips
- **FR-003**: System MUST use branded types for validated configurations (`ValidatedConfig`) with explicit `parse`/`brand` and `unbrand` helpers
- **FR-004**: System MUST use branded types for validated git references (`SafeGitRef`) with explicit `parse`/`brand` and `unbrand` helpers
- **FR-005**: System MUST use branded types for validated file paths (`CanonicalPath`) with explicit `parse`/`brand` and `unbrand` helpers
- **FR-006**: System MUST implement a Result<T, E> type for operations that can fail; exported/public functions MUST retain backward-compatible throwing wrappers
- **FR-007**: System MUST use discriminated unions for agent execution results with `assertNever(x: never)` utility in all switch statements
- **FR-008**: System MUST replace `Record<string, unknown>` types with specific type definitions module-by-module with passing tests per slice
- **FR-009**: System MUST add type guards for runtime type validation with proper type predicates
- **FR-010**: System MUST derive all TypeScript types from Zod schemas via `z.infer<>` or enforce consistency via tests; hand-duplicated interfaces forbidden

#### Test Coverage

- **FR-011**: System MUST have unit tests for main.ts entry point via exported `run(argv, env)` function with injectable `process.exit` dependency
- **FR-012**: System MUST have unit tests for config.ts covering all validation scenarios
- **FR-013**: System MUST have unit tests for budget.ts covering limit enforcement
- **FR-014**: System MUST have integration tests for the full review pipeline using stubbed providers
- **FR-015**: System MUST have integration tests for agent failure scenarios
- **FR-016**: System MUST have integration tests for caching behavior
- **FR-017**: System MUST have integration tests for multi-reporter scenarios
- **FR-018**: System MUST have error path tests for malformed inputs and timeout scenarios
- **FR-019**: All integration tests MUST be hermetic: no real network, no real git remotes, no wall-clock timing; time and UUID frozen/stubbed

#### Code Quality

- **FR-020**: System MUST consolidate repeated error handling patterns into shared utilities
- **FR-021**: System MUST use exhaustive switch statements with `assertNever(x: never)` for discriminated unions; default branches hiding missing cases forbidden
- **FR-022**: System MUST validate type consistency between Zod schemas and TypeScript types; Zod is single source of truth
- **FR-023**: System MUST maintain backward compatibility with existing public interfaces via throwing wrappers
- **FR-024**: System MUST forbid direct casting to branded types (`as SafeGitRef`) outside official `parse`/`brand` helpers
- **FR-025**: CI MUST fail if TypeScript version is not 5.9.x or Vitest is not the declared major version

### Key Entities

- **CustomError**: Base error class with canonical wire format (name, code, message, cause, context), cause chaining, and stack preservation through serialization
- **Result<T, E>**: Discriminated union representing success (with value T) or failure (with error E)
- **BrandedType<T, Brand>**: Generic pattern for compile-time type branding with `parse`/`brand` and `unbrand` helpers
- **ValidatedConfig**: Branded type ensuring configuration has passed Zod validation, with serialization helpers
- **SafeGitRef**: Branded type ensuring git reference has been security-validated, with serialization helpers
- **AgentResult**: Discriminated union for agent execution outcomes (success/failure/skipped) enforced by `assertNever`
- **assertNever**: Utility function `assertNever(x: never): never` for exhaustive switch enforcement

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Test coverage for entry point files (main.ts, config.ts, budget.ts) reaches minimum 60%
- **SC-002**: Overall codebase test coverage increases from 33.74% to at least 45%
- **SC-003**: All error handling locations (currently 16+) use typed custom errors conforming to canonical wire format
- **SC-004**: At least 3 new branded types are implemented with explicit `parse`/`brand`/`unbrand` helpers following the CanonicalDiffFile pattern
- **SC-005**: Result type pattern is implemented and used in at least 5 operations with backward-compatible throwing wrappers for public APIs
- **SC-006**: Integration test suite contains at least 10 hermetic end-to-end scenarios (no network, no git remotes, frozen time/UUID)
- **SC-007**: All discriminated unions have exhaustive switch statements using `assertNever(x: never)` utility
- **SC-008**: Zero instances of `Record<string, unknown>` remain in core type definitions (migrated module-by-module)
- **SC-009**: All existing tests continue to pass after refactoring
- **SC-010**: No changes to public API signatures (backward compatible throwing wrappers provided)
- **SC-011**: CI checks enforce TypeScript 5.9.x and Vitest declared major version
- **SC-012**: All TypeScript types derived from Zod schemas; zero hand-duplicated interfaces

## Assumptions

- The control flow analysis module (`router/src/agents/control_flow/`) with 88%+ coverage serves as a reference implementation for type patterns
- TypeScript 5.9.x features are available as configured in tsconfig.json
- Vitest 4.x testing framework capabilities are sufficient for all test types
- Zod 4.x continues to be used for runtime schema validation
- Existing Zod schemas provide the source of truth for validated data shapes

## Constraints

- **No big-bang refactoring**: `Record<string, unknown>` replacement proceeds module-by-module, not repo-wide in single PR
- **Backward compatibility required**: All exported/public functions retain throwing behavior via wrappers
- **Hermetic tests only**: Integration tests must not depend on external network, git remotes, or real time
- **No direct casting**: Branded types must use official helpers; `as BrandedType` outside helpers is forbidden
- **Toolchain pinned**: CI enforces exact TypeScript 5.9.x and Vitest major version
- **CI-gated commits**: Each phase committed only after all CI and quality checks pass; any failures (pre-existing or new) must be fixed before proceeding
