Got it — below is a **fully optimized, scope-tightened, mechanically testable version of the spec**.
This version is designed to **finish the roadmap without sprawl**, preserve determinism, and avoid "invisible scope creep" during planning.

---

# Feature Specification

## Build Tooling Migration & Timeout Telemetry Hardening (Final)

**Feature Branch:** `007-pnpm-timeout-telemetry`
**Created:** 2026-01-28
**Status:** Planning-Ready (Optimized)
**Scope Intent:** Final foundational feature for odd-ai-reviewers v1.x — no architectural refactors beyond explicitly stated items.

---

## Clarifications

### Session 2026-01-28

- Q: Which npm commands should the preinstall guard block? → A: Block only `npm install` and `npm ci`; allow harmless commands (`npm --version`, `npx`) to avoid CI/tooling breakage.
- Q: What are the telemetry capture semantics for timeout events? → A: 100% of detected threshold exceedances emit telemetry on best-effort basis; emission failures logged once per run; never affects control flow.
- Q: When is `flushTelemetry()` called for JSONL backend? → A: Called at shutdown and run summary; JSONL uses append-mode writes that are safe without explicit flush (flush ensures completeness).
- Q: How is timeout event severity determined? → A: Severity is always caller-supplied; no automatic derivation rules.
- Q: What is the required CI pnpm setup order? → A: `actions/setup-node` → `pnpm/action-setup` → `pnpm install --frozen-lockfile` to ensure proper cache behavior.
- Q: When should Worker threads NOT be used? → A: Do not use Workers for: operations <1s, I/O-bound work (use AbortController), operations requiring shared mutable state, or when startup overhead (~50ms) exceeds operation time.
- Q: Does a Dockerfile exist in this repo? → A: No Dockerfile exists; FR-007 Dockerfile clause is N/A for this repo.
- Q: Does CONTRIBUTING.md exist in this repo? → A: No CONTRIBUTING.md exists; documentation task for CONTRIBUTING.md is N/A.
- Q: What pnpm version should be pinned? → A: Pin pnpm 10.x (latest patch at time of merge) via `packageManager` field; Corepack is authoritative source.
- Q: How does pnpm/action-setup relate to Corepack? → A: `pnpm/action-setup` MUST respect the `packageManager` field pin via Corepack, not replace it with a separate version.

---

## Goals (Non-Negotiable)

1. **Deterministic, faster dependency installs** via pnpm with zero workflow regressions
2. **Observable timeout behavior** in production without coupling to any vendor tooling
3. **Future-safe design path** for true preemptive timeouts without partial implementation

---

## Explicit Non-Goals

- No Worker-thread refactors in this feature (design only)
- No external metrics SaaS integrations (adapters only)
- No performance regressions masked by "best effort" language
- No partial npm / pnpm dual-support mode

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Developer installs dependencies with pnpm (P1)

As a developer, I want pnpm to be the only supported package manager so installs are fast, deterministic, and consistent across CI and local environments.

**Independent Test:**
Fresh clone → single command install → all scripts, hooks, and tests succeed.

**Acceptance Scenarios**

1. **Given** a fresh clone
   **When** `pnpm install` is run
   **Then** dependencies install without warnings or manual intervention

2. **Given** an npm-based checkout
   **When** the developer follows migration instructions
   **Then** no conflicting lockfiles remain and installs succeed

3. **Given** CI
   **When** dependency install executes
   **Then** pnpm is used, lockfile is enforced, and CI passes

---

### User Story 2 — Operations observes timeout events (P2)

As an operator, I want deterministic, queryable timeout telemetry so slow or stuck operations are diagnosable after the fact.

**Independent Test:**
Trigger known timeout → assert emitted telemetry artifact.

**Acceptance Scenarios**

1. **Given** telemetry enabled
   **When** an operation exceeds its timeout threshold
   **Then** a timeout event is emitted with complete metadata (best-effort; emission failure logged once per run)

2. **Given** telemetry disabled
   **When** a timeout occurs
   **Then** execution behavior is unchanged and no events are emitted

3. **Given** telemetry backend unavailable
   **When** a timeout occurs
   **Then** execution continues and telemetry failure is logged once per run

---

### User Story 3 — Architect reviews Worker-thread timeout design (P3)

As an architect, I want a documented design for preemptive timeouts so future work is predictable and bounded.

**Independent Test:**
Design document review checklist passes.

**Acceptance Scenarios**

1. Architecture clearly separates cooperative vs preemptive timeouts
2. Worker termination, cleanup, and failure semantics are explicit
3. Migration criteria from current model are documented
4. Anti-patterns documented: when NOT to use Worker threads

---

## Edge Cases (Explicitly Handled)

- pnpm not installed → deterministic error + documented install path
- npm install/ci accidentally used → hard fail via preinstall guard with actionable message
- npm --version / npx used → allowed (not blocked by preinstall guard)
- Lockfile conflicts → documented cleanup procedure
- Telemetry disabled → zero runtime overhead
- Telemetry backend failure → no crash, bounded log noise (logged once per run)
- Telemetry emission failure → best-effort emission, failure logged, control flow unaffected
- JSONL backend without explicit flush → safe (append-mode writes); explicit flush at shutdown ensures completeness
- Worker crash (future) → documented cleanup & reporting behavior

