# Implementation Plan: CLI Local Review Dependency Setup

**Feature Branch**: `001-local-deps-setup`
**Spec File**: `specs/001-local-deps-setup/spec.md`

## Summary

Add dependency detection and user-friendly error messages for external tools (semgrep, reviewdog) in the `ai-review local` command. Create a new `ai-review check` command to validate environment setup.

## Critical Files to Modify

| File | Change |
|------|--------|
| `router/src/main.ts` | Add `check` command registration |
| `router/src/cli/commands/local-review.ts` | Add dependency check before execution |
| `router/src/agents/reviewdog.ts` | Add version detection to existing functions |

## New Files to Create

| File | Purpose |
|------|---------|
| `router/src/cli/dependencies/types.ts` | Interfaces for DependencyInfo, CheckResult |
| `router/src/cli/dependencies/registry.ts` | Agent-to-dependency mapping |
| `router/src/cli/dependencies/checker.ts` | Core dependency checking logic |
| `router/src/cli/dependencies/instructions.ts` | Platform-specific install instructions |
| `router/src/cli/dependencies/version-parser.ts` | Version string parsing utilities |
| `router/src/cli/dependencies/index.ts` | Re-exports |
| `router/src/cli/commands/check.ts` | New `ai-review check` command |
| `router/src/__tests__/dependencies.test.ts` | Unit tests |

## Implementation Steps

### Step 1: Create Types and Utilities
Create `router/src/cli/dependencies/` directory with:
- `types.ts` - DependencyInfo, DependencyCheckResult, Platform interfaces
- `version-parser.ts` - compareVersions(), meetsMinimum(), parseVersion()

### Step 2: Create Dependency Registry
- `registry.ts` - Define DEPENDENCIES constant with semgrep/reviewdog info
- Map AGENT_DEPENDENCIES: semgrep → ['semgrep'], reviewdog → ['semgrep', 'reviewdog']
- getDependenciesForAgents() function

### Step 3: Create Dependency Checker
- `checker.ts` - checkDependency() using execFileSync with 5s timeout
- checkAllDependencies() returns aggregated summary
- Handle ENOENT errors gracefully

### Step 4: Create Platform Instructions
- `instructions.ts` - detectPlatform() using os.platform()
- INSTALL_INSTRUCTIONS by dependency × platform
- formatMissingDepsMessage() for consolidated error output

### Step 5: Add Check Command
- `router/src/cli/commands/check.ts` - runCheck() function
- Register in `router/src/main.ts` after configCommand
- Support --verbose, --json flags

### Step 6: Integrate with Local Review
- Add dependency check after config loading in local-review.ts
- Skip optional passes with warning, fail on required passes
- Display message to run `ai-review check --verbose`

### Step 7: Enhance Existing Functions
- Add getSemgrepVersion() and getReviewdogVersion() to reviewdog.ts
- Return version string or null

### Step 8: Add Tests
- Unit tests for version parsing, registry, checker
- Integration tests for check command

## Key Design Decisions

1. **Separate phase** - Dependency checks are separate from preflight API key validation
2. **Existing functions as foundation** - Build on isSemgrepAvailable() pattern
3. **Pass.required field** - Use existing schema to determine fail behavior
4. **Consolidated errors** - Show all missing deps in one message

## Platform-Specific Instructions

| Tool | Windows | macOS | Linux |
|------|---------|-------|-------|
| semgrep | `pip install semgrep` | `brew install semgrep` | `pip install semgrep` |
| reviewdog | Go install or binary download | `brew install reviewdog/tap/reviewdog` | curl installer |

## Verification Plan

1. **Unit tests** - Run `pnpm test router/src/__tests__/dependencies.test.ts`
2. **Manual: Missing semgrep** - Rename semgrep binary, run `ai-review local .`, verify error message
3. **Manual: Check command** - Run `ai-review check --verbose`, verify all deps listed
4. **Self-review** - Run `ai-review local .` on odd-ai-reviewers repo with semgrep installed
5. **External repo test** - Run on another TypeScript/JS repository
6. **Platform test** - Verify instructions on Windows (current platform)
