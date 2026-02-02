# Implementation Plan: Local Review Mode & Terminal Reporter

**Branch**: `407-local-review-mode` | **Date**: 2026-02-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/407-local-review-mode/spec.md`

## Implementation Status

| Phase | Name                     | Status      | Tests     | Notes                                        |
| ----- | ------------------------ | ----------- | --------- | -------------------------------------------- |
| 1     | Setup & Type Definitions | ✅ Complete | -         | All types and barrel exports created         |
| 2     | CLI Output Utilities     | ✅ Complete | 63 tests  | colors, progress, errors modules             |
| 3     | Git Context Module       | ✅ Complete | 25 tests  | Full implementation with contract compliance |
| 4     | Local Diff Generation    | ✅ Complete | 19 tests  | getLocalDiff() added to diff.ts              |
| 5     | Terminal Reporter        | ✅ Complete | 104 tests | Pretty, JSON, SARIF output modes             |
| 6     | CLI Options Module       | ✅ Complete | 50 tests  | Options parsing + Unicode detection          |
| 7     | Zero-Config Defaults     | ✅ Complete | 30 tests  | Provider detection, config generation        |
| 8     | Local Review Command     | ✅ Complete | 15 tests  | Orchestration layer with signal handling     |
| 9     | Command Registration     | ✅ Complete | 7 tests   | main.ts integration + smoke test             |
| 10    | npm Package Config       | ⏳ Pending  | -         | Publishing setup                             |
| 11    | PR Lessons Learned       | ⏳ Pending  | -         | Security compliance tests                    |
| 12    | Victory Gates            | ⏳ Pending  | -         | Final validation                             |

**Last Updated**: 2026-02-02 (Phases 1-9 complete, 2893 tests passing)

## Summary

Extend odd-ai-reviewers from a CI-only tool to support local developer workflows by:

1. Adding a new `ai-review <path>` command for local review
2. Implementing a Terminal reporter for console output
3. Publishing the CLI package to npm as `@oddessentials/ai-review`

The implementation reuses 80%+ of existing infrastructure (agent execution, finding processing, deduplication) while adding git context inference and terminal-specific output formatting.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Commander 14.x (CLI), Zod 4.x (validation), existing agent SDKs
**Storage**: N/A (stateless per run, uses existing file-based cache)
**Testing**: Vitest 4.x (unit/integration tests)
**Target Platform**: Node.js >=22.0.0, cross-platform (Windows, macOS, Linux)
**Project Type**: Single project (extends existing router package)
**Performance Goals**: First review in <60s, config iteration <10s, pre-commit within hook limits
**Constraints**: No new runtime dependencies preferred, reuse existing patterns
**Scale/Scope**: Local developer workflow, single repository at a time

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status     | Notes                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass    | Terminal reporter outputs to stdout, no external API posting                                                                                                                                                                                                                                                                    |
| II. Structured Findings Contract | ✅ Pass    | Uses existing Finding schema, dedup, sorting                                                                                                                                                                                                                                                                                    |
| III. Provider-Neutral Core       | ✅ Pass    | Terminal is just another output target                                                                                                                                                                                                                                                                                          |
| IV. Security-First Design        | ✅ Pass    | Reuses existing input validation                                                                                                                                                                                                                                                                                                |
| V. Deterministic Outputs         | ✅ Pass    | Same sorting/dedup as CI mode                                                                                                                                                                                                                                                                                                   |
| VI. Bounded Resources            | ✅ Pass    | Existing limits enforced                                                                                                                                                                                                                                                                                                        |
| VII. Environment Discipline      | ⚠️ Partial | Local mode operates outside CI by design. Justification: (1) Developer workflow feature complementing CI, not replacing it; (2) All security invariants still apply (shell:false, redaction, path validation); (3) Resource bounds still enforced; (4) No production publishing from local mode. Acceptable per Principle VIII. |
| VIII. Explicit Non-Goals         | ✅ Pass    | Complements CI, doesn't replace it                                                                                                                                                                                                                                                                                              |

**Gate Status**: PASSED (no violations requiring justification)

## Project Structure

### Documentation (this feature)

```text
specs/407-local-review-mode/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions
├── quickstart.md        # Developer quickstart guide
├── definition-of-done.md
├── victory-gates.md
├── cli-invariants.md
├── contracts/
│   ├── cli-interface.md     # CLI command contract
│   ├── terminal-reporter.md # Reporter module contract
│   └── git-context.md       # Git context module contract
└── checklists/
    └── requirements.md      # Quality checklist
