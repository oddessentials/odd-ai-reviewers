# Implementation Plan: Build Tooling Migration & Timeout Telemetry

**Branch**: `007-pnpm-timeout-telemetry` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-pnpm-timeout-telemetry/spec.md`

## Summary

Migrate from npm to pnpm as the sole package manager (FR-001–FR-007), implement timeout telemetry with console and JSONL backends (FR-008–FR-014), and document a Worker-thread preemptive timeout design (FR-015–FR-018). The telemetry system will leverage existing `SecurityEventSchema` patterns and extend the `AgentMetrics` infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.9.x (ESM), Node.js ≥22.0.0
**Primary Dependencies**: Vitest 4.x (testing), Husky 9.x (hooks), lint-staged 16.x, Prettier 3.x, ESLint 9.x, Zod 4.x (schema validation)
**Storage**: JSONL file backend (ephemeral, per-run), console output
**Testing**: Vitest with coverage thresholds (65% statements CI, 60% local)
**Target Platform**: Linux CI (GitHub Actions), local dev (Windows/macOS/Linux)
**Project Type**: Single monorepo with `router` workspace
**Performance Goals**: Telemetry overhead ≤5% in benchmarked paths (SC-005)
**Constraints**: No external metrics SaaS, no Worker-thread implementation (design only)
**Scale/Scope**: Current codebase ~8 production deps, ~23 dev deps

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                          |
| -------------------------------- | ------- | ---------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | Telemetry is internal logging, not PR posting  |
| II. Structured Findings Contract | ✅ Pass | TimeoutEvent follows structured schema pattern |
| III. Provider-Neutral Core       | ✅ Pass | JSONL/console backends are provider-agnostic   |
| IV. Security-First Design        | ✅ Pass | No secrets in telemetry, no inbound listeners  |
| V. Deterministic Outputs         | ✅ Pass | Fixed schemas, allow-listed context metadata   |
| VI. Bounded Resources            | ✅ Pass | 5% overhead limit enforced via benchmark       |
| VII. Environment Discipline      | ✅ Pass | pnpm via Corepack (pinned), frozen lockfile    |
| VIII. Explicit Non-Goals         | ✅ Pass | Not a CI runner, no external secrets storage   |

**Quality Gates Compliance:**

- Zero-Tolerance Lint Policy: pnpm commands preserve lint behavior
- Security Linting: No new child process patterns requiring audit
- Dependency Architecture: No new circular dependencies introduced
- Local = CI Parity: pnpm install parity via frozen lockfile

## Project Structure

### Documentation (this feature)

```text
specs/007-pnpm-timeout-telemetry/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (telemetry schema)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Existing structure (Single project)
router/
├── src/
│   ├── agents/
│   │   └── control_flow/
│   │       └── timeout-regex.ts     # Existing timeout mechanism
│   ├── telemetry/                   # NEW: Timeout telemetry module
│   │   ├── index.ts                 # Public exports
│   │   ├── types.ts                 # TimeoutEvent, TelemetryConfig schemas
│   │   ├── hook.ts                  # TelemetryHook orchestrator
│   │   ├── backends/
│   │   │   ├── console.ts           # Console backend
│   │   │   └── jsonl.ts             # JSONL file backend
│   │   └── emitter.ts               # Low-overhead event emission
│   ├── security-logger.ts           # Existing (extends with timeout telemetry)
│   └── diff.ts
├── tests/
│   ├── unit/
│   │   └── telemetry/               # NEW: Unit tests for telemetry
│   └── integration/
│       └── telemetry.integration.test.ts  # NEW: Backend integration tests
└── dist/

# Root-level changes
package.json                 # Add packageManager field
pnpm-lock.yaml               # NEW (replaces package-lock.json)
.npmrc                       # Update for pnpm compatibility

# Documentation
docs/
├── getting-started/
│   └── development-setup.md # Update for pnpm commands
└── architecture/
    └── worker-timeout-design.md  # NEW: P3 design document
