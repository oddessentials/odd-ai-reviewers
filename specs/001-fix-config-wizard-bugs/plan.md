# Implementation Plan: Fix Config Wizard Validation Bugs

**Branch**: `001-fix-config-wizard-bugs` | **Date**: 2026-01-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-config-wizard-bugs/spec.md`

## Summary

Fix four critical bugs in the config wizard and validation system introduced in 015-config-wizard-validate:

1. **P1**: Auto-applied model not propagated to execution (preflight passes, runtime fails)
2. **P2**: Ollama provider incorrectly requires OLLAMA_BASE_URL (should be optional)
3. **P2**: Config init validation crashes with `undefined as never` for AgentContext
4. **P3**: "Both" platform option drops ADO reporting configuration

The fix establishes `ResolvedConfig` as a single source of truth returned from preflight and used by all downstream execution, preventing the "preflight passes, runtime fails" drift.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.x (schema validation), Commander 14.x (CLI), Vitest 4.x (testing)
**Storage**: N/A (file-based .ai-review.yml configuration only)
**Testing**: Vitest 4.x with spy/mock support for resolver function call counting
**Target Platform**: Node.js >=22.0.0 (Linux in CI, cross-platform local)
**Project Type**: Single CLI application
**Performance Goals**: N/A (CLI tool, not latency-sensitive)
**Constraints**: Must maintain backwards compatibility with existing configs
**Scale/Scope**: Bug fixes only—no new features, minimal API surface changes

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                               |
| -------------------------------- | ------ | --------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | No changes to posting logic                         |
| II. Structured Findings Contract | PASS   | No changes to findings schema                       |
| III. Provider-Neutral Core       | PASS   | Fixes maintain provider abstraction                 |
| IV. Security-First Design        | PASS   | No changes to secret handling or trust model        |
| V. Deterministic Outputs         | PASS   | ResolvedConfig ensures consistent model resolution  |
| VI. Bounded Resources            | PASS   | No changes to resource limits                       |
| VII. Environment Discipline      | PASS   | No changes to CI execution model; prevents CI hangs |
| VIII. Explicit Non-Goals         | PASS   | Bug fixes stay within router scope                  |

**Quality Gates:**

- Zero-Tolerance Lint: All changes must pass `--max-warnings 0`
- Regression tests required for all four bug fixes (FR-015, FR-016, FR-021)
- Exit code semantics must be explicitly tested (FR-018–FR-026)
- Validate must match review preflight exactly (FR-021, FR-022)

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-config-wizard-bugs/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (below)
├── data-model.md        # Phase 1 output (ResolvedConfig type)
├── quickstart.md        # Phase 1 output (testing guide)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/src/
├── phases/
│   └── preflight.ts     # MODIFY: Return ResolvedConfig in PreflightResult
├── preflight.ts         # MODIFY: Skip OLLAMA_BASE_URL requirement for provider:ollama
├── main.ts              # MODIFY: Use ResolvedConfig from preflight; fix config init AgentContext; exit code semantics
├── cli/
│   └── config-wizard.ts # MODIFY: Generate dual reporting for "both" platform
├── config/
│   └── providers.ts     # READ ONLY: resolveEffectiveModel, resolveProvider
└── agents/
    └── types.ts         # READ ONLY: AgentContext type

router/src/__tests__/
├── preflight.test.ts              # MODIFY: Add Ollama URL validation tests
├── config-wizard.test.ts          # MODIFY: Add "both" platform tests
├── resolution-guardrail.test.ts   # CREATE: Spy/mock test for single resolution
└── validate-review-parity.test.ts # CREATE: Verify validate/review produce identical resolved tuples
```

**Structure Decision**: Single project structure. All changes are within the existing router/src directory. No new modules or directories needed beyond the new test files.

## Complexity Tracking

No constitution violations requiring justification. All changes are targeted bug fixes within existing architecture.

---

## Phase 0: Research

### Research Tasks

1. **ResolvedConfig Type Design**: Determine exact shape for single-source-of-truth object
2. **Vitest Spy Pattern**: Confirm best practice for function call counting in Vitest
3. **Exit Code Verification**: Understand current exit code paths in validate and config init commands
4. **Dual Platform Config Generation**: Determine YAML structure for both GitHub and ADO reporting
5. **TTY Detection**: Confirm process.stdin.isTTY behavior in CI environments

### Findings

See [research.md](./research.md) for detailed findings.

---

## Phase 1: Design & Contracts

### Data Model

See [data-model.md](./data-model.md) for complete type definitions.

**Key Changes:**

1. **ResolvedConfig** (new type):

   ```typescript
   interface ResolvedConfig {
     provider: LlmProvider | null;
     model: string;
     keySource: string; // e.g., 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'
     configSource: 'env' | 'config' | 'default';
   }
   ```

2. **PreflightResult** (extended):
   ```typescript
   interface PreflightResult {
     valid: boolean;
     errors: string[];
     warnings: string[]; // NEW: for informational messages
     resolved?: ResolvedConfig; // NEW: single source of truth
   }
   ```