```

### Source Code (repository root)

```text
router/
├── src/
│   ├── main.ts                          # THIN: Command registration only (~50 lines added)
│   ├── diff.ts                          # MODIFY: Add getLocalDiff()
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── local-review.ts          # NEW: Local review orchestration
│   │   │   └── index.ts                 # NEW: Command registry
│   │   ├── options/
│   │   │   ├── local-review-options.ts  # NEW: Option parsing + validation
│   │   │   └── index.ts                 # NEW: Options exports
│   │   ├── output/
│   │   │   ├── colors.ts                # NEW: ANSI utilities, NO_COLOR support
│   │   │   ├── progress.ts              # NEW: Spinners, agent status
│   │   │   ├── errors.ts                # NEW: CLI error formatting
│   │   │   └── index.ts                 # NEW: Output exports
│   │   ├── git-context.ts               # NEW: Git repository inference
│   │   ├── signals.ts                   # NEW: Ctrl+C, graceful shutdown
│   │   ├── config-wizard.ts             # EXISTS
│   │   ├── interactive-prompts.ts       # EXISTS
│   │   └── validation-report.ts         # EXISTS
│   ├── config/
│   │   └── zero-config.ts               # NEW: Zero-config defaults generation
│   ├── report/
│   │   ├── terminal.ts                  # NEW: Terminal reporter
│   │   ├── github.ts                    # EXISTS: GitHub reporter
│   │   ├── ado.ts                       # EXISTS: ADO reporter
│   │   ├── formats.ts                   # REUSE: Formatting utilities
│   │   └── base.ts                      # REUSE: Common utilities
│   ├── phases/
│   │   ├── execute.ts                   # REUSE: Agent execution
│   │   ├── preflight.ts                 # REUSE: Validation
│   │   └── report.ts                    # MODIFY: Add terminal dispatch
│   └── types/
│       └── ...                          # REUSE: Existing types
├── tests/
│   ├── unit/
│   │   ├── cli/
│   │   │   ├── output/                  # NEW: Colors, progress, errors tests
│   │   │   ├── options/                 # NEW: Option parsing tests
│   │   │   ├── commands/                # NEW: Command tests
│   │   │   ├── git-context.test.ts      # NEW
│   │   │   └── signals.test.ts          # NEW
│   │   ├── config/
│   │   │   └── zero-config.test.ts      # NEW
│   │   └── report/
│   │       ├── terminal.test.ts         # NEW
│   │       ├── terminal-json.test.ts    # NEW
│   │       └── terminal-sarif.test.ts   # NEW
│   ├── integration/
│   │   └── local-review.test.ts         # NEW
│   ├── security/                        # NEW: PR Lessons Learned compliance
│   │   ├── redaction.test.ts
│   │   ├── child-process.test.ts
│   │   ├── path-traversal.test.ts
│   │   ├── error-messages.test.ts
│   │   └── git-ref-sanitization.test.ts
│   ├── schema/                          # NEW: Schema compliance
│   │   ├── json-output.test.ts
│   │   ├── sarif-output.test.ts
│   │   └── version-sync.test.ts
│   └── reliability/                     # NEW: Reliability compliance
│       ├── floating-promises.test.ts
│       ├── run-summary.test.ts
│       └── config-preservation.test.ts
└── package.json                         # MODIFY: Name, bin, publish config
```

**Architecture Decision**: Modular CLI design with thin main.ts (~50 lines added) and testable isolated modules. This enables:

- Isolated unit testing per module
- Parallel development across modules
- Easy maintenance and refactoring
- Clear separation of concerns

## Complexity Tracking

No violations requiring justification. Implementation follows existing patterns.

---

## Implementation Phases

> **Note**: This plan follows a modular architecture with 12 phases. Phase 11 (PR Lessons Learned Compliance) is a **mandatory gate** that must pass before Victory Gates. See tasks.md for detailed task breakdown.

### Phase 1: Setup & Type Definitions

**Goal**: Scaffolding and type definitions for new modules

**New Files**:

- `router/src/cli/git-context.ts` (types only)
- `router/src/cli/options/local-review-options.ts` (types only)
- `router/src/cli/output/errors.ts` (types only)
- `router/src/report/terminal.ts` (types only)
- Barrel exports for all new directories

**Checkpoint**: All new modules scaffolded with type exports

---

### Phase 2: CLI Output Utilities

**Goal**: Testable utilities for terminal output (colors, progress, errors)

**New Files**:

- `router/src/cli/output/colors.ts` - ANSI color codes, NO_COLOR/FORCE_COLOR support
- `router/src/cli/output/progress.ts` - Spinner, agent status tracking
- `router/src/cli/output/errors.ts` - CLI error formatters

**Tests**: 21 test cases for colors, progress, and error formatting

**Checkpoint**: All CLI output utilities tested in isolation

---

### Phase 3: Git Context Module

**Goal**: Git repository detection and context inference

**New Files**:

- `router/src/cli/git-context.ts` (full implementation)

**Key Functions**:

```typescript
inferGitContext(cwd: string): Result<GitContext, GitContextError>
findGitRoot(cwd: string): Result<string, GitContextError>
getCurrentBranch(repoPath: string): string
detectDefaultBranch(repoPath: string): string
hasUncommittedChanges(repoPath: string): boolean
hasStagedChanges(repoPath: string): boolean
```

**Tests**: 21 test cases for git context inference

**Checkpoint**: Git context inference fully tested

---

### Phase 4: Local Diff Generation

**Goal**: Extend diff.ts to support working tree and staged diffs

**Modified Files**:

- `router/src/diff.ts` (add `getLocalDiff()`)

**Key Functions**:

```typescript
getLocalDiff(repoPath: string, options: LocalDiffOptions): DiffSummary
```

**Tests**: 8 test cases for local diff generation

**Checkpoint**: Local diff generation tested, foundation complete

---

### Phase 5: Terminal Reporter

**Goal**: Format findings for terminal display

**New Files**:

- `router/src/report/terminal.ts` (full implementation)

**Key Functions**:

```typescript
reportToTerminal(
  findings: Finding[],
  partialFindings: Finding[],
  context: TerminalContext,
  config: Config,
  diffFiles: DiffFile[]
): Promise<TerminalReportResult>

