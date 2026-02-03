# Data Model: CLI Local Review Dependency Setup

**Feature**: 001-local-deps-setup
**Date**: 2026-02-02
**Status**: Complete

## Entities

### ExternalDependency

Centralized catalog entry for a required external tool.

| Field                 | Type                   | Description                                                            |
| --------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `name`                | `string`               | Tool identifier (e.g., 'semgrep')                                      |
| `displayName`         | `string`               | Human-readable name for error messages                                 |
| `versionCommand`      | `[string, string[]]`   | Binary and args for version check (e.g., `['semgrep', ['--version']]`) |
| `versionRegex`        | `RegExp`               | Pattern to extract version from output                                 |
| `minVersion`          | `string \| null`       | Minimum required version (semver), null if no minimum                  |
| `docsUrl`             | `string`               | Official documentation URL                                             |
| `installInstructions` | `PlatformInstructions` | Per-platform install commands                                          |

**Validation Rules**:

- `name` must match agent IDs in `AGENT_DEPENDENCIES` mapping
- `versionCommand[0]` must be a valid executable name (no paths)
- `minVersion` must be valid semver if provided
- `docsUrl` must be valid HTTPS URL

### PlatformInstructions

Per-platform installation command mapping.

| Field    | Type     | Description                  |
| -------- | -------- | ---------------------------- |
| `darwin` | `string` | macOS installation command   |
| `win32`  | `string` | Windows installation command |
| `linux`  | `string` | Linux installation command   |

**Type Definition**:

```typescript
type Platform = 'darwin' | 'win32' | 'linux';
type PlatformInstructions = Record<Platform, string>;
```

### DependencyCheckResult

Status of a single dependency check.

| Field     | Type               | Description                                    |
| --------- | ------------------ | ---------------------------------------------- |
| `name`    | `string`           | Dependency name                                |
| `status`  | `DependencyStatus` | Check result status                            |
| `version` | `string \| null`   | Detected version (null if missing/unparseable) |
| `error`   | `string \| null`   | Error message (for unhealthy/missing)          |

**Status Enum**:

```typescript
type DependencyStatus =
  | 'available' // Tool works, version verified
  | 'missing' // ENOENT - binary not found
  | 'unhealthy' // Binary exists but --version failed
  | 'version-mismatch'; // Below minimum required version
```

**State Transitions**:

```text
Check initiated
     │
     ├─→ ENOENT caught ─────────────→ missing
     │
     ├─→ Exec error (non-ENOENT) ───→ unhealthy
     │
     └─→ Exec success
           │
           ├─→ Version parse failed ─→ unhealthy (with advisory)
           │
           └─→ Version parsed
                 │
                 ├─→ Below minimum ───→ version-mismatch
                 │
                 └─→ Meets minimum ───→ available
```

### DependencyCheckSummary

Aggregated result of checking all dependencies for a run.

| Field               | Type                      | Description                                 |
| ------------------- | ------------------------- | ------------------------------------------- |
| `results`           | `DependencyCheckResult[]` | Individual check results                    |
| `missingRequired`   | `string[]`                | Dependencies missing for required passes    |
| `missingOptional`   | `string[]`                | Dependencies missing for optional passes    |
| `unhealthy`         | `string[]`                | Dependencies in unhealthy state             |
| `versionWarnings`   | `string[]`                | Dependencies below recommended version      |
| `hasBlockingIssues` | `boolean`                 | True if any required dependency unavailable |
| `hasWarnings`       | `boolean`                 | True if any non-blocking issues exist       |

**Derivation Rules**:

- `hasBlockingIssues` = `missingRequired.length > 0`
- `hasWarnings` = `missingOptional.length > 0 || unhealthy.length > 0 || versionWarnings.length > 0`

### PassDependencyInfo

Information about a pass and its required dependencies.

| Field          | Type       | Description                                 |
| -------------- | ---------- | ------------------------------------------- |
| `passName`     | `string`   | Pass name from config                       |
| `required`     | `boolean`  | Whether pass is marked as required          |
| `agents`       | `string[]` | Agent IDs used by this pass                 |
| `dependencies` | `string[]` | External tools needed (derived from agents) |

## Relationships