```

**Structure Decision**: Single project layout preserved. Telemetry module added under `router/src/telemetry/` following existing module patterns (e.g., `agents/control_flow/`). Design document placed in `docs/architecture/` alongside existing architecture docs.

## Complexity Tracking

> No violations requiring justification. All changes fit within existing patterns.

---

## Phase 0: Research

### R1. pnpm Migration Best Practices

**Decision**: Use Corepack for pnpm management with `packageManager` field in package.json; pin pnpm 10.x (latest patch at merge time)

**Rationale**:

- Corepack is bundled with Node.js ≥16.13, already available in Node 22 requirement
- `packageManager` field is the authoritative source for pnpm version; Corepack enforces it
- `pnpm/action-setup` MUST respect the `packageManager` field pin via Corepack, not replace it
- Eliminates need for global pnpm installation instructions

**Alternatives Considered**:

- Manual pnpm installation: Rejected (inconsistent versions, extra dev setup)
- npm + pnpm dual support: Rejected (spec explicitly excludes this as non-goal)

**Research Findings**:

- Current lockfile: `package-lock.json` (v3 format, 246KB)
- Conversion: `pnpm import` can convert npm lockfile to pnpm-lock.yaml
- Corepack enable: `corepack enable` in CI and docs
- Workspace support: pnpm handles `workspaces: ["router"]` natively

### R2. Timeout Telemetry Patterns

**Decision**: Extend existing `SecurityEventSchema` pattern for timeout telemetry

**Rationale**:

- Proven schema validation with Zod already in place
- Existing `SecurityEventOutcome.timeout` enum value
- Pattern hashing function available for safe logging
- Run ID generation already implemented

**Alternatives Considered**:

- New standalone telemetry library: Rejected (unnecessary complexity, existing infrastructure sufficient)
- OpenTelemetry SDK: Rejected (external dependency, spec explicitly excludes vendor integrations)

**Research Findings**:

- Existing timeout points: LocalLLM (600s), Pattern evaluation (100ms), Subprocess (300s)
- Existing metrics: `AgentMetrics.durationMs`, `runSummary.timeoutCount`
- JSONL format: Append-only, one JSON object per line, suitable for offline querying
- Console format: Structured log lines with timestamp prefix

### R3. Worker Thread Architecture Patterns

**Decision**: Document isolation model using Node.js `worker_threads` module

**Rationale**:

- Native Node.js module, no external dependencies
- Supports `worker.terminate()` for true preemptive cancellation
- MessageChannel for structured communication
- Transferable objects for efficient data passing

**Alternatives Considered**:

- Child processes: Rejected (higher overhead, cross-platform complexity)
- Web Workers: Rejected (browser-only, not applicable)

**Research Findings**:

- Worker startup cost: ~50ms (acceptable for long operations)
- Memory overhead: Separate V8 isolate (~10MB per worker)
- Serialization cost: Must serialize/deserialize data across thread boundary
- Cleanup: `worker.terminate()` kills thread immediately, no graceful shutdown

### R4. GitHub Actions pnpm Cache Strategy

**Decision**: Use `pnpm/action-setup` action with setup-node cache integration

**Rationale**:

- Official pnpm GitHub Action with cache support
- Respects `packageManager` field for version detection
- Store hash based on `pnpm-lock.yaml`

**Alternatives Considered**:

- Manual cache setup with `actions/cache`: Rejected (more complex, pnpm action handles it)
- No caching: Rejected (slower CI, poor developer experience)

**Research Findings**:

- Current CI uses `cache: 'npm'` with setup-node
- Migration: Replace with `pnpm/action-setup@v4` + `actions/setup-node@v4` with `cache: 'pnpm'`
- Store path: pnpm store is at `~/.local/share/pnpm/store/v3` (Linux)

**CI Setup Order** (per FR-007a clarification):

1. `actions/setup-node@v4` (with `cache: 'pnpm'`)
2. `pnpm/action-setup@v4` (version from packageManager field)
3. `pnpm install --frozen-lockfile`

This order ensures proper cache behavior and avoids subtle regressions.

---

## Phase 1: Design

### Data Model

See [data-model.md](./data-model.md) for full schema definitions.

**Core Entities**:

1. **TimeoutEvent** - Immutable record of a timeout occurrence
   - `operation_id`: Unique identifier for the operation
   - `duration_ms`: Actual elapsed time
   - `threshold_ms`: Configured timeout threshold
   - `timestamp`: ISO-8601 datetime
   - `severity`: 'warning' | 'error' | 'critical' (caller-supplied, no automatic derivation)
   - `allowed_context`: Optional allow-listed metadata

2. **TelemetryConfig** - Configuration for telemetry behavior
   - `enabled`: boolean
   - `backends`: Array of backend types ('console' | 'jsonl')
   - `jsonl_path`: Optional path for JSONL output
   - `verbosity`: 'minimal' | 'standard' | 'verbose'

3. **TelemetryBackend** - Interface for event sinks
   - `emit(event: TimeoutEvent): Promise<void>` (best-effort, failures logged once per run)
   - `flush(): Promise<void>` (called at shutdown and run summary)
   - `close(): Promise<void>`
   - JSONL backend uses append-mode writes (safe without explicit flush)

### API Contracts

See [contracts/](./contracts/) for schema files.

**Telemetry Module Public API**:

```typescript
// Enable/disable telemetry
function configureTelemetry(config: TelemetryConfig): void;