formatFindingForTerminal(finding: Finding, context: TerminalContext): string
generateTerminalSummary(...): string
```

**Features**:

- Pretty format with colors and boxes
- JSON format with `schema_version` field (FR-SCH-001)
- SARIF 2.1.0 format with `$schema` reference (FR-SCH-002)
- Progress indicators during execution
- Quiet mode for pre-commit hooks

**Tests**: 21 test cases for formatting and output modes

**Checkpoint**: Terminal reporter fully tested with all output modes

---

### Phase 6: CLI Options Module

**Goal**: Parse, validate, and apply defaults to CLI options

**New Files**:

- `router/src/cli/options/local-review-options.ts` (full implementation)

**Key Functions**:

```typescript
parseLocalReviewOptions(rawOptions): Result<LocalReviewOptions, ValidationError>
applyOptionDefaults(options, gitContext): LocalReviewOptions
resolveOutputFormat(options): OutputFormat
resolveBaseRef(options, gitContext): string
```

**Tests**: 13 test cases for parsing, validation, and defaults

**Checkpoint**: Options parsing fully tested

---

### Phase 7: Zero-Config Defaults

**Goal**: Work out of the box without configuration

**New Files**:

- `router/src/config/zero-config.ts`

**Behavior**:

1. Detect API provider from environment
2. Generate minimal config with single AI pass
3. Apply conservative limits (10 findings, $0.10 budget)
4. Display clear indication of default mode

**Tests**: 8 test cases for provider detection and config generation

**Checkpoint**: Zero-config mode fully tested

---

### Phase 8: Local Review Command

**Goal**: Orchestrate the local review flow

**New Files**:

- `router/src/cli/commands/local-review.ts`
- `router/src/cli/signals.ts`

**Key Functions**:

```typescript
runLocalReview(options: LocalReviewOptions, deps: Dependencies): Promise<number>
setupSignalHandlers(cleanup: () => void): void
```

**Integration Points**:

- Git context inference
- Config loading (with zero-config fallback)
- Local diff generation
- Existing `executeAllPasses()`
- Terminal reporter
- Graceful shutdown on Ctrl+C

**Tests**: 14 test cases for command orchestration

**Checkpoint**: Local review command tested with mocked dependencies

---

### Phase 9: Command Registration & Integration

**Goal**: Wire everything into main.ts (thin layer)

**Modified Files**:

- `router/src/main.ts` (~50 lines added)
- `router/src/phases/report.ts` (add terminal dispatch)

**Command Signature**:

```
ai-review <path> [options]
```

**CLI Options**:

- `--base <ref>`, `--head <ref>`, `--range <range>`
- `--staged`, `--uncommitted`
- `--pass <name>`, `--agent <id>`
- `--format <fmt>`, `--no-color`
- `--quiet`, `--verbose`
- `--dry-run`, `--cost-only`
- `-c, --config <path>`

**Tests**: 1 smoke test (end-to-end with real git repo)

**Checkpoint**: Local review command works end-to-end

---

### Phase 10: npm Package Configuration

**Goal**: Publishable package on npm

**Modified Files**:

- `router/package.json` (name, bin, files)
- `router/README.md` (local review docs, quickstart)
- `.github/workflows/npm-publish.yml` (new)

**Changes**:

- Update package name to `@oddessentials/ai-review`
- Update bin entry to expose `ai-review` executable
- Add publish workflow

**Checkpoint**: Package ready for npm publish

---

### Phase 11: PR Lessons Learned Compliance (MANDATORY)

> **GATE**: This phase is non-negotiable. PRs failing these tests will be rejected.
> Derived from PR_LESSONS_LEARNED.md (124 PRs, 704 review comments).

**Goal**: Verify compliance with security and contract requirements

**New Test Files**:

**Security Compliance** (`router/tests/security/`):

- `redaction.test.ts` - Verify secrets redacted in ALL output paths (FR-SEC-001)
- `child-process.test.ts` - Verify no `shell: true` in codebase (FR-SEC-002)
- `path-traversal.test.ts` - Verify path validation prevents escapes (FR-SEC-003)
- `error-messages.test.ts` - Verify no sensitive values echoed (FR-SEC-004)
- `git-ref-sanitization.test.ts` - Verify malicious refs rejected (FR-SEC-005)

**Schema Compliance** (`router/tests/schema/`):

- `json-output.test.ts` - Verify JSON includes `schema_version` (FR-SCH-001)
- `sarif-output.test.ts` - Verify SARIF includes `$schema` (FR-SCH-002)
- `version-sync.test.ts` - Verify runtime version = package.json (FR-SCH-005)

**Reliability Compliance** (`router/tests/reliability/`):

- `floating-promises.test.ts` - TypeScript strict + lint (FR-REL-001)
- `run-summary.test.ts` - Verify summary on failure (FR-REL-003)
- `config-preservation.test.ts` - Verify probe failures preserve config (FR-REL-003)

**Tests**: 11 compliance tests

**Checkpoint**: PR Lessons Learned compliance verified - security gates pass

---

### Phase 12: Victory Gates & Final Validation

**Goal**: Verify all acceptance criteria

**Integration Tests**:

- Full flow test
- Zero-config mode test
- Error handling tests
- Pre-commit simulation test

**Victory Gates** (from victory-gates.md):

| Gate                        | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| Local Parity Gate           | Same diff + config → identical findings (local vs CI) |
| Zero-Config Gate            | Fresh repo without .ai-review.yml works               |
| Performance Gate            | Local review completes in <60s                        |
| Determinism Gate            | Multiple runs produce identical output                |
| Cross-Platform Gate         | Test on Windows, macOS, Linux                         |
| Regression Gate             | Existing CI commands still work                       |
| **PR Lessons Learned Gate** | All Phase 11 security tests pass                      |

**Checkpoint**: All victory gates pass - ready for release

---

## Dependencies Between Phases

```
Phase 1 (Types) ─────────────────────────────────────────────────────────┐
     │                                                                    │
     ▼                                                                    │
