# Implementation Plan: CLI Local Review Dependency Setup

**Branch**: `001-local-deps-setup` | **Date**: 2026-02-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-local-deps-setup/spec.md`

## Summary

Add pass-aware dependency detection and user-friendly error messages for external tools (semgrep, reviewdog) in the `ai-review local` command. Create a centralized dependency catalog, a new `ai-review check` command, and integrate preflight validation into the local review flow with deterministic exit code behavior.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Commander 14.x (CLI), Zod 4.x (schema validation), Node.js child_process (execFileSync)
**Storage**: N/A (stateless per run)
**Testing**: Vitest 4.x
**Target Platform**: Windows, macOS, Linux (Node.js >=22.0.0)
**Project Type**: Single (existing CLI tool extension)
**Performance Goals**: Preflight checks complete in <2 seconds (SC-001)
**Constraints**: <5 seconds for `ai-review check` command (SC-004)
**Scale/Scope**: 2 external tools (semgrep, reviewdog), 3 platforms (Windows, macOS, Linux)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status   | Notes                                                      |
| -------------------------------- | -------- | ---------------------------------------------------------- |
| I. Router Owns All Posting       | **PASS** | No posting changes; CLI-only feature                       |
| II. Structured Findings Contract | **PASS** | No finding schema changes                                  |
| III. Provider-Neutral Core       | **PASS** | Platform detection is OS-level, not provider-level         |
| IV. Security-First Design        | **PASS** | Uses `execFileSync` with `shell: false`; no token exposure |
| V. Deterministic Outputs         | **PASS** | Exit codes deterministic per clarified rules               |
| VI. Bounded Resources            | **PASS** | Version checks have 5s timeout                             |
| VII. Environment Discipline      | **PASS** | No curl \| bash; uses existing tools                       |
| VIII. Explicit Non-Goals         | **PASS** | Not becoming CI runner; just detection                     |

**Quality Gates**:

- Zero-tolerance lint: Will enforce via existing lint-staged
- Security linting: No new subprocess patterns beyond existing `execFileSync`
- Dependency architecture: No circular deps; new module is leaf node

## Project Structure

### Documentation (this feature)

```text
specs/001-local-deps-setup/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - internal CLI, no API)
├── checklists/          # Quality checklists
│   └── requirements.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
router/src/
├── cli/
│   ├── commands/
│   │   ├── local-review.ts      # MODIFY: Add dependency preflight
│   │   └── check.ts             # NEW: Standalone check command
│   └── dependencies/            # NEW: Dependency detection module
│       ├── index.ts             # Re-exports
│       ├── types.ts             # DependencyInfo, CheckResult interfaces
│       ├── catalog.ts           # Centralized dependency registry
│       ├── checker.ts           # Core detection logic
│       ├── platform.ts          # Platform detection (os.platform)
│       ├── version.ts           # Version parsing utilities
│       └── messages.ts          # User-facing error messages
├── main.ts                      # MODIFY: Register check command
└── phases/
    └── preflight.ts             # MODIFY: Add dependency validation

router/src/__tests__/
└── cli/
    └── dependencies/            # NEW: Unit tests
        ├── checker.test.ts
        ├── catalog.test.ts
        ├── version.test.ts
        └── messages.test.ts
```

**Structure Decision**: Extends existing single-project CLI structure. New `dependencies/` module is isolated and testable. Integration with existing `phases/preflight.ts` maintains architectural consistency.

## Complexity Tracking

> No constitution violations requiring justification.

| Area                         | Complexity | Justification                                                               |
| ---------------------------- | ---------- | --------------------------------------------------------------------------- |
| New module (`dependencies/`) | Low        | Leaf module with no dependencies on business logic                          |
| Platform detection           | Low        | Uses Node.js built-in `os.platform()`                                       |
| Version parsing              | Medium     | Different tools have different `--version` formats; centralized in one file |

## Key Design Decisions

### 1. Pass-Aware Checking (from Clarifications)

Dependencies are derived from configured passes for the current run only:

```text
Config → Passes → Agents → Required Dependencies
        ↓
