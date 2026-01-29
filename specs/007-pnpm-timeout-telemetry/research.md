# Research: Build Tooling Migration & Timeout Telemetry

**Feature**: 007-pnpm-timeout-telemetry
**Date**: 2026-01-28
**Status**: Complete

## R1. pnpm Migration Best Practices

### Decision

Use Corepack for pnpm management with `packageManager` field in package.json.

### Rationale

- Corepack is bundled with Node.js ≥16.13, already available in Node 22 requirement
- `packageManager` field ensures consistent version across all environments
- Eliminates need for global pnpm installation instructions
- Native workspace support for monorepo structure

### Alternatives Considered

| Alternative              | Rejected Because                                                          |
| ------------------------ | ------------------------------------------------------------------------- |
| Manual pnpm installation | Inconsistent versions across developers, extra setup friction             |
| npm + pnpm dual support  | Explicitly excluded in spec non-goals; creates maintenance burden         |
| Yarn migration           | No compelling advantage over pnpm; would require similar migration effort |

### Research Findings

**Current State Analysis**:

- Lock file: `package-lock.json` (lockfileVersion 3, ~246KB)
- NPM config: `.npmrc` with `engine-strict=true`, `save-exact=true`
- Workspaces: Single `router` workspace defined in root package.json
- Node requirement: `>=22.0.0` (already enforced via `engines` field)

**Migration Path**:

1. `pnpm import` converts npm lockfile to `pnpm-lock.yaml` (preserves resolution)
2. Add `"packageManager": "pnpm@9.x.x"` to root package.json
3. Remove `package-lock.json` after successful conversion
4. Update `.npmrc` (compatible with pnpm)

**CI Integration**:

- GitHub Actions: `pnpm/action-setup@v4` with version from packageManager field
- Cache strategy: pnpm store path `~/.local/share/pnpm/store/v3`
- Corepack: `corepack enable` in workflow before pnpm commands

**Workspace Behavior**:

- pnpm supports npm workspace syntax natively
- `pnpm install` at root installs all workspace dependencies
- `pnpm --filter router <command>` for workspace-specific commands

---

## R2. Timeout Telemetry Patterns

### Decision

Extend existing `SecurityEventSchema` pattern for timeout telemetry with dedicated module.

### Rationale

- Proven schema validation with Zod already in codebase
- Existing `SecurityEventOutcome.timeout` enum value demonstrates pattern
- Pattern hashing function available for safe logging (no raw patterns)
- Run ID generation already implemented in security-logger.ts
- Separation of concerns: new module for telemetry, existing security-logger for security events

### Alternatives Considered

| Alternative                      | Rejected Because                                                  |
| -------------------------------- | ----------------------------------------------------------------- |
| New standalone telemetry library | Unnecessary complexity; existing infrastructure sufficient        |
| OpenTelemetry SDK                | External dependency; spec explicitly excludes vendor integrations |
| Inline logging (no module)       | No schema validation; inconsistent event format                   |
| Extend security-logger directly  | Conflates security events with operational telemetry              |

### Research Findings

**Existing Timeout Points** (instrumentation targets):

| Location           | Default Timeout         | Mechanism                    | Operation Type   |
| ------------------ | ----------------------- | ---------------------------- | ---------------- |
| `local_llm.ts`     | 600,000ms (10min)       | AbortController + setTimeout | HTTP fetch       |
| `timeout-regex.ts` | 100ms (10-1000ms range) | process.hrtime.bigint()      | Regex evaluation |
| `semgrep.ts`       | 300,000ms (5min)        | execSync timeout option      | Subprocess       |
| `reviewdog.ts`     | 300,000ms (5min)        | execSync timeout option      | Subprocess       |
| `security.ts`      | 2,000-5,000ms           | execSync timeout option      | Subprocess       |

**Existing Metrics Infrastructure**:

- `AgentMetrics.durationMs` - per-agent timing
- `runSummary.timeoutCount` - aggregate timeout counter
- `SecurityEvent.durationMs` - per-event timing
- `SecurityEventOutcome.timeout` - outcome enum value

**Event Schema Design**:

- JSONL format: One JSON object per line, UTF-8 encoded
- ISO-8601 timestamps for cross-system compatibility
- Operation ID pattern: `{type}_{identifier}` (e.g., `local_llm_abc123`)
- Allow-listed context fields prevent unbounded data leakage

**Backend Requirements**:

