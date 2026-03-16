# Data Model: Fix Config Wizard Validation Bugs

**Feature Branch**: `001-fix-config-wizard-bugs`
**Date**: 2026-01-31

## Overview

This feature introduces minimal data model changes to support the single-source-of-truth pattern for model resolution. The primary change is extending `PreflightResult` to include the resolved configuration and a warnings array.

## Type Definitions

### ResolvedConfigTuple (existing - no changes)

Located in `router/src/config/providers.ts`.

```typescript
/**
 * Resolved configuration tuple for logging and debugging.
 * Contains the final resolved values after all resolution logic.
 */
export interface ResolvedConfigTuple {
  /** Resolved LLM provider (null if no cloud agents or no valid keys) */
  provider: LlmProvider | null;

  /** Resolved model name (e.g., 'gpt-4o', 'claude-sonnet-4-20250514') */
  model: string;

  /** Source of the model value */
  modelSource: 'env' | 'config' | 'default' | 'auto';

  /** Environment variable that provided the API key (e.g., 'OPENAI_API_KEY') */
  keySource: string | null;

  /** Path to the config file that was loaded */
  configPath: string | null;
}
```

### PreflightResult (extended)

Located in `router/src/phases/preflight.ts`.

```typescript
/**
 * Result of preflight validation checks.
 *
 * INVARIANT: If valid is true, resolved MUST be populated and usable for execution.
 * INVARIANT: warnings MUST never cause valid to be false.
 */
export interface PreflightResult {
  /** Whether all validation checks passed (errors.length === 0) */
  valid: boolean;

  /** Error messages that block execution */
  errors: string[];

  /** Warning messages that do not block execution (NEW) */
  warnings: string[];

  /**
   * Resolved configuration tuple (NEW in return value).
   *
   * Contains the single-source-of-truth for model and provider resolution.
   * Execution code MUST use these values rather than re-resolving.
   *
   * Only populated on successful validation (when valid is true).
   */
  resolved?: ResolvedConfigTuple;
}
```

### AgentContext (no changes)

Located in `router/src/agents/types.ts`.

```typescript
/**
 * Context passed to agents during execution.
 *
 * INVARIANT: effectiveModel MUST be set from PreflightResult.resolved.model.
 * INVARIANT: Agents MUST NOT recompute or override effectiveModel.
 */
export interface AgentContext {
  repoPath: string;
  diff: DiffSummary;
  files: DiffFile[];
  config: Config;
  diffContent: string;
  prNumber?: number;
  env: Record<string, string | undefined>;

  /**
   * Router-resolved model name.
   *
   * MUST be populated from PreflightResult.resolved.model after preflight.
   * Agents MUST use this value directly—no per-agent defaults.
   */
  effectiveModel: string;

  /**
   * Provider resolved per-agent during execution.
   * Initially null, set by executeAllPasses for each agent.
   */
  provider: 'anthropic' | 'openai' | 'azure-openai' | 'ollama' | null;
}
```

### ValidationReport (extended for CLI output)

Located in `router/src/cli/validation-report.ts`.

```typescript
/**
 * Formatted validation report for CLI output.
 */
export interface ValidationReport {
  /** Overall validation status */
  valid: boolean;

  /** Formatted error messages */
  errors: string[];

  /** Formatted warning messages (NEW) */
  warnings: string[];

  /** Resolved configuration for display */
  resolved?: {
    provider: string | null;
    model: string;
    modelSource: string;
    keySource: string | null;
  };
}
```

## Data Flow

### Before Fix (buggy)

```
main.ts:
  resolveEffectiveModel() → agentContext.effectiveModel

phases/preflight.ts:
  resolveEffectiveModelWithDefaults() → effectiveModel (local var, discarded)
  validate using local effectiveModel

Result: Preflight uses auto-applied model, but agentContext still has empty string
```

### After Fix (correct)

```
main.ts:
  Create agentContext with placeholder effectiveModel

phases/preflight.ts:
  resolveEffectiveModelWithDefaults() → effectiveModel
  validate using effectiveModel
  Return PreflightResult { resolved: { model: effectiveModel, ... } }

main.ts:
  agentContext.effectiveModel = preflightResult.resolved.model

Result: Single resolution path, agentContext gets the auto-applied model
```

## Validation Rules

### PreflightResult

| Field    | Type                 | Validation                            |
| -------- | -------------------- | ------------------------------------- |
| valid    | boolean              | MUST equal `errors.length === 0`      |
| errors   | string[]             | May be empty                          |
| warnings | string[]             | May be empty; MUST NOT affect `valid` |
| resolved | ResolvedConfigTuple? | MUST be present when `valid` is true  |

### ResolvedConfigTuple

| Field       | Type                | Validation                                 |
| ----------- | ------------------- | ------------------------------------------ |
| provider    | LlmProvider \| null | null if no cloud agents enabled            |
| model       | string              | Non-empty when cloud agents enabled        |
| modelSource | enum                | One of: 'env', 'config', 'default', 'auto' |
| keySource   | string \| null      | Environment variable name or null          |
| configPath  | string \| null      | Absolute path to config file               |

## State Transitions

### Model Resolution State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    MODEL Resolution                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐   MODEL env    ┌──────────────┐               │
│  │ Initial │ ─────────────► │ modelSource: │               │
│  │         │                │    'env'     │               │
│  └────┬────┘                └──────────────┘               │
│       │                                                     │
│       │ no MODEL env                                        │
│       ▼                                                     │
│  ┌─────────────┐  config.models.default  ┌──────────────┐  │
│  │ Check       │ ───────────────────────► │ modelSource: │  │
│  │ config      │                          │   'config'   │  │
│  └──────┬──────┘                          └──────────────┘  │
│         │                                                   │
│         │ no config default                                 │
│         ▼                                                   │
│  ┌─────────────┐  single key detected  ┌──────────────┐    │
│  │ Check       │ ─────────────────────► │ modelSource: │    │
│  │ auto-apply  │                        │    'auto'    │    │
│  └──────┬──────┘                        └──────────────┘    │
│         │                                                   │
│         │ no auto-apply                                     │
│         ▼                                                   │
│  ┌─────────────┐                                           │
│  │ Validation  │ ──► ERROR: No model configured            │
│  │ fails       │                                           │
│  └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Relationships

```
┌──────────────────┐
│      Config      │
│                  │
│ - models.default │
│ - provider       │
│ - passes[]       │
│ - reporting      │
└────────┬─────────┘
         │
         │ input to
         ▼
┌──────────────────┐
│ runPreflightChecks│
│                  │
│ - validates      │
│ - resolves       │
└────────┬─────────┘
         │
         │ returns
         ▼
┌──────────────────┐
│ PreflightResult  │
│                  │
│ - valid          │
│ - errors[]       │
│ - warnings[]     │◄──── NEW
│ - resolved       │◄──── single source of truth
└────────┬─────────┘
         │
         │ used to build
         ▼
┌──────────────────┐
│  AgentContext    │
│                  │
│ - effectiveModel │◄──── from resolved.model
│ - provider       │
│ - env            │
│ - ...            │
└──────────────────┘
```

## Migration Notes

### Backwards Compatibility

- `PreflightResult.warnings` is additive; existing consumers ignore it
- `PreflightResult.resolved` was already present in some code paths; now consistently populated
- No schema changes to Config or AgentContext types
- No changes to YAML configuration format

### Breaking Changes

None. All changes are additive or internal implementation fixes.
