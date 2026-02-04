# Research: CLI Local Review Dependency Setup

**Feature**: 001-local-deps-setup
**Date**: 2026-02-02
**Status**: Complete

## Research Tasks

### 1. Existing Dependency Detection Pattern

**Decision**: Use `execFileSync` with `shell: false` and timeout

**Rationale**: This is the established pattern in the codebase (`router/src/agents/reviewdog.ts:48-67`). The existing `isSemgrepAvailable()` and `isReviewdogAvailable()` functions already use this approach:

```typescript
export function isSemgrepAvailable(): boolean {
  try {
    execFileSync('semgrep', ['--version'], { stdio: 'ignore', shell: false });
    return true;
  } catch {
    return false;
  }
}
```

**Alternatives considered**:

- `which`/`where` command: Platform-specific, doesn't verify tool works
- `spawn` with callback: More complex, async overhead not needed for quick check
- External package (e.g., `command-exists`): Unnecessary dependency

### 2. Version Output Format Research

**Decision**: Parse first line, extract semver pattern with regex

**Findings**:

| Tool      | `--version` Output          | Parse Strategy                   |
| --------- | --------------------------- | -------------------------------- |
| semgrep   | `semgrep 1.56.0`            | Split on space, take second part |
| reviewdog | `reviewdog version: 0.17.4` | Split on `: `, take second part  |

**Rationale**: Both tools output version on first line. Simple regex `/(\d+\.\d+\.\d+)/` captures semver. Fallback to "unknown" if unparseable (unhealthy state).

**Alternatives considered**:

- JSON output flags: Not universally supported
- `--version-json`: semgrep-specific, not portable

### 3. Platform Detection

**Decision**: Use Node.js built-in `os.platform()`

**Rationale**: Native, no dependencies, returns consistent values:

- `'darwin'` for macOS
- `'win32'` for Windows
- `'linux'` for Linux

**Alternatives considered**:

- `process.platform`: Same value, `os.platform()` is more explicit
- External package (e.g., `os-name`): Unnecessary for our use case

### 4. Install Instructions by Platform

**Decision**: Centralized catalog with per-platform instructions map

**Findings from official documentation**:

| Tool      | macOS                                  | Windows                | Linux                 |
| --------- | -------------------------------------- | ---------------------- | --------------------- |
| semgrep   | `brew install semgrep`                 | `pip install semgrep`  | `pip install semgrep` |
| reviewdog | `brew install reviewdog/tap/reviewdog` | GitHub releases binary | curl installer script |

**Documentation URLs**:

- semgrep: https://semgrep.dev/docs/getting-started/
- reviewdog: https://github.com/reviewdog/reviewdog#installation

**Rationale**: Homebrew is standard on macOS. pip is universal for semgrep (Python tool). reviewdog provides platform-specific binaries.

### 5. Minimum Version Requirements

**Decision**: Start with conservative minimums based on feature stability

| Tool      | Minimum Version | Rationale                         |
| --------- | --------------- | --------------------------------- |
| semgrep   | 1.0.0           | First stable release (March 2023) |
| reviewdog | 0.14.0          | Stable annotations API            |

**Rationale**: These versions are old enough that most users will have them, but new enough to have the features we depend on (JSON output, exit codes).

### 6. Error Message Best Practices

**Decision**: Follow CLI UX conventions for actionable error messages

**Pattern adopted**:

```text
ERROR: Missing required dependency: semgrep

  semgrep is required by the 'security-scan' pass.

  To install on macOS:
    brew install semgrep

  For more information:
    https://semgrep.dev/docs/getting-started/

  Run 'ai-review check --verbose' to verify your setup.
```

**Key elements**:

1. Clear error type (ERROR/WARNING)
2. Which dependency is missing
3. Which pass requires it
4. Platform-specific install command
5. Documentation link
6. Next action suggestion

### 7. Timeout Configuration

**Decision**: 5 second timeout for version checks

**Rationale**:

- Matches existing patterns (git commands use 30s, but version checks are fast)
- Long enough for slow tool startup on Windows
- Short enough to not delay user experience
- Aligns with SC-004 (check command < 5s total)

### 8. Agent-Dependency Mapping

**Decision**: Explicit mapping in catalog, not inferred from agent code

**Findings from codebase**:

| Agent              | External Tools Required                  |
| ------------------ | ---------------------------------------- |
| semgrep            | semgrep                                  |
| reviewdog          | semgrep, reviewdog                       |
| opencode           | None (AI only)                           |
| pr_agent           | None (AI only)                           |
| local_llm          | None (AI only)                           |
| ai_semantic_review | None (AI only)                           |
| control_flow       | None (TypeScript compiler only, bundled) |

**Rationale**: Explicit mapping is more maintainable than parsing agent source code. Adding new agents requires updating the mapping, which is intentional (forces consideration of dependencies).

### 9. Exit Code Semantics

**Decision**: Follow POSIX conventions with clarified rules

| Exit Code | Meaning                                 |
| --------- | --------------------------------------- |
| 0         | Success (or optional passes skipped)    |
| 1         | Failure (required dependency missing)   |
| 2         | Invalid arguments (existing in main.ts) |

**Rationale**: Standard POSIX semantics. Exit 0 for partial success (optional skipped) supports CI workflows where some analysis is better than none.

### 10. Integration with Existing Preflight

**Decision**: Add as parallel check in `runPreflightChecks()`, not replace

**Findings**: `phases/preflight.ts` has 10 existing validation checks for API keys, model config, etc. Dependency checking is orthogonal and should run in parallel.

**Rationale**:

- Preflight already aggregates errors/warnings
- Maintains single point of validation
- Allows all issues to be reported at once (FR-004)

## Resolved NEEDS CLARIFICATION Items

All technical context items are resolved. No unknowns remain.

## Key Decisions Summary

| Area               | Decision                                                |
| ------------------ | ------------------------------------------------------- |
| Detection method   | `execFileSync` with `shell: false`, 5s timeout          |
| Version parsing    | Regex on first line of `--version` output               |
| Platform detection | `os.platform()` built-in                                |
| Catalog structure  | Centralized registry in `catalog.ts`                    |
| Error messages     | Actionable with install command, docs link, next action |
| Exit codes         | 0=success/optional-skipped, 1=required-missing          |
| Integration point  | `phases/preflight.ts` + `cli/commands/local-review.ts`  |
