# Data Model: Repository Health & Maintainability Overhaul

**Feature**: 416-repo-health-overhaul
**Date**: 2026-03-15

## Entities

This feature is primarily a configuration and file-organization change — no runtime data models are introduced. The "entities" are configuration files and directory structures.

### Hook Configuration

Defines which quality checks run at each development stage.

| Attribute                | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| Stage                    | One of: pre-commit, pre-push, CI-only                     |
| Checks                   | Ordered list of commands to execute                       |
| Time Budget              | Maximum acceptable execution time                         |
| Constitution Requirement | Whether the check is mandated by the project constitution |

**States**: N/A (stateless configuration)

**Relationships**: Each check in a hook maps to a corresponding CI workflow step. Pre-commit checks are a strict subset of CI checks. Pre-push checks are a strict subset of CI checks.

### Exclusion Patterns (.reviewignore)

Defines which file paths the AI reviewer should skip.

| Attribute | Description                                                               |
| --------- | ------------------------------------------------------------------------- |
| Pattern   | Glob pattern matching file paths                                          |
| Category  | Grouping label (machine-generated, build artifacts, fixtures, specs, IDE) |
| Comment   | Explanation of why the category is excluded                               |

**Validation**: Each pattern must match at least one existing file in the repository (no dead patterns).

### Test Directory Layout

Defines the canonical structure for all test files.

| Attribute     | Description                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Domain        | Subdirectory name matching source structure (agents, config, report, phases, types, cli, core) |
| Source Mirror | Corresponding source directory in `router/src/`                                                |
| Test Files    | All `.test.ts` files for that domain                                                           |
| Snapshots     | Per-test snapshot files preserved from migration                                               |

**Constraint**: Every test file MUST reside in exactly one domain directory. No test files may exist outside the canonical test hierarchy after migration.

### Spec Archive

Defines the structure for completed specification storage.

| Attribute        | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| Active Specs     | `specs/{number}-{name}/` — currently in development or recently completed |
| Archived Specs   | `specs/archive/{number}-{name}/` — completed and no longer active         |
| Cross-references | All internal links updated to reflect archive location                    |

**Constraint**: The `spec:linkcheck` script must scan both `specs/*/spec.md` and `specs/archive/*/spec.md`.

## State Transitions

### Test Migration Lifecycle

```
[Before Migration]
  src/__tests__/*.test.ts (79 files, co-located)
  tests/unit/**/*.test.ts (45+ files, organized by domain)
       │
       ▼ (migration script: move + rewrite imports)
[After Migration]
  tests/unit/**/*.test.ts (124+ files, all organized by domain)
  src/__tests__/ (deleted — empty directory removed)
       │
       ▼ (vitest config update)
[Config Updated]
  test.include: ['tests/**/*.test.ts']
  coverage.exclude: ['node_modules', 'dist']
```

### Spec Archival Lifecycle

```
[Before Archival]
  specs/001-fix-feedback-bugs/
  specs/004-control-flow-hardening/
  ... (20 directories, 200+ files)
       │
       ▼ (cross-reference audit)
[References Updated]
  All internal links pointing to archived specs updated
       │
       ▼ (directory move)
[After Archival]
  specs/archive/001-fix-feedback-bugs/
  specs/archive/004-control-flow-hardening/
  ... (20 directories in archive/)
       │
       ▼ (linkcheck script update)
[Validation Updated]
  spec:linkcheck scans both specs/ and specs/archive/
```
