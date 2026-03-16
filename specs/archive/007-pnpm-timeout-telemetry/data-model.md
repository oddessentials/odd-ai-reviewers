# Data Model: Timeout Telemetry

**Feature**: 007-pnpm-timeout-telemetry
**Date**: 2026-01-28

## Overview

This document defines the data entities for the timeout telemetry system. All schemas use Zod for runtime validation and TypeScript inference.

---

## Core Entities

### TimeoutEvent

Immutable record of a single timeout occurrence.

| Field             | Type   | Required | Description                                                          |
| ----------------- | ------ | -------- | -------------------------------------------------------------------- |
| `operation_id`    | string | Yes      | Unique identifier for the operation (pattern: `{type}_{identifier}`) |
| `duration_ms`     | number | Yes      | Actual elapsed time in milliseconds (≥0)                             |
| `threshold_ms`    | number | Yes      | Configured timeout threshold in milliseconds (>0)                    |
| `timestamp`       | string | Yes      | ISO-8601 datetime when timeout was detected                          |
| `severity`        | enum   | Yes      | 'warning' \| 'error' \| 'critical'                                   |
| `allowed_context` | object | No       | Optional allow-listed metadata (see AllowedContext)                  |

**Operation ID Patterns**:

- `local_llm_{requestId}` - LLM API requests
- `pattern_eval_{patternHash}` - Regex pattern evaluations
- `subprocess_{toolName}` - External tool executions (semgrep, reviewdog)
- `subprocess_{toolName}_{subOperation}` - Tool sub-operations

**Severity Classification** (caller-supplied, no automatic derivation):

- `warning`: Timeout exceeded but operation completed (informational)
- `error`: Timeout caused operation failure
- `critical`: Timeout in critical path affecting overall result

**Note**: Severity is always supplied by the caller at emit time. There are no automatic derivation rules (e.g., multiplier-based). The caller is responsible for determining the appropriate severity based on the operation context.

---

### AllowedContext

Optional metadata fields that may accompany a TimeoutEvent. Fields are explicitly allow-listed to prevent unbounded data in telemetry.

| Field          | Type   | Required | Description                              |
| -------------- | ------ | -------- | ---------------------------------------- |
| `agent_id`     | string | No       | Agent that triggered the timeout         |
| `file_path`    | string | No       | File being processed (if applicable)     |
| `pattern_hash` | string | No       | SHA-256 hash of pattern (first 16 chars) |
| `retry_count`  | number | No       | Number of retries attempted              |
| `model_name`   | string | No       | LLM model identifier (if applicable)     |

**Prohibited Fields** (must NOT appear in context):

- Raw patterns or regex strings
- File contents or diffs
- API keys or tokens
- User-provided data without hashing

---

### TelemetryConfig

Configuration controlling telemetry behavior.

| Field               | Type    | Required | Default       | Description                          |
| ------------------- | ------- | -------- | ------------- | ------------------------------------ |
| `enabled`           | boolean | Yes      | `false`       | Master switch for telemetry emission |
| `backends`          | array   | Yes      | `['console']` | List of active backends              |
| `jsonl_path`        | string  | No       | `null`        | File path for JSONL backend output   |
| `verbosity`         | enum    | No       | `'standard'`  | 'minimal' \| 'standard' \| 'verbose' |
| `buffer_size`       | number  | No       | `100`         | Max events to buffer before flush    |
| `flush_interval_ms` | number  | No       | `5000`        | Periodic flush interval (JSONL only) |

**Backend Types**:

- `console` - Writes structured log lines to stdout
- `jsonl` - Appends JSON objects to file (requires `jsonl_path`)

**Verbosity Levels**:

- `minimal` - operation_id, duration_ms, severity only
- `standard` - All required fields
- `verbose` - All fields including allowed_context

---

### TelemetryBackend (Interface)

Contract for telemetry sink implementations.