- Console: Structured log line with severity prefix
- JSONL: Append-only file writes, periodic flush
- Both: Graceful degradation on write failure (FR-014)

---

## R3. Worker Thread Architecture Patterns

### Decision

Document isolation model using Node.js `worker_threads` module for future implementation.

### Rationale

- Native Node.js module since v10.5.0, stable API
- True preemptive cancellation via `worker.terminate()`
- Structured message passing via MessagePort
- No external dependencies required

### Alternatives Considered

| Alternative                            | Rejected Because                                          |
| -------------------------------------- | --------------------------------------------------------- |
| Child processes (`child_process.fork`) | Higher overhead (~30MB vs ~10MB), IPC complexity          |
| Web Workers                            | Browser-only API, not applicable to Node.js               |
| AsyncLocalStorage + setImmediate       | Cooperative only, cannot terminate stuck synchronous code |
| vm.runInContext with timeout           | Same thread, cannot interrupt CPU-bound code              |

### Research Findings

**Worker Thread Characteristics**:

| Aspect          | Value                       | Implication                               |
| --------------- | --------------------------- | ----------------------------------------- |
| Startup time    | ~50ms                       | Acceptable for operations >1s             |
| Memory overhead | ~10MB per worker            | Pool workers for frequent operations      |
| Serialization   | Structured clone algorithm  | Some types non-transferable               |
| Termination     | Immediate via `terminate()` | No graceful shutdown, must handle cleanup |

**Communication Model**:

```
Main Thread                    Worker Thread
     │                              │
     │──── postMessage(task) ──────>│
     │                              │ (execute)
     │<─── postMessage(result) ─────│
     │                              │
     │──── terminate() ────────────>│ (if timeout)
     │                              X
```

**Cleanup Considerations**:

- File handles: Worker termination may leave handles open
- Network connections: AbortController signals not propagated
- Memory: Worker V8 isolate fully reclaimed on termination
- State: No shared mutable state between threads

**Migration Criteria** (for future implementation):

1. Operation typically runs >1 second
2. Operation may hang on CPU-bound code (e.g., pathological regex)
3. Current cooperative timeout is insufficient
4. Startup overhead acceptable for use case

---

## R4. GitHub Actions pnpm Cache Strategy

### Decision

Use `pnpm/action-setup@v4` action with built-in caching via setup-node cache-dependency-path.

### Rationale

- Official pnpm action maintained by pnpm team
- Automatic version detection from `packageManager` field
- Consistent behavior across workflows

### Alternatives Considered

| Alternative                  | Rejected Because                                      |
| ---------------------------- | ----------------------------------------------------- |
| Manual `actions/cache` setup | More complex configuration, maintenance burden        |
| No caching                   | Significantly slower CI (~2-3min vs ~30s for install) |
| npm + pnpm parallel caches   | Conflicts with npm-blocking requirement               |

### Research Findings

**Current CI Configuration** (workflows affected):

- `ci.yml` - Main quality gates, uses `cache: 'npm'`
- `badge-update.yml` - Badge generation, uses `cache: 'npm'`
- `ai-review.yml` - Reusable workflow, uses `cache-dependency-path: router/package-lock.json`
- `dogfood-review.yml` - Self-review, calls ai-review.yml

**Migration Pattern**:

```yaml
# Before (npm)
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'
- run: npm ci

# After (pnpm)
- uses: pnpm/action-setup@v4
  # version auto-detected from packageManager field
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'pnpm'
- run: pnpm install --frozen-lockfile
```

**Cache Key Strategy**:

- Key: `pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`
- Store: `~/.local/share/pnpm/store/v3` (Linux)
- Restore: Falls back to `pnpm-${{ runner.os }}-` prefix

**Workflow-Specific Notes**:

- Fresh clone test: Must enable Corepack before `pnpm install`
- Container build: Dockerfile needs pnpm installation layer
- Badge workflow: Artifact structure unchanged (test-results.json, coverage-summary.json)

---

## Summary

All research items complete. No NEEDS CLARIFICATION markers remain.

| Topic                  | Decision                      | Confidence |
| ---------------------- | ----------------------------- | ---------- |
| Package manager        | pnpm via Corepack             | High       |
| Telemetry architecture | Dedicated module, Zod schemas | High       |
| Worker threads         | Design document only          | High       |
| CI caching             | pnpm/action-setup@v4          | High       |