// Emit a timeout event (no-op if disabled)
function emitTimeoutEvent(event: TimeoutEvent): void;

// Flush pending events (for JSONL backend)
function flushTelemetry(): Promise<void>;

// Check if telemetry is enabled
function isTelemetryEnabled(): boolean;
```

### Integration Points

1. **LocalLLM Agent** (`router/src/agents/local_llm.ts:42`)
   - Emit timeout event when `AbortError` is caught
   - Include operation*id: `local_llm*${requestId}`

2. **Pattern Evaluation** (`router/src/agents/control_flow/timeout-regex.ts:89`)
   - Emit timeout event when `timedOut: true` in result
   - Include operation*id: `pattern_eval*${patternHash}`

3. **Subprocess Execution** (`router/src/agents/semgrep.ts`, `reviewdog.ts`)
   - Emit timeout event when `execSync` throws ETIMEDOUT
   - Include operation*id: `subprocess*${toolName}`

### Quickstart

See [quickstart.md](./quickstart.md) for developer onboarding.

---

## Phase 2: Implementation Phases

### Phase 2.1: pnpm Migration (P1)

**Scope**: FR-001 through FR-007a

1. Add `packageManager` field to root `package.json` with pnpm 10.x (latest patch at merge time); Corepack is authoritative
2. Generate `pnpm-lock.yaml` via `pnpm import`
3. Add npm-blocking preinstall script (blocks only `npm install` and `npm ci`; allows `npm --version`, `npx`)
4. Update `.npmrc` for pnpm compatibility
5. Update all GitHub Actions workflows (setup-node → pnpm/action-setup → pnpm install order); pnpm/action-setup must respect packageManager pin
6. Update documentation (README.md exists; no Dockerfile or CONTRIBUTING.md in this repo)

**Verification**: SC-001, SC-002, SC-003, SC-009

### Phase 2.2: Timeout Telemetry Core (P2)

**Scope**: FR-008 through FR-014

1. Create `router/src/telemetry/` module structure
2. Implement `TimeoutEvent` and `TelemetryConfig` schemas (Zod)
3. Implement console backend
4. Implement JSONL backend with buffered writes
5. Implement `TelemetryHook` orchestrator
6. Add configuration via environment variables
7. Integrate with existing timeout points

**Verification**: SC-004, SC-005, SC-006

### Phase 2.3: Worker Thread Design Document (P3)

**Scope**: FR-015 through FR-018a

1. Create `docs/architecture/worker-timeout-design.md`
2. Document Worker isolation model
3. Document message protocol and cancellation semantics
4. Document limitations and migration criteria
5. Document anti-patterns (when NOT to use Workers):
   - Operations <1s
   - I/O-bound work (use AbortController)
   - Shared mutable state requirements
   - Startup overhead exceeds operation time

**Verification**: SC-007

### Phase 2.4: Documentation Update

**Scope**: SC-008

1. Update `docs/getting-started/development-setup.md`
2. Update README.md if applicable
3. Update CONTRIBUTING.md if applicable

---

## Risk Mitigation

| Risk                           | Mitigation                                          |
| ------------------------------ | --------------------------------------------------- |
| pnpm lockfile incompatibility  | Run `pnpm import` to convert, test with fresh clone |
| CI cache invalidation          | pnpm action handles cache keying automatically      |
| Telemetry performance overhead | Benchmark before/after, gate on 5% threshold        |
| JSONL write failures           | Graceful degradation, log once per run (FR-014)     |
| Worker design scope creep      | Explicitly marked as design-only, no implementation |

---

## Artifacts Generated

- `research.md` - Research findings (Phase 0)
- `data-model.md` - Entity schemas (Phase 1)
- `contracts/telemetry-schema.ts` - TypeScript schema definitions
- `quickstart.md` - Developer quickstart guide
