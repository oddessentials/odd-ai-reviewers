# Quickstart: Build Tooling & Timeout Telemetry

**Feature**: 007-pnpm-timeout-telemetry
**Date**: 2026-01-28

## Overview

This feature introduces three changes:

1. **pnpm Migration** - pnpm replaces npm as the sole package manager
2. **Timeout Telemetry** - Observable timeout events in production
3. **Worker Thread Design** - Documented approach for future preemptive timeouts

---

## 1. pnpm Migration

### For Developers (First Time Setup)

```bash
# 1. Enable Corepack (one-time, requires Node.js ≥22)
corepack enable

# 2. Clone and install
git clone https://github.com/org/odd-ai-reviewers.git
cd odd-ai-reviewers
pnpm install

# 3. Verify installation
pnpm test
```

### For Existing Developers (Migration)

```bash
# 1. Enable Corepack if not already done
corepack enable

# 2. Remove old npm artifacts
rm -rf node_modules
rm package-lock.json  # Will be removed from repo

# 3. Install with pnpm
pnpm install

# 4. Verify
pnpm verify
```

### Common Commands

| npm Command      | pnpm Equivalent                  |
| ---------------- | -------------------------------- |
| `npm install`    | `pnpm install`                   |
| `npm ci`         | `pnpm install --frozen-lockfile` |
| `npm run build`  | `pnpm build`                     |
| `npm run test`   | `pnpm test`                      |
| `npm run lint`   | `pnpm lint`                      |
| `npm run verify` | `pnpm verify`                    |

### Workspace Commands

```bash
# Run command in specific workspace
pnpm --filter router build
pnpm --filter router test

# Run command in all workspaces
pnpm -r build
```

### Troubleshooting

**Error: "This project is configured to use pnpm"**

- Run `corepack enable` to activate Corepack
- Ensure Node.js ≥22 is installed

**Error: "Cannot find module..."**

- Delete `node_modules` and run `pnpm install`
- Check that `pnpm-lock.yaml` is up to date

---

## 2. Timeout Telemetry

### Enabling Telemetry

Telemetry is **disabled by default**. Enable via environment variables:

```bash
# Enable with console output only
export TELEMETRY_ENABLED=true

# Enable with JSONL file output
export TELEMETRY_ENABLED=true
export TELEMETRY_BACKENDS=console,jsonl
export TELEMETRY_JSONL_PATH=./telemetry/timeout-events.jsonl

# Set verbosity (minimal | standard | verbose)
export TELEMETRY_VERBOSITY=verbose
```

### Configuration Options

| Variable                   | Default    | Description                       |
| -------------------------- | ---------- | --------------------------------- |
| `TELEMETRY_ENABLED`        | `false`    | Master switch                     |
| `TELEMETRY_BACKENDS`       | `console`  | Comma-separated: console, jsonl   |
| `TELEMETRY_JSONL_PATH`     | -          | Required if jsonl backend enabled |
| `TELEMETRY_VERBOSITY`      | `standard` | minimal, standard, verbose        |
| `TELEMETRY_BUFFER_SIZE`    | `100`      | Events buffered before flush      |
| `TELEMETRY_FLUSH_INTERVAL` | `5000`     | Flush interval (ms)               |

### Event Format

**Console Output** (standard verbosity):

```
[2026-01-28T14:30:00.000Z] TIMEOUT warning local_llm_req_abc123 duration=601234ms threshold=600000ms
```

**JSONL Output**:

```json
{
  "operation_id": "local_llm_req_abc123",
  "duration_ms": 601234,
  "threshold_ms": 600000,
  "timestamp": "2026-01-28T14:30:00.000Z",
  "severity": "warning"
}
```

### Querying JSONL Telemetry

```bash
# Count timeout events by severity
jq -s 'group_by(.severity) | map({severity: .[0].severity, count: length})' timeout-events.jsonl

# Find slowest operations
jq -s 'sort_by(-.duration_ms) | .[0:10]' timeout-events.jsonl

# Filter by operation type
jq 'select(.operation_id | startswith("local_llm"))' timeout-events.jsonl
```

### Programmatic Usage

```typescript
import { configureTelemetry, emitTimeoutEvent, flushTelemetry } from './telemetry';

// Configure at application startup
configureTelemetry({
  enabled: true,
  backends: ['console', 'jsonl'],
  jsonl_path: './telemetry/timeout-events.jsonl',
  verbosity: 'standard',
});

// Emit events where timeouts occur
emitTimeoutEvent({
  operation_id: 'local_llm_req_123',
  duration_ms: 601234,
  threshold_ms: 600000,
  severity: 'error',
  allowed_context: {
    agent_id: 'local_llm',
    model_name: 'llama3',
  },
});

// Flush before exit
await flushTelemetry();
```

---

## 3. Worker Thread Design (Future Reference)

The Worker thread approach for preemptive timeouts is **documented but not implemented** in this feature.

See `docs/architecture/worker-timeout-design.md` for:

- Isolation model and architecture
- Message protocol specification
- Cancellation semantics
- Resource cleanup guarantees
- Limitations and trade-offs
- Migration criteria from current timeout model

### When to Consider Worker Threads

Current cooperative timeouts are sufficient unless:

- Operation may hang on CPU-bound code (e.g., pathological regex)
- Operation typically runs >1 second
- Startup overhead (~50ms) is acceptable

---

## CI/CD Notes

### GitHub Actions

Workflows automatically use pnpm via:

1. `pnpm/action-setup@v4` - Installs pnpm version from `packageManager` field
2. `actions/setup-node@v4` with `cache: 'pnpm'` - Caches pnpm store
3. `pnpm install --frozen-lockfile` - Deterministic installs

### Local CI Parity

Pre-commit and pre-push hooks enforce:

- Lint (zero warnings)
- Format check
- Type check
- Dependency cycle check

These match CI exactly for fail-fast feedback.

---

## Related Documentation

- [spec.md](./spec.md) - Feature specification
- [plan.md](./plan.md) - Implementation plan
- [data-model.md](./data-model.md) - Telemetry schema details
- [contracts/telemetry-schema.ts](./contracts/telemetry-schema.ts) - TypeScript definitions
- `docs/architecture/worker-timeout-design.md` - Worker thread design (after implementation)