Phase 2 (CLI Output) ──┬─────────────────────────────────────────────────┤
     │                 │                                                  │
     ▼                 │                                                  │
Phase 3 (Git Context) ─┤                                                  │
     │                 │                                                  │
     ▼                 │                                                  │
Phase 4 (Local Diff) ──┴───────────────────┐                              │
                                           │                              │
                                           ▼                              │
                                    Phase 5 (Terminal Reporter) ──────────┤
                                           │                              │
                                           ▼                              │
                                    Phase 6 (Options) ────────────────────┤
                                           │                              │
                                           ▼                              │
                                    Phase 7 (Zero-Config) ────────────────┤
                                           │                              │
                                           ▼                              │
                                    Phase 8 (Local Review Command) ───────┤
                                           │                              │
                                           ▼                              │
                                    Phase 9 (Command Registration) ───────┘
                                           │
                                           ▼
                                    Phase 10 (npm Package)
                                           │
                                           ▼
                                    Phase 11 (PR Lessons Learned) ◄── MANDATORY GATE
                                           │
                                           ▼
                                    Phase 12 (Victory Gates)
```

---

## Risk Mitigation

| Risk                       | Mitigation                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| Performance on large repos | Add diff size warning, suggest `--range`                                   |
| API cost concerns          | `--cost-only` flag, clear cost display                                     |
| Cross-platform issues      | Test on all 3 OSes, avoid shell-specific code                              |
| Breaking existing CI       | Run full test suite, regression gate                                       |
| Security vulnerabilities   | Phase 11 mandatory gate, PR_LESSONS_LEARNED.md compliance                  |
| Secret leakage in output   | Redaction tests for ALL output paths (FR-SEC-001)                          |
| Command injection          | `shell: false` enforcement (FR-SEC-002), git ref sanitization (FR-SEC-005) |
| Schema drift               | Explicit `schema_version` in JSON, `$schema` in SARIF                      |

---

## Artifacts Generated

| Artifact                       | Purpose                        | Status      |
| ------------------------------ | ------------------------------ | ----------- |
| research.md                    | Technical decisions            | ✅ Complete |
| data-model.md                  | Entity definitions             | ✅ Complete |
| quickstart.md                  | Developer guide                | ✅ Complete |
| contracts/cli-interface.md     | CLI contract                   | ✅ Complete |
| contracts/terminal-reporter.md | Reporter contract              | ✅ Complete |
| contracts/git-context.md       | Git module contract            | ✅ Complete |
| checklists/code-review.md      | Mandatory PR review checklist  | ✅ Complete |
| checklists/requirements.md     | Spec quality validation        | ✅ Complete |
| cli-invariants.md              | Non-negotiable CLI principles  | ✅ Complete |
| definition-of-done.md          | Phase completion criteria      | ✅ Complete |
| victory-gates.md               | Merge gates with parity checks | ✅ Complete |

---

## PR Lessons Learned Compliance

> Phase 407 implementation MUST comply with PR_LESSONS_LEARNED.md. Any deviation requires explicit justification in the PR description.

This plan incorporates lessons learned from 124 PRs and 704 review comments. Key compliance areas:

### Security (FR-SEC-001 to FR-SEC-007)

- Secret redaction in ALL output paths (terminal, JSON, SARIF, logs)
- No `shell: true` in child_process calls
- Path traversal prevention (paths stay within repo root)
- Error messages do not echo sensitive values
- Git refs sanitized before passing to commands

### Schema & Contract (FR-SCH-001 to FR-SCH-005)

- JSON output includes `schema_version` field
- SARIF output includes `$schema` reference
- Runtime version matches package.json version
- Config schema evolution handled gracefully

### Reliability (FR-REL-001 to FR-REL-004)

- No floating promises (all async operations awaited)
- Derived values clamped to valid ranges
- Run summary produced even on failure
- Documentation examples use actual parameter names

**Enforcement**: Phase 11 is a mandatory gate. All PRs must pass the code review checklist in `checklists/code-review.md`.

---

## Session Breakdown

Implementation is organized into 7 sessions with test gates:

| Session | Phases | Focus                  | Test Cases | Exit Criteria                                 |
| ------- | ------ | ---------------------- | ---------- | --------------------------------------------- |
| 1       | 1-4    | Foundation             | 45+        | `pnpm test cli/output git-context local-diff` |
| 2       | 5      | Terminal Reporter      | 21         | `pnpm test report/terminal`                   |
| 3       | 6-7    | Options & Zero-Config  | 21         | `pnpm test cli/options config/zero-config`    |
| 4       | 8      | Local Review Command   | 14         | `pnpm test cli/commands cli/signals`          |
| 5       | 9-10   | Integration & npm      | 1          | `ai-review .` works, `npx` works              |
| 6       | 11     | **PR Lessons Learned** | 13         | `pnpm test security schema reliability`       |
| 7       | 12     | Victory Gates          | 15         | All victory gates pass (incl. cross-platform) |

**Total**: 149 tasks, 142+ test cases

---

## Next Steps

Implementation task list is available in `tasks.md`. Run `/speckit.implement` to begin execution.
