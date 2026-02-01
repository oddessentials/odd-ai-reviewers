# Tasks: Local Review Mode & Terminal Reporter

**Input**: Design documents from `/specs/407-local-review-mode/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Architecture**: Modular CLI design with thin main.ts and testable isolated modules.

**Organization**: Tasks are grouped by module to enable isolated testing and parallel development.

## Module Architecture

```
router/src/
├── main.ts                          # THIN: Command registration only (~50 lines added)
├── cli/
│   ├── commands/
│   │   ├── local-review.ts          # NEW: Local review orchestration
│   │   └── index.ts                 # NEW: Command registry
│   ├── options/
│   │   ├── local-review-options.ts  # NEW: Option parsing + validation
│   │   └── index.ts                 # NEW: Options exports
│   ├── output/
│   │   ├── colors.ts                # NEW: ANSI utilities, NO_COLOR support
│   │   ├── progress.ts              # NEW: Spinners, agent status
│   │   ├── errors.ts                # NEW: CLI error formatting
│   │   └── index.ts                 # NEW: Output exports
│   ├── git-context.ts               # NEW: Git repository inference
│   ├── signals.ts                   # NEW: Ctrl+C, graceful shutdown
│   ├── config-wizard.ts             # EXISTS
│   ├── interactive-prompts.ts       # EXISTS
│   └── validation-report.ts         # EXISTS
├── config/
│   └── zero-config.ts               # NEW: Zero-config defaults generation
├── diff.ts                          # MODIFY: Add getLocalDiff()
└── report/
    └── terminal.ts                  # NEW: Terminal reporter