```text
Config.passes[] ──────────────→ Pass
                                  │
                                  ├── agents[] ────→ AgentId
                                  │                    │
                                  │                    └── AGENT_DEPENDENCIES ──→ ExternalDependency[]
                                  │
                                  └── required ────→ boolean (affects exit code)

DEPENDENCY_CATALOG ───────────→ ExternalDependency
                                  │
                                  ├── versionCommand
                                  ├── installInstructions
                                  └── docsUrl
```

## Type Definitions (TypeScript)

```typescript
// ============= Core Types =============

export type Platform = 'darwin' | 'win32' | 'linux';

export type DependencyStatus = 'available' | 'missing' | 'unhealthy' | 'version-mismatch';

export interface PlatformInstructions {
  darwin: string;
  win32: string;
  linux: string;
}

export interface ExternalDependency {
  name: string;
  displayName: string;
  versionCommand: [string, string[]];
  versionRegex: RegExp;
  minVersion: string | null;
  docsUrl: string;
  installInstructions: PlatformInstructions;
}

// ============= Check Results =============

export interface DependencyCheckResult {
  name: string;
  status: DependencyStatus;
  version: string | null;
  error: string | null;
}

export interface DependencyCheckSummary {
  results: DependencyCheckResult[];
  missingRequired: string[];
  missingOptional: string[];
  unhealthy: string[];
  versionWarnings: string[];
  hasBlockingIssues: boolean;
  hasWarnings: boolean;
}

// ============= Pass Mapping =============

export interface PassDependencyInfo {
  passName: string;
  required: boolean;
  agents: string[];
  dependencies: string[];
}

// ============= Catalog =============

export type DependencyCatalog = Record<string, ExternalDependency>;
export type AgentDependencyMap = Record<string, string[]>;
```

## Zod Schemas

```typescript
import { z } from 'zod';

export const PlatformSchema = z.enum(['darwin', 'win32', 'linux']);

export const DependencyStatusSchema = z.enum([
  'available',
  'missing',
  'unhealthy',
  'version-mismatch',
]);

export const DependencyCheckResultSchema = z.object({
  name: z.string(),
  status: DependencyStatusSchema,
  version: z.string().nullable(),
  error: z.string().nullable(),
});

export const DependencyCheckSummarySchema = z.object({
  results: z.array(DependencyCheckResultSchema),
  missingRequired: z.array(z.string()),
  missingOptional: z.array(z.string()),
  unhealthy: z.array(z.string()),
  versionWarnings: z.array(z.string()),
  hasBlockingIssues: z.boolean(),
  hasWarnings: z.boolean(),
});
```

## Catalog Data (Initial)

```typescript
export const DEPENDENCY_CATALOG: DependencyCatalog = {
  semgrep: {
    name: 'semgrep',
    displayName: 'Semgrep',
    versionCommand: ['semgrep', ['--version']],
    versionRegex: /(\d+\.\d+\.\d+)/,
    minVersion: '1.0.0',
    docsUrl: 'https://semgrep.dev/docs/getting-started/',
    installInstructions: {
      darwin: 'brew install semgrep',
      win32: 'pip install semgrep\n\nNote: Requires Python 3.8 or later',
      linux: 'pip install semgrep',
    },
  },
  reviewdog: {
    name: 'reviewdog',
    displayName: 'Reviewdog',
    versionCommand: ['reviewdog', ['--version']],
    versionRegex: /(\d+\.\d+\.\d+)/,
    minVersion: '0.14.0',
    docsUrl: 'https://github.com/reviewdog/reviewdog#installation',
    installInstructions: {
      darwin: 'brew install reviewdog/tap/reviewdog',
      win32:
        'Download the latest release from:\nhttps://github.com/reviewdog/reviewdog/releases\n\nExtract and add to your PATH',
      linux:
        'curl -sfL https://raw.githubusercontent.com/reviewdog/reviewdog/master/install.sh | sh -s',
    },
  },
};

export const AGENT_DEPENDENCIES: AgentDependencyMap = {
  semgrep: ['semgrep'],
  reviewdog: ['semgrep', 'reviewdog'],
  opencode: [],
  pr_agent: [],
  local_llm: [],
  ai_semantic_review: [],
  control_flow: [],
};
```
