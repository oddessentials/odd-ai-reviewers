# Implementation Plan: Local Review Mode & Terminal Reporter

**Branch**: `407-local-review-mode` | **Date**: 2026-02-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/407-local-review-mode/spec.md`

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

| Principle                        | Status     | Notes                                                        |
| -------------------------------- | ---------- | ------------------------------------------------------------ |
| I. Router Owns All Posting       | ✅ Pass    | Terminal reporter outputs to stdout, no external API posting |
| II. Structured Findings Contract | ✅ Pass    | Uses existing Finding schema, dedup, sorting                 |
| III. Provider-Neutral Core       | ✅ Pass    | Terminal is just another output target                       |
| IV. Security-First Design        | ✅ Pass    | Reuses existing input validation                             |
| V. Deterministic Outputs         | ✅ Pass    | Same sorting/dedup as CI mode                                |
| VI. Bounded Resources            | ✅ Pass    | Existing limits enforced                                     |
| VII. Environment Discipline      | ⚠️ Partial | Local mode is outside CI; documented as dev tool             |
| VIII. Explicit Non-Goals         | ✅ Pass    | Complements CI, doesn't replace it                           |

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
│   ├── main.ts              # MODIFY: Add local review command
│   ├── diff.ts              # MODIFY: Add getLocalDiff()
│   ├── config.ts            # EXTEND: Zero-config defaults
│   ├── cli/
│   │   ├── git-context.ts   # NEW: Git context inference
│   │   ├── config-wizard.ts # EXISTS: Config generation
│   │   └── interactive-prompts.ts
│   ├── report/
│   │   ├── terminal.ts      # NEW: Terminal reporter
│   │   ├── github.ts        # EXISTS: GitHub reporter
│   │   ├── ado.ts           # EXISTS: ADO reporter
│   │   ├── formats.ts       # REUSE: Formatting utilities
│   │   └── base.ts          # REUSE: Common utilities
│   ├── phases/
│   │   ├── execute.ts       # REUSE: Agent execution
│   │   ├── preflight.ts     # REUSE: Validation
│   │   └── report.ts        # MODIFY: Add terminal dispatch
│   └── types/
│       └── ...              # REUSE: Existing types
├── tests/
│   ├── unit/
│   │   ├── git-context.test.ts    # NEW
│   │   └── terminal-reporter.test.ts # NEW
│   └── integration/
│       └── local-review.test.ts   # NEW
└── package.json             # MODIFY: Name, bin, publish config
```

**Structure Decision**: Extends existing single-project structure. New modules integrate into established patterns.

## Complexity Tracking

No violations requiring justification. Implementation follows existing patterns.

---

## Implementation Phases

### Phase 1: Git Context & Local Diff (Foundation)

**Goal**: Enable the system to understand local repository state

**New Files**:

- `router/src/cli/git-context.ts`

**Modified Files**:

- `router/src/diff.ts` (add `getLocalDiff()`)

**Key Functions**:

```typescript
// git-context.ts
inferGitContext(cwd: string): Result<GitContext, GitContextError>
findGitRoot(cwd: string): Result<string, GitContextError>
getCurrentBranch(repoPath: string): string
detectDefaultBranch(repoPath: string): string
hasUncommittedChanges(repoPath: string): boolean
hasStagedChanges(repoPath: string): boolean

// diff.ts (new)
getLocalDiff(repoPath: string, baseRef: string, options: LocalDiffOptions): DiffSummary
```

**Tests**: Unit tests for all git context functions

---

### Phase 2: Terminal Reporter

**Goal**: Rich console output for findings

**New Files**:

- `router/src/report/terminal.ts`

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
- JSON format for scripting
- SARIF format for IDE integration
- Progress indicators during execution
- Quiet mode for pre-commit hooks

**Tests**: Unit tests for formatting, integration tests for output modes

---

### Phase 3: Local Review Command

**Goal**: New CLI command for local review

**Modified Files**:

- `router/src/main.ts`

**Command Signature**:

```
ai-review <path> [options]
```

**Integration Points**:

- Git context inference
- Config loading (or zero-config defaults)
- Existing `executeAllPasses()`
- Terminal reporter

**Tests**: Integration tests for full command flow

---

### Phase 4: Zero-Config Defaults

**Goal**: Work out of the box without configuration

**New/Modified Files**:

- `router/src/config.ts` (add `generateZeroConfigDefaults()`)

**Behavior**:

1. Detect API provider from environment
2. Generate minimal config with single AI pass
3. Apply conservative limits
4. Display clear indication of default mode

**Tests**: Unit tests for config generation

---

### Phase 5: npm Publishing

**Goal**: Publishable package on npm

**Modified Files**:

- `router/package.json`
- `.github/workflows/publish.yml` (new)

**Changes**:

- Update package name to `@oddessentials/ai-review`
- Update bin entry
- Add npm publish workflow
- Update README

**Tests**: Manual publish verification

---

### Phase 6: Victory Gate Validation

**Goal**: Verify all acceptance criteria

**Gates** (from victory-gates.md):

1. Local Parity Gate - Same findings as CI
2. Zero-Config Gate - Works without config
3. Performance Gate - Within time limits
4. Determinism Gate - Stable outputs
5. UX Clarity Gate - Actionable without docs
6. Cross-Platform Gate - Windows/macOS/Linux
7. Regression Gate - No CI breakage

---

## Dependencies Between Phases

```
Phase 1: Git Context ──┬──> Phase 3: Local Review Command
                       │
Phase 2: Terminal ─────┤
                       │
Phase 4: Zero-Config ──┘
                       │
                       v
              Phase 5: npm Publishing
                       │
                       v
              Phase 6: Victory Gates
```

---

## Risk Mitigation

| Risk                       | Mitigation                                    |
| -------------------------- | --------------------------------------------- |
| Performance on large repos | Add diff size warning, suggest `--range`      |
| API cost concerns          | `--cost-only` flag, clear cost display        |
| Cross-platform issues      | Test on all 3 OSes, avoid shell-specific code |
| Breaking existing CI       | Run full test suite, regression gate          |

---

## Artifacts Generated

| Artifact                       | Purpose             | Status      |
| ------------------------------ | ------------------- | ----------- |
| research.md                    | Technical decisions | ✅ Complete |
| data-model.md                  | Entity definitions  | ✅ Complete |
| quickstart.md                  | Developer guide     | ✅ Complete |
| contracts/cli-interface.md     | CLI contract        | ✅ Complete |
| contracts/terminal-reporter.md | Reporter contract   | ✅ Complete |
| contracts/git-context.md       | Git module contract | ✅ Complete |

---

## Next Steps

Run `/speckit.tasks` to generate the implementation task list based on this plan.