```

## Format: `[ID] [P?] [Module] Description`

- **[P]**: Can run in parallel with other [P] tasks (different files)
- **[Module]**: Which module this task belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup & Type Definitions

**Purpose**: Scaffolding and type definitions for new modules

**Duration**: ~15 minutes

### Type Definitions

- [x] T001 [P] Define GitContext and GitContextError types in router/src/cli/git-context.ts (empty module with exports)
- [x] T002 [P] Define TerminalContext and TerminalReportResult types in router/src/report/terminal.ts (empty module with exports)
- [x] T003 [P] Define LocalReviewOptions type in router/src/cli/options/local-review-options.ts (empty module with exports)
- [x] T004 [P] Define OutputFormat type ('pretty' | 'json' | 'sarif') in router/src/cli/options/local-review-options.ts
- [x] T005 [P] Define CLIError types (NotAGitRepoError, NoCredentialsError, NoChangesError) in router/src/cli/output/errors.ts

### Module Scaffolding

- [x] T006 [P] Create router/src/cli/output/index.ts barrel export
- [x] T007 [P] Create router/src/cli/options/index.ts barrel export
- [x] T008 [P] Create router/src/cli/commands/index.ts barrel export

**Checkpoint**: All new modules scaffolded with type exports

---

## Phase 2: CLI Output Utilities

**Purpose**: Testable utilities for terminal output (colors, progress, errors)

**Duration**: ~1 hour

### Colors Module (router/src/cli/output/colors.ts)

- [x] T009 Implement ANSI color code constants (red, yellow, blue, green, gray, bold, reset)
- [x] T010 Implement supportsColor() detection (TTY check, NO_COLOR, FORCE_COLOR env vars)
- [x] T011 Implement colorize(text, color) wrapper that respects supportsColor()
- [x] T012 Implement severity color mapping (error→red, warning→yellow, info→blue)

### Colors Tests

- [x] T013 [P] Create router/tests/unit/cli/output/colors.test.ts with NO_COLOR tests (3 cases)
- [x] T014 [P] Create router/tests/unit/cli/output/colors.test.ts with FORCE_COLOR tests (3 cases)
- [x] T015 [P] Create router/tests/unit/cli/output/colors.test.ts with TTY detection tests (2 cases)

### Progress Module (router/src/cli/output/progress.ts)

- [x] T016 Implement Spinner class with start(), stop(), update() methods
- [x] T017 Implement spinner frames (Unicode and ASCII fallback)
- [x] T018 Implement AgentProgress tracker (agent name, status: pending|running|done|failed)
- [x] T019 Implement formatAgentStatus() with checkmarks (✓/✗) and timing

### Progress Tests

- [x] T020 [P] Create router/tests/unit/cli/output/progress.test.ts with spinner tests (4 cases)
- [x] T021 [P] Create router/tests/unit/cli/output/progress.test.ts with agent status tests (4 cases)

### Errors Module (router/src/cli/output/errors.ts)

- [x] T022 Implement formatCLIError(error) → formatted terminal string
- [x] T023 Implement NotAGitRepoError formatter with guidance message
- [x] T024 Implement NoCredentialsError formatter with env var instructions
- [x] T025 Implement NoChangesError formatter with success styling
- [x] T026 Implement InvalidConfigError formatter with validation details

### Errors Tests

- [x] T027 [P] Create router/tests/unit/cli/output/errors.test.ts with all error formatters (5 cases)

**Checkpoint**: All CLI output utilities tested in isolation

---

## Phase 3: Git Context Module

**Purpose**: Git repository detection and context inference

**Duration**: ~1 hour

### Git Context Implementation (router/src/cli/git-context.ts)

- [x] T028 Implement findGitRoot(cwd: string) with filesystem traversal
- [x] T029 Implement getCurrentBranch(repoPath: string) using git rev-parse
- [x] T030 Implement detectDefaultBranch(repoPath: string) with priority: origin/HEAD → main → master → develop
- [x] T031 [P] Implement hasUncommittedChanges(repoPath: string) using git status --porcelain
- [x] T032 [P] Implement hasStagedChanges(repoPath: string) using git diff --cached --name-only
- [x] T033 Implement inferGitContext(cwd: string): Result<GitContext, GitContextError>

### Git Context Tests

- [x] T034 [P] Create router/tests/unit/cli/git-context.test.ts for findGitRoot (5 cases: found, not found, nested, symlink, error)
- [x] T035 [P] Create router/tests/unit/cli/git-context.test.ts for getCurrentBranch (3 cases: normal, detached HEAD, error)
- [x] T036 [P] Create router/tests/unit/cli/git-context.test.ts for detectDefaultBranch (4 cases: origin/HEAD, main, master, develop)
- [x] T037 [P] Create router/tests/unit/cli/git-context.test.ts for change detection (6 cases: uncommitted, staged, both, neither, error)
- [x] T038 Create router/tests/unit/cli/git-context.test.ts for inferGitContext integration (3 cases)

**Checkpoint**: Git context inference fully tested

---

## Phase 4: Local Diff Generation

**Purpose**: Extend diff.ts to support working tree and staged diffs

**Duration**: ~45 minutes

### Local Diff Implementation (router/src/diff.ts)

- [x] T039 Add LocalDiffOptions interface { baseRef: string, stagedOnly?: boolean, uncommitted?: boolean }
- [x] T040 Implement getLocalDiff(repoPath, options: LocalDiffOptions): DiffSummary
- [x] T041 Add working tree diff support (git diff HEAD)
- [x] T042 Add staged-only diff support (git diff --cached)
- [x] T043 Wire into existing filterFiles() and canonicalizeDiffFiles() pipeline

### Local Diff Tests

- [x] T044 [P] Create router/tests/unit/local-diff.test.ts for working tree diff (3 cases)
- [x] T045 [P] Create router/tests/unit/local-diff.test.ts for staged-only diff (3 cases)
- [x] T046 [P] Create router/tests/unit/local-diff.test.ts for base ref diff (2 cases)

**Checkpoint**: Local diff generation tested, foundation complete

---

## Phase 5: Terminal Reporter

**Purpose**: Format findings for terminal display

**Duration**: ~1.5 hours

### Terminal Reporter Core (router/src/report/terminal.ts)

- [x] T047 Implement box drawing utilities (Unicode borders, ASCII fallback)
- [x] T048 Implement code snippet extraction from diff patches (3 lines context)
- [x] T049 Implement formatFindingBox(finding, context) → single finding with border
- [x] T050 Implement formatFindingsList(findings, context) → all findings formatted
- [x] T051 Implement generateSummary(findings, stats) → summary section with counts
- [x] T052 Implement reportToTerminal(findings, partialFindings, context, config, diffFiles) main function

### Terminal Reporter Output Modes

- [x] T053 Implement quiet mode output (errors only, minimal summary)
- [x] T054 Implement verbose mode output (git context, agent details, timing breakdown)
- [x] T055 Implement JSON output format per data-model.md schema
- [x] T056 Implement SARIF 2.1.0 output format

### Terminal Reporter Tests

- [x] T057 [P] Create router/tests/unit/report/terminal.test.ts for box drawing (3 cases)
- [x] T058 [P] Create router/tests/unit/report/terminal.test.ts for code snippet extraction (4 cases)
- [x] T059 [P] Create router/tests/unit/report/terminal.test.ts for finding formatting (5 cases)
- [x] T060 [P] Create router/tests/unit/report/terminal.test.ts for summary generation (3 cases)
- [x] T061 [P] Create router/tests/unit/report/terminal-json.test.ts for JSON schema validation (3 cases)
- [x] T062 [P] Create router/tests/unit/report/terminal-sarif.test.ts for SARIF schema validation (3 cases)

**Checkpoint**: Terminal reporter fully tested with all output modes

---

## Phase 6: CLI Options Module

**Purpose**: Parse, validate, and apply defaults to CLI options

**Duration**: ~1 hour

### Options Implementation (router/src/cli/options/local-review-options.ts)

- [ ] T063 Implement parseLocalReviewOptions(rawOptions) → Result<LocalReviewOptions, ValidationError>
- [ ] T064 Implement option validation rules (mutually exclusive: range vs base/head, quiet vs verbose)
- [ ] T065 Implement applyOptionDefaults(options, gitContext) → options with defaults applied
- [ ] T066 Implement resolveOutputFormat(options) → OutputFormat with TTY detection
- [ ] T067 Implement resolveBaseRef(options, gitContext) → resolved base reference

### Options Tests

- [ ] T068 [P] Create router/tests/unit/cli/options/local-review-options.test.ts for parsing (5 cases)
- [ ] T069 [P] Create router/tests/unit/cli/options/local-review-options.test.ts for validation (4 cases)
- [ ] T070 [P] Create router/tests/unit/cli/options/local-review-options.test.ts for defaults (4 cases)

**Checkpoint**: Options parsing fully tested

---

## Phase 7: Zero-Config Defaults

**Purpose**: Generate sensible defaults when no .ai-review.yml exists

**Duration**: ~45 minutes

### Zero-Config Implementation (router/src/config/zero-config.ts)

- [ ] T071 Implement detectProvider(env) → 'anthropic' | 'openai' | 'azure-openai' | 'ollama' | null
- [ ] T072 Implement generateZeroConfigDefaults(env) → Config with single AI pass
- [ ] T073 Implement default limits (10 findings, $0.10 budget)
- [ ] T074 Add isZeroConfigMode flag to config for terminal indication

### Zero-Config Integration (router/src/config.ts)

- [ ] T075 Integrate zero-config fallback into loadConfig() when .ai-review.yml missing
- [ ] T076 Add "(zero-config defaults)" indication to terminal output in router/src/report/terminal.ts

### Zero-Config Tests

- [ ] T077 [P] Create router/tests/unit/config/zero-config.test.ts for provider detection (5 cases)
- [ ] T078 [P] Create router/tests/unit/config/zero-config.test.ts for config generation (3 cases)

**Checkpoint**: Zero-config mode fully tested

---

## Phase 8: Local Review Command

**Purpose**: Orchestrate the local review flow

**Duration**: ~1.5 hours

### Signal Handling (router/src/cli/signals.ts)

- [ ] T079 Implement setupSignalHandlers(cleanup: () => void) for SIGINT/SIGTERM
- [ ] T080 Implement graceful shutdown with partial results reporting
- [ ] T081 [P] Create router/tests/unit/cli/signals.test.ts (3 cases)

### Local Review Orchestration (router/src/cli/commands/local-review.ts)

- [ ] T082 Implement runLocalReview(options: LocalReviewOptions, deps: Dependencies) main function
- [ ] T083 Wire git context inference into runLocalReview()
- [ ] T084 Wire config loading (with zero-config fallback) into runLocalReview()
- [ ] T085 Wire local diff generation into runLocalReview()
- [ ] T086 Wire existing executeAllPasses() into runLocalReview()
- [ ] T087 Wire terminal reporter into runLocalReview()
- [ ] T088 Implement exit code logic (0=success/no-errors, 1=errors-found, 2=execution-failure)
- [ ] T089 Implement --dry-run mode (show what would be reviewed)
- [ ] T090 Implement --cost-only mode (estimate without execution)

### Local Review Tests

- [ ] T091 [P] Create router/tests/unit/cli/commands/local-review.test.ts for happy path (mock deps)
- [ ] T092 [P] Create router/tests/unit/cli/commands/local-review.test.ts for error handling (4 cases)
- [ ] T093 [P] Create router/tests/unit/cli/commands/local-review.test.ts for dry-run mode (2 cases)
- [ ] T094 [P] Create router/tests/unit/cli/commands/local-review.test.ts for cost-only mode (2 cases)

**Checkpoint**: Local review command tested with mocked dependencies

---

## Phase 9: Command Registration & Integration

**Purpose**: Wire everything into main.ts (thin layer)

**Duration**: ~30 minutes

### Dispatcher Integration (router/src/phases/report.ts)

- [ ] T095 Add 'terminal' to Platform type union
- [ ] T096 Add terminal dispatch case to dispatchReport()

### Main.ts Registration (router/src/main.ts)

- [ ] T097 Import runLocalReview from cli/commands/local-review.ts
- [ ] T098 Register local review command with Commander (path argument + all options)
- [ ] T099 Wire parsed options to runLocalReview() in action handler (~15 lines)

### CLI Options Registration

- [ ] T100 Add --base <ref> option
- [ ] T101 Add --head <ref> option
- [ ] T102 Add --range <range> option
- [ ] T103 Add --staged option
- [ ] T104 Add --uncommitted option (default: true)
- [ ] T105 Add --pass <name> option
- [ ] T106 Add --agent <id> option
- [ ] T107 Add --format <fmt> option
- [ ] T108 Add --no-color option
- [ ] T109 Add --quiet option
- [ ] T110 Add --verbose option
- [ ] T111 Add --dry-run option
- [ ] T112 Add --cost-only option
- [ ] T113 Add -c, --config <path> option

### Integration Smoke Test

- [ ] T114 Create router/tests/integration/local-review-smoke.test.ts (end-to-end with real git repo)

**Checkpoint**: Local review command works end-to-end

---

## Phase 10: npm Package Configuration

**Purpose**: Prepare package for npm publishing

**Duration**: ~30 minutes

### Package Configuration

- [ ] T115 Update router/package.json name to @oddessentials/ai-review
- [ ] T116 Update router/package.json bin entry to expose ai-review executable
- [ ] T117 Add files field to router/package.json for publish (dist/, README.md)
- [ ] T118 Verify existing commands (config init, validate, review) still work

### Documentation

- [ ] T119 Update router/README.md with local review documentation
- [ ] T120 Add quickstart section to README.md

### Publishing Workflow

- [ ] T121 Create .github/workflows/npm-publish.yml for automated publishing

**Checkpoint**: Package ready for npm publish

---

## Phase 11: PR Lessons Learned Compliance (MANDATORY)

**Purpose**: Verify compliance with PR_LESSONS_LEARNED.md security and contract requirements

**Duration**: ~1 hour

**Authority**: These tasks are derived from PR_LESSONS_LEARNED.md and are non-negotiable. Any PR failing these checks will be rejected.

### Security Compliance Tests (router/tests/security/)

- [ ] T122 [P] Create router/tests/security/redaction.test.ts - verify secrets redacted in ALL output paths (terminal, JSON, SARIF)
- [ ] T123 [P] Create router/tests/security/child-process.test.ts - verify no `shell: true` in codebase (grep + runtime test)
- [ ] T124 [P] Create router/tests/security/path-traversal.test.ts - verify path validation prevents `../` escapes
- [ ] T125 [P] Create router/tests/security/error-messages.test.ts - verify error messages don't echo sensitive input
- [ ] T126 [P] Create router/tests/security/git-ref-sanitization.test.ts - verify malicious git refs rejected

### Schema Compliance Tests (router/tests/schema/)

- [ ] T127 [P] Create router/tests/schema/json-output.test.ts - verify JSON includes `schema_version` field
- [ ] T128 [P] Create router/tests/schema/sarif-output.test.ts - verify SARIF includes `$schema` and version
- [ ] T128a [P] Create router/tests/schema/terminal-format-stability.test.ts - snapshot test for terminal output format
- [ ] T129 [P] Create router/tests/schema/version-sync.test.ts - verify runtime version matches package.json

### Reliability Compliance Tests

- [ ] T130 [P] Create router/tests/reliability/floating-promises.test.ts - TypeScript strict + no-floating-promises lint
- [ ] T131 [P] Create router/tests/reliability/run-summary.test.ts - verify summary produced even on failure
- [ ] T132 Create router/tests/reliability/config-preservation.test.ts - verify probe failures don't discard config
- [ ] T132a [P] Create router/tests/reliability/value-clamping.test.ts - verify costs clamped to ≥0, percentages to 0-100

**Checkpoint**: PR Lessons Learned compliance verified - security gates pass

---

## Phase 12: Victory Gates & Final Validation

**Purpose**: Verify all acceptance criteria

**Duration**: ~1 hour

### Integration Tests

- [ ] T133 [P] Create router/tests/integration/local-review.test.ts - full flow test
- [ ] T134 [P] Create router/tests/integration/local-review.test.ts - zero-config mode test
- [ ] T135 [P] Create router/tests/integration/local-review.test.ts - error handling tests
- [ ] T136 [P] Create router/tests/integration/local-review.test.ts - pre-commit simulation test

### Cross-Platform Tests

- [ ] T137 [P] Test Unicode box drawing on Windows Terminal vs CMD vs PowerShell
- [ ] T138 [P] Test path handling with backslashes on Windows
- [ ] T139 [P] Test ANSI color codes on Windows Terminal (should work) vs CMD (needs fallback)
- [ ] T140 [P] Test git command execution on Windows (git.exe path resolution)

### Victory Gate Validation

- [ ] T141 Validate Local Parity Gate: Same diff + config → identical findings (local vs CI)
- [ ] T142 Validate Zero-Config Gate: Fresh repo without .ai-review.yml works
- [ ] T143 Validate Performance Gate: Local review completes in <60s
- [ ] T144 Validate Determinism Gate: Multiple runs produce identical output
- [ ] T145 Validate Cross-Platform Gate: Test on Windows, macOS, Linux (T137-T140 pass)
- [ ] T146 Validate Regression Gate: Existing CI commands still work
- [ ] T147 Validate PR Lessons Learned Gate: All Phase 11 security tests pass

**Checkpoint**: All victory gates pass - ready for release

---

## Session Breakdown (7 Sessions)

### Session 1: Foundation (~2 hours)

**Tasks**: T001-T046 (Phases 1-4)
**Modules**: Types, CLI Output, Git Context, Local Diff
**Tests**: 45+ test cases
**Exit Criteria**: `pnpm test cli/output git-context local-diff` all pass

### Session 2: Terminal Reporter (~1.5 hours)

**Tasks**: T047-T062 (Phase 5)
**Modules**: Terminal Reporter with all output modes
**Tests**: 21 test cases
**Exit Criteria**: `pnpm test report/terminal` all pass

### Session 3: Options & Zero-Config (~1.5 hours)

**Tasks**: T063-T078 (Phases 6-7)
**Modules**: Options parsing, Zero-config defaults
**Tests**: 21 test cases
**Exit Criteria**: `pnpm test cli/options config/zero-config` all pass

### Session 4: Local Review Command (~1.5 hours)

**Tasks**: T079-T094 (Phase 8)
**Modules**: Signal handling, Local review orchestration
**Tests**: 14 test cases
**Exit Criteria**: `pnpm test cli/commands cli/signals` all pass

### Session 5: Integration & npm (~1 hour)

**Tasks**: T095-T121 (Phases 9-10)
**Modules**: Main.ts registration, Package config
**Tests**: 1 smoke test
**Exit Criteria**: `ai-review .` works, `npx` works

### Session 6: PR Lessons Learned Compliance (~1 hour)

**Tasks**: T122-T132a (Phase 11)
**Modules**: Security tests, Schema tests, Reliability tests
**Tests**: 13 compliance tests
**Exit Criteria**: `pnpm test security schema reliability` all pass
**MANDATORY**: This session MUST pass before proceeding to Victory Gates

### Session 7: Victory Gates (~1 hour)

**Tasks**: T133-T147 (Phase 12)
**Modules**: Integration tests, Cross-platform tests, Victory validation
**Tests**: 4 integration tests + 4 cross-platform tests + 7 victory gates
**Exit Criteria**: All victory gates pass (including PR Lessons Learned Gate)

---

## Parallel Execution Matrix

Tasks marked [P] can run in parallel within the same phase:

| Phase | Parallel Groups                                                           |
| ----- | ------------------------------------------------------------------------- |
| 1     | T001-T008 (all parallel - different files)                                |
| 2     | T013-T015 (colors tests), T020-T021 (progress tests), T027 (errors tests) |
| 3     | T031-T032 (change detection), T034-T037 (git context tests)               |
| 4     | T044-T046 (diff tests)                                                    |
| 5     | T057-T062 (reporter tests)                                                |
| 6     | T068-T070 (options tests)                                                 |
| 7     | T077-T078 (zero-config tests)                                             |
| 8     | T081, T091-T094 (command tests)                                           |
| 11    | T122-T132a (security/schema/reliability tests - all parallel)             |
| 12    | T133-T136 (integration tests)                                             |

---

## Dependency Graph

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
                                    Phase 11 (PR Lessons Learned Compliance) ◄── MANDATORY GATE
                                           │
                                           ▼
                                    Phase 12 (Victory Gates)
```