| Method  | Signature                                | Description                    |
| ------- | ---------------------------------------- | ------------------------------ |
| `emit`  | `(event: TimeoutEvent) => Promise<void>` | Write a single event           |
| `flush` | `() => Promise<void>`                    | Force write of buffered events |
| `close` | `() => Promise<void>`                    | Release resources              |

**Error Handling Contract**:

- `emit` MUST NOT throw; failures logged internally (once per run)
- `emit` MUST NOT block calling thread
- `flush` MAY throw if write fails
- Backend failure MUST NOT affect control flow (FR-014)
- Emission is best-effort: 100% of detected threshold exceedances attempt emission, but failures do not fail operations

**Flush Behavior**:

- `flushTelemetry()` MUST be called at shutdown and run summary
- JSONL backend uses append-mode writes (safe without explicit flush; flush ensures completeness)

---

## State Transitions

### Telemetry Lifecycle

```
┌──────────────┐
│ Unconfigured │
└──────┬───────┘
       │ configureTelemetry(config)
       ▼
┌──────────────┐
│   Disabled   │◄──── config.enabled = false
└──────┬───────┘
       │ config.enabled = true
       ▼
┌──────────────┐
│   Enabled    │──── emitTimeoutEvent() → events emitted
└──────┬───────┘
       │ flushTelemetry() or process exit
       ▼
┌──────────────┐
│   Flushed    │
└──────────────┘
```

### Event Emission Flow

```
emitTimeoutEvent(event)
       │
       ▼
┌─────────────────┐
│ Telemetry       │──── No ───► return (no-op)
│ Enabled?        │
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│ Validate Event  │──── Invalid ───► log warning, return
│ (Zod schema)    │
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐
│ For each        │
│ backend         │
│   backend.emit()│
└─────────────────┘
```

---

## Relationships

```
                    ┌─────────────────┐
                    │ TelemetryConfig │
                    └────────┬────────┘
                             │ configures
                             ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ TimeoutEvent  │───>│ TelemetryHook   │───>│ TelemetryBackend│
└───────────────┘    └─────────────────┘    └─────────────────┘
        │                    │                      │
        │                    │                      ├── ConsoleBackend
        │                    │                      └── JsonlBackend
        │                    │
        └── AllowedContext   └── dispatches to configured backends
```

---

## Validation Rules

### TimeoutEvent Validation

1. `operation_id` MUST match pattern `^[a-z_]+_[a-zA-Z0-9_-]+$`
2. `duration_ms` MUST be ≥0 (allows 0 for very fast operations)
3. `threshold_ms` MUST be >0
4. `timestamp` MUST be valid ISO-8601 datetime
5. `severity` MUST be one of allowed enum values
6. `allowed_context` fields MUST be in allow-list

### TelemetryConfig Validation

1. If `backends` includes 'jsonl', `jsonl_path` MUST be provided
2. `buffer_size` MUST be >0 and ≤10000
3. `flush_interval_ms` MUST be ≥100 and ≤60000
4. `verbosity` MUST be valid enum value

---

## Example Instances

### TimeoutEvent (Standard)

```json
{
  "operation_id": "local_llm_req_abc123",
  "duration_ms": 601234,
  "threshold_ms": 600000,
  "timestamp": "2026-01-28T14:30:00.000Z",
  "severity": "error"
}
```

### TimeoutEvent (Verbose with Context)

```json
{
  "operation_id": "pattern_eval_a1b2c3d4e5f6g7h8",
  "duration_ms": 105,
  "threshold_ms": 100,
  "timestamp": "2026-01-28T14:30:00.123Z",
  "severity": "warning",
  "allowed_context": {
    "agent_id": "control_flow",
    "file_path": "src/utils/parser.ts",
    "pattern_hash": "a1b2c3d4e5f6g7h8"
  }
}
```

### TelemetryConfig

```json
{
  "enabled": true,
  "backends": ["console", "jsonl"],
  "jsonl_path": "./telemetry/timeout-events.jsonl",
  "verbosity": "standard",
  "buffer_size": 100,
  "flush_interval_ms": 5000
}
```