### Contracts

No new API contracts needed—this is internal refactoring. All changes are to internal types and function signatures.

### Quickstart

See [quickstart.md](./quickstart.md) for testing guide.

---

## Implementation Phases

### Phase 2: P1 Fix - Auto-Applied Model Propagation

**Files:**

- `router/src/phases/preflight.ts` - Return ResolvedConfig
- `router/src/main.ts` - Use resolvedConfig from preflight result

**Changes:**

1. Modify `runPreflightChecks` to return `resolvedConfig` in PreflightResult
2. Modify `runReview` to update `agentContext.effectiveModel` from `preflightResult.resolved.model`
3. Remove duplicate `resolveEffectiveModel` call in main.ts (use preflight result only)

### Phase 3: P2 Fix - Ollama URL Optional

**Files:**

- `router/src/preflight.ts` - Skip OLLAMA_BASE_URL in validateExplicitProviderKeys

**Changes:**

1. In `validateExplicitProviderKeys`, skip validation for `provider: ollama` (OLLAMA_BASE_URL has default)
2. Add URL format validation if OLLAMA_BASE_URL is explicitly set (scheme + host check)
3. Keep existing `validateOllamaConfig` unchanged (already returns valid:true)

### Phase 4: P2 Fix - Config Init Validation

**Files:**

- `router/src/main.ts` - Config init command handler

**Changes:**

1. Build minimal AgentContext like the validate command does (not undefined)
2. Use same pattern: create context with resolved effective model
3. Handle warnings vs errors for exit code determination

### Phase 5: P3 Fix - Both Platform Option

**Files:**

- `router/src/main.ts` - Config init command handler
- `router/src/cli/config-wizard.ts` - generateDefaultConfig function

**Changes:**

1. When platform is 'both', generate both `reporting.github` and `reporting.ado` blocks
2. Add platform environment detection in preflight (FR-013)
3. Emit warning listing exact env vars checked when neither platform detected

### Phase 6: Exit Code & CI Semantics

**Files:**

- `router/src/main.ts` - validate command and config init command

**Changes:**

1. validate: exit 1 only if `errors.length > 0`, exit 0 otherwise
2. config init: print warnings, exit 0 unless errors exist
3. Ensure warnings never cause non-zero exit
4. **Wizard cancellation (Ctrl+C/EOF)**: exit 0 (FR-023)
5. **Non-TTY without `--defaults`**: exit 1 immediately with single-line error (FR-024)
6. **validate/review never prompt**: fail fast with error if input needed (FR-025, FR-026)

**Non-TTY Error Message:**

```
Error: Interactive mode requires a TTY. Use --defaults flag with --provider and --platform options.
```

### Phase 7: Regression Tests

**Files:**

- `router/src/__tests__/resolution-guardrail.test.ts` (new)
- `router/src/__tests__/validate-review-parity.test.ts` (new)
- `router/src/__tests__/preflight.test.ts`
- `router/src/__tests__/config-wizard.test.ts`

**Tests:**

1. Spy on `resolveEffectiveModelWithDefaults`—assert called exactly once per command
2. Verify AgentContext.effectiveModel matches ResolvedConfig.model
3. **Validate/review parity**: Run both on same repo/env, assert resolved tuple identical (FR-021)
4. **No extra resolution branches in validate**: Verify validate doesn't resolve more than review (FR-022)
5. Ollama provider without OLLAMA_BASE_URL passes validation
6. Ollama with invalid URL format fails validation
7. "Both" platform generates both reporting blocks
8. "Both" platform warning when no CI env detected
9. Exit code 0 with warnings only
10. Exit code 1 with errors
11. **Wizard cancel → exit 0** (FR-023)
12. **Non-TTY without --defaults → exit 1** with actionable message (FR-024)
13. **validate/review don't hang on stdin** (FR-026)

---

## Risk Assessment

| Risk                      | Likelihood | Impact | Mitigation                                      |
| ------------------------- | ---------- | ------ | ----------------------------------------------- |
| Breaking existing configs | Low        | High   | Additive changes only; no schema changes        |
| Test flakiness with spies | Medium     | Low    | Use Vitest's deterministic spy implementation   |
| Exit code behavior change | Low        | Medium | Document and test explicitly                    |
| CI hang on stdin          | Low        | High   | FR-026 requires no stdin reads; test in non-TTY |

## Dependencies

None—all changes are within the router module. No external dependencies added.

## Success Verification

Per spec success criteria:

- SC-001: Single-key setup review completes (manual test)
- SC-002: Ollama config validates without OLLAMA_BASE_URL (automated test)
- SC-003: Config init completes without crash (automated test)
- SC-004: "Both" platform generates dual blocks (automated test)
- SC-005–SC-010: Covered by regression tests
- SC-011: Validate/review parity test (automated)
- SC-012: Wizard cancel → exit 0 (automated)
- SC-013: Non-TTY → exit 1 with message (automated)
- SC-014: No CI stdin hang (automated with non-TTY mock)