Only check tools needed by enabled passes
```

### 2. Exit Code Determinism (from Clarifications)

| Scenario                               | Exit Code | Behavior                  |
| -------------------------------------- | --------- | ------------------------- |
| All passes succeed                     | 0         | Success                   |
| Optional pass skipped (missing dep)    | 0         | Warn + continue           |
| Required pass blocked (missing dep)    | 1         | Consolidated error + exit |
| Mixed (some succeed, required blocked) | 1         | Run available, then error |

### 3. Unhealthy State Handling (from Clarifications)

```text
DependencyCheckResult:
├── available     → Tool works, version verified
├── missing       → ENOENT - binary not found
├── unhealthy     → Binary exists but --version failed
└── version-mismatch → Below minimum required version
```

"Unhealthy" state: warn user, allow execution with advisory, provide manual verification steps.

### 4. Centralized Catalog (from Clarifications)

Single registry in `catalog.ts`:

```typescript
const DEPENDENCY_CATALOG: Record<string, ExternalDependency> = {
  semgrep: {
    name: 'semgrep',
    versionCommand: ['semgrep', '--version'],
    minVersion: '1.0.0',
    docsUrl: 'https://semgrep.dev/docs/getting-started/',
    installInstructions: {
      darwin: 'brew install semgrep',
      win32: 'pip install semgrep  # Requires Python 3.8+',
      linux: 'pip install semgrep',
    },
  },
  reviewdog: {
    name: 'reviewdog',
    versionCommand: ['reviewdog', '--version'],
    minVersion: '0.14.0',
    docsUrl: 'https://github.com/reviewdog/reviewdog#installation',
    installInstructions: {
      darwin: 'brew install reviewdog/tap/reviewdog',
      win32: 'Download from https://github.com/reviewdog/reviewdog/releases',
      linux:
        'curl -sfL https://raw.githubusercontent.com/reviewdog/reviewdog/master/install.sh | sh -s',
    },
  },
};
```

### 5. Agent-to-Dependency Mapping

```typescript
const AGENT_DEPENDENCIES: Record<AgentId, string[]> = {
  semgrep: ['semgrep'],
  reviewdog: ['semgrep', 'reviewdog'],
  // AI agents have no external tool dependencies
  opencode: [],
  pr_agent: [],
  local_llm: [],
  ai_semantic_review: [],
  control_flow: [],
};
```

## Integration Points

### 1. Preflight Phase (`phases/preflight.ts`)

Add as 11th validation check in `runPreflightChecks()`:

```typescript
// After existing validations...
const depResult = checkPassDependencies(config.passes, env);
if (!depResult.ok) {
  allErrors.push(...depResult.errors);
}
allWarnings.push(...depResult.warnings);
```

### 2. Local Review Command (`cli/commands/local-review.ts`)

Insert dependency check after config loading, before diff generation:

```typescript
// After loadConfig()...
const depCheck = await checkDependenciesForPasses(config.passes);
if (depCheck.hasBlockingIssues) {
  displayDependencyErrors(depCheck, deps.stderr);
  deps.exitHandler(1);
  return;
}
if (depCheck.hasWarnings) {
  displayDependencyWarnings(depCheck, deps.stderr);
}
// Continue with diff generation...
```

### 3. Check Command (`cli/commands/check.ts`)

New standalone command for proactive validation:

```typescript
program
  .command('check')
  .description('Validate environment setup and dependencies')
  .option('--verbose', 'Show detailed version information')
  .option('--json', 'Output as JSON for programmatic use')
  .action(runCheck);
```

## Testing Strategy

### Unit Tests

| Test File          | Coverage                                      |
| ------------------ | --------------------------------------------- |
| `checker.test.ts`  | `checkDependency()`, `checkAllDependencies()` |
| `catalog.test.ts`  | Catalog structure, agent mapping              |
| `version.test.ts`  | Version parsing, comparison                   |
| `messages.test.ts` | Platform-specific message generation          |

### Integration Tests

| Scenario          | Validation                                  |
| ----------------- | ------------------------------------------- |
| Missing semgrep   | Error message includes install instructions |
| Missing reviewdog | Error message includes download URL         |
| Both missing      | Single consolidated message                 |
| AI-only config    | No dependency errors                        |
| Unhealthy tool    | Advisory warning, execution proceeds        |
| Check command     | All deps reported with versions             |

### Manual Verification (SC-005, SC-006)

1. Self-review: `ai-review local .` on odd-ai-reviewers repo
2. External repo: Test on another TypeScript/JS repository