---

## Test Coverage Summary

| Module                       | Unit Tests | Integration Tests | Total Cases |
| ---------------------------- | ---------- | ----------------- | ----------- |
| cli/output/colors.ts         | T013-T015  | -                 | 8           |
| cli/output/progress.ts       | T020-T021  | -                 | 8           |
| cli/output/errors.ts         | T027       | -                 | 5           |
| cli/git-context.ts           | T034-T038  | -                 | 21          |
| diff.ts (local)              | T044-T046  | -                 | 8           |
| report/terminal.ts           | T057-T062  | -                 | 21          |
| cli/options/\*.ts            | T068-T070  | -                 | 13          |
| config/zero-config.ts        | T077-T078  | -                 | 8           |
| cli/signals.ts               | T081       | -                 | 3           |
| cli/commands/local-review.ts | T091-T094  | T114              | 15          |
| **Security Compliance**      | T122-T126  | -                 | 11          |
| **Schema Compliance**        | T127-T129  | -                 | 7           |
| **Reliability Compliance**   | T130-T132a | -                 | 6           |
| **Integration Tests**        | -          | T133-T136         | 4           |
| **Cross-Platform Tests**     | T137-T140  | -                 | 4           |
| **Total**                    |            |                   | **142+**    |

---

## Notes

- All modules are testable in isolation with dependency injection
- main.ts stays thin (~50 lines added) - just command registration
- Each session ends with passing tests before proceeding
- Parallel tasks are in different files to avoid conflicts
- Integration tests use real git repos (created in test fixtures)
- **Phase 11 (PR Lessons Learned Compliance) is a mandatory gate** - cannot proceed to Victory Gates without passing all security/schema/reliability tests
- **Any PR failing code-review checklist will be rejected** - see `checklists/code-review.md`