---

## Requirements _(mandatory)_

### Package Manager Migration (pnpm)

- **FR-001**: pnpm MUST be the only supported package manager
- **FR-002**: `package.json` MUST declare `packageManager` field with pinned pnpm 10.x version (latest patch at time of merge); Corepack is the authoritative source for pnpm version
- **FR-003**: pnpm MUST be installed via Corepack in CI and recommended for dev; `pnpm/action-setup` MUST respect the `packageManager` field pin, not replace it
- **FR-004**: `pnpm-lock.yaml` MUST be committed and enforced (`--frozen-lockfile`)
- **FR-005**: All scripts MUST work when invoked via pnpm without modification
- **FR-006**: npm blocking MUST target only `npm install` and `npm ci` via preinstall guard; harmless commands (`npm --version`, `npx`, `npm help`) MUST NOT be blocked
- **FR-007**: CI and docs MUST use pnpm commands exclusively (no Dockerfile exists in this repo)
- **FR-007a**: CI workflow MUST follow setup order: `actions/setup-node` → `pnpm/action-setup` → `pnpm install --frozen-lockfile`

---

### Timeout Telemetry

- **FR-008**: A timeout event MUST be emitted (best-effort) whenever a configured timeout threshold is exceeded
- **FR-009**: Timeout events MUST include:
  - operation_id
  - duration_ms
  - threshold_ms
  - timestamp (ISO-8601)
  - severity (caller-supplied, no automatic derivation)

- **FR-010**: Telemetry MUST be enable/disable-able via configuration
- **FR-011**: Telemetry MUST support v1 backends:
  - `console`
  - `jsonl file`

- **FR-012**: Telemetry context metadata MUST be allow-listed (no free-form payloads)
- **FR-013**: Telemetry emission MUST NOT exceed 5% overhead in benchmarked paths
- **FR-014**: Telemetry failure MUST NOT affect control flow; emission failures MUST be logged once per run
- **FR-014a**: JSONL backend MUST use append-mode writes; `flushTelemetry()` MUST be called at shutdown and run summary to ensure completeness

---

### Worker-Thread Timeout Design (Design-Only)

- **FR-015**: Design doc MUST describe Worker isolation model
- **FR-016**: Design MUST specify:
  - message protocol
  - cancellation semantics
  - resource cleanup guarantees

- **FR-017**: Design MUST enumerate limitations (serialization, startup cost, memory)
- **FR-018**: Design MUST define explicit migration criteria from cooperative timeouts
- **FR-018a**: Design MUST document anti-patterns (when NOT to use Workers):
  - Operations completing in <1 second
  - I/O-bound work (use AbortController instead)
  - Operations requiring shared mutable state
  - Cases where startup overhead (~50ms) exceeds expected operation time

---

## Key Entities

- **TimeoutEvent**
  - operation_id
  - duration_ms
  - threshold_ms
  - timestamp
  - severity (caller-supplied)
  - allowed_context (optional, allow-listed)

- **TelemetryHook**
  - receives `TimeoutEvent`
  - dispatches to configured backend(s)
  - best-effort emission (failures logged, control flow unaffected)

- **TelemetryBackend**
  - interface with `emit(event)`, `flush()`, `close()`
  - v1 implementations: console, jsonl
  - jsonl uses append-mode writes

- **WorkerOperation** _(future)_
  - isolated execution unit with hard timeout

---

## Success Criteria _(mechanically testable)_

- **SC-001**: `pnpm install` succeeds on fresh clone with zero manual steps
- **SC-002**: CI dependency install time ≤ npm baseline (measured job artifact)
- **SC-003**: All CI pipelines pass using pnpm with frozen lockfile
- **SC-004**: 100% of detected timeout threshold exceedances emit a telemetry event when enabled (best-effort; emission failures do not fail this criterion)
- **SC-005**: Telemetry overhead ≤ 5% in benchmark test suite
- **SC-006**: Timeout events are persisted in JSONL format suitable for offline querying
- **SC-007**: Worker-thread timeout design doc approved by tech leads
- **SC-008**: Developer onboarding docs updated within one week of merge
- **SC-009**: `npm --version` and `npx` commands execute without preinstall guard blocking them

---

## Assumptions

- Node.js ≥ 22
- Corepack available in all runtimes
- Existing timeouts follow a common abstraction
- No npm-exclusive dependencies
- No requirement to ship external metrics ingestion in v1

---

## Risk Controls

- **Scope lock:** no Worker code changes
- **Telemetry isolation:** adapters only, no vendors
- **Determinism:** pinned versions, fixed schemas, frozen lockfiles
- **Auditability:** JSONL artifacts, explicit config
- **CI stability:** documented setup order prevents cache regressions
