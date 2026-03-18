# Data Model: 417 Dogfood Quality Release

## New Entities

### ExecutionPlan (NEW)

Immutable object produced after CLI parsing + config loading + validation. Single source of truth for all downstream execution.

| Field           | Type                                    | Description                                     |
| --------------- | --------------------------------------- | ----------------------------------------------- |
| `mode`          | `'execute' \| 'dry-run' \| 'cost-only'` | Execution mode                                  |
| `passes`        | `ReadonlyArray<PlannedPass>`            | Filtered, validated passes to run               |
| `provider`      | `string \| null`                        | Resolved provider name                          |
| `model`         | `string \| null`                        | Resolved model name                             |
| `limits`        | `Readonly<Limits>`                      | Configured resource limits                      |
| `gating`        | `Readonly<Gating>`                      | Gating configuration                            |
| `suppressions`  | `Readonly<Suppressions>`                | User suppression rules (from base branch in CI) |
| `configSource`  | `string`                                | Config file path or 'zero-config'               |
| `schemaVersion` | `number`                                | Config schema version                           |

**Invariant**: Deeply immutable after construction (`DeepReadonly<T>` branded type). No pass may have an empty agents list.

### PlannedPass (NEW)

A single pass within the execution plan with its resolved agents.

| Field      | Type                     | Description                                        |
| ---------- | ------------------------ | -------------------------------------------------- |
| `name`     | `string`                 | Pass name from config                              |
| `agents`   | `ReadonlyArray<AgentId>` | Agent IDs to run (filtered by --agent if set)      |
| `required` | `boolean`                | Whether failure is fatal                           |
| `enabled`  | `boolean`                | Always true in plan (disabled passes are excluded) |

### SuppressionRule (NEW)

A user-defined rule for suppressing findings.

| Field                     | Type                              | Description                               |
| ------------------------- | --------------------------------- | ----------------------------------------- |
| `rule`                    | `string?`                         | Rule ID glob pattern (e.g., `semantic/*`) |
| `message`                 | `string?`                         | Anchored regex to match finding message   |
| `file`                    | `string?`                         | File glob pattern                         |
| `severity`                | `'error' \| 'warning' \| 'info'?` | Optional severity filter                  |
| `reason`                  | `string`                          | Mandatory human-readable reason           |
| `breadth_override`        | `boolean?`                        | Allow matching >20 findings               |
| `breadth_override_reason` | `string?`                         | Required when breadth_override is true    |
| `approved_by`             | `string?`                         | Required when breadth_override is true    |

**Validation rules**:

- At least one of `rule`, `message`, `file` must be set
- `message` patterns must be anchored (no bare `.*`)
- `rule` patterns use glob only (no arbitrary regex)
- When `breadth_override: true`, both `breadth_override_reason` and `approved_by` are required
- Maximum 50 rules per config

### Suppressions (NEW)

Top-level config section for finding suppressions.

| Field                         | Type                | Description                                                 |
| ----------------------------- | ------------------- | ----------------------------------------------------------- |
| `rules`                       | `SuppressionRule[]` | Array of suppression rules (max 50)                         |
| `disable_matchers`            | `string[]`          | Built-in matcher IDs to disable                             |
| `security_override_allowlist` | `string[]`          | Rule reasons authorized to suppress error-severity findings |

### AgentRegistryEntry (NEW)

Metadata for a single agent in the canonical registry.

| Field                  | Type                | Description                                |
| ---------------------- | ------------------- | ------------------------------------------ |
| `id`                   | `AgentId`           | Canonical agent identifier                 |
| `name`                 | `string`            | Human-readable name                        |
| `description`          | `string`            | One-line description                       |
| `requiresExternalTool` | `boolean`           | Needs external binary (semgrep, reviewdog) |
| `requiresApiKey`       | `boolean`           | Needs API key (OpenAI, Anthropic, etc.)    |
| `builtIn`              | `boolean`           | Requires no external dependencies          |
| `compatibleProviders`  | `string[] \| 'all'` | Which providers this agent works with      |

### RunStatus (NEW — Canonical Enum)

Machine-readable status for all JSON/SARIF output.

| Value           | Exit Code | Meaning                                             |
| --------------- | --------- | --------------------------------------------------- |
| `complete`      | `0`       | All agents succeeded, gating passed or disabled     |
| `gating_failed` | `1`       | All agents succeeded, findings exceeded threshold   |
| `config_error`  | `2`       | Fatal config/validation error, no findings produced |
| `incomplete`    | `3`       | Partial results, some agents failed                 |

**Invariant**: `gating_failed` is only valid when all agents completed. `incomplete` always takes precedence over `gating_failed`.

## Modified Entities

### FatalExecutionError (MODIFIED)

Add optional `partialResults` field.

| Field            | Type                                                                          | Change                                        |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| `code`           | `'BUDGET_EXCEEDED' \| 'POLICY_VIOLATION' \| 'AGENT_FAILURE' \| 'AGENT_CRASH'` | Existing                                      |
| `partialResults` | `ExecuteResult?`                                                              | **NEW** — accumulated findings before failure |

### ProcessedFindings (MODIFIED)

Rename misleading field.

| Field           | Type         | Change                                                                             |
| --------------- | ------------ | ---------------------------------------------------------------------------------- |
| `deduplicated`  | → `filtered` | **RENAMED** — actually contains sanitized/filtered findings, not just deduplicated |
| `sorted`        | `Finding[]`  | Existing                                                                           |
| `partialSorted` | `Finding[]`  | Existing                                                                           |
| `summary`       | `string`     | Existing                                                                           |

### JsonOutput (MODIFIED)

Add status field.

| Field            | Type                                     | Change                             |
| ---------------- | ---------------------------------------- | ---------------------------------- |
| `status`         | `RunStatus`                              | **NEW** — canonical run status     |
| `suppressions`   | `{ reason: string, matched: number }[]?` | **NEW** — suppression match counts |
| All other fields | Various                                  | Existing, unchanged                |

### Config (MODIFIED)

Add suppressions section.

| Field            | Type            | Change                                      |
| ---------------- | --------------- | ------------------------------------------- |
| `suppressions`   | `Suppressions?` | **NEW** — optional, defaults to empty rules |
| All other fields | Various         | Existing, unchanged                         |

## Entity Relationships

```
Config --has--> Pass[] --contains--> AgentId[]
Config --has--> Suppressions? --contains--> SuppressionRule[]
AgentRegistryEntry[] --validates--> AgentId (schema enum derived from registry)
ExecutionPlan --derived-from--> Config + CLI options + AgentRegistry
ExecutionPlan --contains--> PlannedPass[] (filtered, validated subset of Config.passes)
ExecutionPlan --consumed-by--> DryRun, CostOnly, DependencyCheck, Execute
FatalExecutionError --carries--> ExecuteResult? (partialResults)
JsonOutput --includes--> RunStatus (status enum)
```
