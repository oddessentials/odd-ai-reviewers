# Tasks: AgentResult Discriminated Unions

**Feature**: 011-agent-result-unions | **Generated**: 2026-01-29
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=Exhaustive Handling, US2=Type-Safe Construction, US3=Typed Metadata)
- Paths are relative to repository root

## User Stories (all P1 - ship together)

- **US1**: Exhaustive Agent Result Handling - discriminated union with `assertNever`
- **US2**: Type-Safe Result Construction - constructor helpers prevent invalid states
- **US3**: Typed Metadata Fields - typed helpers for `Finding.metadata` and `AgentContext.env`

**Note**: This is a refactoring feature where all stories are tightly coupled. The migration must proceed in order: types → producers → consumers → cleanup.

---

## Phase 1: Setup (Core Type Definition)

**Purpose**: Define discriminated union types and enforcement infrastructure

- [ ] T001 [US1] [US2] Define AgentResult discriminated union types in `router/src/agents/types.ts`
- [ ] T002 [P] [US1] Add Zod serialization schema for AgentResult in `router/src/agents/types.ts`
- [ ] T003 [P] [US2] Add AgentSuccess/AgentFailure/AgentSkipped constructor helpers in `router/src/agents/types.ts`
- [ ] T004 [P] [US1] Add isSuccess/isFailure/isSkipped type guards in `router/src/agents/types.ts`
- [ ] T005 [US1] Add temporary deprecated success getter for migration in `router/src/agents/types.ts`
- [ ] T006 [P] [US3] Create metadata helpers module in `router/src/agents/metadata.ts`
- [ ] T007 [US3] Add depcruise rule for metadata isolation in `.dependency-cruiser.cjs`

---

## Phase 2: Foundational (Enforcement Infrastructure)

**Purpose**: CI checks that MUST be in place before migration begins

- [ ] T008 [P] Create migration allowlist file at `migration-allowlist.txt`
- [ ] T009 Add grep check for .success ban in `scripts/check-success-ban.sh`
- [ ] T010 [P] Add grep check for object literal ban in `scripts/check-literal-ban.sh`

**Checkpoint**: Enforcement infrastructure ready - migration can begin

---

## Phase 3: User Story 1 - Exhaustive Handling Tests

**Goal**: Prove exhaustiveness checking works via tests before migration

**Independent Test**: Canary test fails at compile-time if variant added without handler update

- [ ] T011 [US1] Add unit tests for AgentResult types in `router/src/__tests__/agents/types.test.ts`
- [ ] T012 [US1] Add tsd-style canary test in `router/src/__tests__/integration/exhaustiveness-canary.test.ts`
- [ ] T013 [US1] Add partialFindings exclusion test in `router/src/__tests__/integration/partial-findings.test.ts`
- [ ] T014 [P] [US3] Add metadata helpers tests in `router/src/__tests__/agents/metadata.test.ts`
- [ ] T015 Phase 1 commit checkpoint - run `pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise`

**Checkpoint**: Types defined, tests passing, enforcement active - agent migration can begin

---

## Phase 4: User Story 2 - Agent Migration (Producers)

**Goal**: All agents use constructor helpers instead of object literals

**Independent Test**: Each agent's tests pass; grep checks pass after each migration

- [ ] T016 [P] [US2] Migrate opencode agent to constructors in `router/src/agents/opencode.ts`
- [ ] T017 [P] [US2] Migrate pr_agent to constructors in `router/src/agents/pr_agent.ts`
- [ ] T018 [P] [US2] Migrate ai_semantic_review agent to constructors in `router/src/agents/ai_semantic_review.ts`
- [ ] T019 [P] [US2] Migrate semgrep agent to constructors in `router/src/agents/semgrep.ts`
- [ ] T020 [P] [US2] Migrate reviewdog agent to constructors in `router/src/agents/reviewdog.ts`
- [ ] T021 [P] [US2] Migrate local_llm agent to constructors in `router/src/agents/local_llm.ts`
- [ ] T022 [P] [US2] Migrate control_flow agent to constructors in `router/src/agents/control_flow/index.ts`
- [ ] T023 Phase 2 commit checkpoint - verify all agents removed from allowlist

**Checkpoint**: All 7 agents migrated - consumer migration can begin

---

## Phase 5: User Story 1 - Consumer Migration

**Goal**: All consumers use switch/assertNever pattern instead of boolean checks

**Independent Test**: Each consumer's tests pass; switch includes `assertNever(result)` in default

- [ ] T024 [P] [US1] Migrate execute phase to switch pattern in `router/src/phases/execute.ts`
- [ ] T025 [P] [US1] Migrate report phase to switch pattern in `router/src/phases/report.ts`
- [ ] T026 [P] [US1] Migrate report formats to switch pattern in `router/src/report/formats.ts`
- [ ] T027 [P] [US1] Migrate telemetry to switch pattern in `router/src/telemetry/index.ts`
- [ ] T028 [P] [US1] Migrate security-logger to switch pattern in `router/src/security-logger.ts`
- [ ] T029 [P] [US1] Migrate cache store to switch pattern in `router/src/cache/store.ts`
- [ ] T030 Phase 3 commit checkpoint - verify all consumers removed from allowlist

**Checkpoint**: All 6 consumers migrated - cleanup can begin

---

## Phase 6: Cleanup & Polish

**Purpose**: Remove migration scaffolding and final validation

- [ ] T031 Migrate test files to use constructors in `router/src/__tests__/**/*.ts`
- [ ] T032 Delete deprecated success getter from `router/src/agents/types.ts`
- [ ] T033 Delete migration allowlist file `migration-allowlist.txt`
- [ ] T034 Update check-success-ban.sh to remove allowlist flag in `scripts/check-success-ban.sh`
- [ ] T035 Final validation - verify all 16 success criteria pass
- [ ] T036 Final commit with message: `chore(agents): complete AgentResult discriminated union migration (011)`

**Checkpoint**: Feature complete - ready for PR

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)        → T001-T007 → Types and metadata defined
Phase 2 (Foundational) → T008-T010 → Enforcement scripts ready
Phase 3 (Tests)        → T011-T015 → Tests prove types work
Phase 4 (Agents)       → T016-T023 → All 7 agents migrated [P]
Phase 5 (Consumers)    → T024-T030 → All 6 consumers migrated [P]
Phase 6 (Cleanup)      → T031-T036 → Scaffolding removed
```

### Parallel Opportunities

**Within Phase 1** (after T001):

- T002, T003, T004, T006 can run in parallel (different concerns in same file or different files)

**Within Phase 2**:

- T008, T010 can run in parallel (different files)

**Within Phase 3** (after T011):

- T012, T013, T014 can run in parallel (different test files)

**Within Phase 4** (after T015):

- ALL agent migrations T016-T022 can run in parallel (different files)

**Within Phase 5** (after T023):

- ALL consumer migrations T024-T029 can run in parallel (different files)

---

## Task Details

### T001: Define AgentResult discriminated union types

**File**: `router/src/agents/types.ts`
**FR**: FR-001, FR-011, FR-013

```typescript
type AgentResultStatus = 'success' | 'failure' | 'skipped';
type FailureStage = 'preflight' | 'exec' | 'postprocess';

interface AgentResultBase {
  agentId: string;
  metrics: AgentMetrics;
}

interface AgentResultSuccess extends AgentResultBase {
  status: 'success';
  findings: Finding[];
}

interface AgentResultFailure extends AgentResultBase {
  status: 'failure';
  error: string;
  failureStage: FailureStage;
  partialFindings: Finding[];
}

interface AgentResultSkipped extends AgentResultBase {
  status: 'skipped';
  reason: string;
}

type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;
```

### T002: Add Zod serialization schema

**File**: `router/src/agents/types.ts`
**FR**: FR-025, FR-014

```typescript
import { z } from 'zod';

const AgentResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    agentId: z.string(),
    findings: z.array(FindingSchema),
    metrics: AgentMetricsSchema,
  }),
  z.object({
    status: z.literal('failure'),
    agentId: z.string(),
    error: z.string(),
    failureStage: z.enum(['preflight', 'exec', 'postprocess']),
    partialFindings: z.array(FindingSchema),
    metrics: AgentMetricsSchema,
  }),
  z.object({
    status: z.literal('skipped'),
    agentId: z.string(),
    reason: z.string(),
    metrics: AgentMetricsSchema,
  }),
]);
```

### T003: Add constructor helpers

**File**: `router/src/agents/types.ts`
**FR**: FR-002, FR-012

```typescript
function AgentSuccess(params: {
  agentId: string;
  findings: Finding[];
  metrics: AgentMetrics;
}): AgentResultSuccess {
  return { status: 'success', ...params };
}

function AgentFailure(params: {
  agentId: string;
  error: string;
  failureStage: FailureStage;
  partialFindings?: Finding[];
  metrics: AgentMetrics;
}): AgentResultFailure {
  return {
    status: 'failure',
    agentId: params.agentId,
    error: params.error,
    failureStage: params.failureStage,
    partialFindings: params.partialFindings ?? [],
    metrics: params.metrics,
  };
}

function AgentSkipped(params: {
  agentId: string;
  reason: string;
  metrics: AgentMetrics;
}): AgentResultSkipped {
  return { status: 'skipped', ...params };
}
```

### T004: Add type guards

**File**: `router/src/agents/types.ts`
**FR**: FR-001

```typescript
function isSuccess(result: AgentResult): result is AgentResultSuccess {
  return result.status === 'success';
}
function isFailure(result: AgentResult): result is AgentResultFailure {
  return result.status === 'failure';
}
function isSkipped(result: AgentResult): result is AgentResultSkipped {
  return result.status === 'skipped';
}
```

### T005: Add temporary deprecated success getter

**File**: `router/src/agents/types.ts`
**FR**: FR-006, FR-021

```typescript
// MIGRATION: Remove before PR series merges (FR-021)
// NOTE: Files using this getter MUST be in migration-allowlist.txt (FR-019)
function addDeprecatedSuccessGetter<T extends AgentResult>(result: T): T & { success: boolean } {
  return {
    ...result,
    get success(): boolean {
      return result.status === 'success';
    },
  };
}
```

**Compatibility Note**: Does NOT violate FR-019 - allowlist covers transitional usage.

### T006: Create metadata helpers module

**File**: `router/src/agents/metadata.ts` (NEW)
**FR**: FR-007, FR-008, FR-028

```typescript
interface SecurityMetadata {
  cwe?: string;
  owasp?: string;
  confidence?: 'high' | 'medium' | 'low';
  cveId?: string;
}
interface KnownEnvVars {
  GITHUB_TOKEN?: string;
  AZURE_DEVOPS_PAT?: string;
  SYSTEM_ACCESSTOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
}

function getSecurityMetadata(finding: { metadata?: Record<string, unknown> }): SecurityMetadata {
  /* ... */
}
function getKnownEnv(env: Record<string, string | undefined>): KnownEnvVars {
  /* ... */
}
```

### T007: Add depcruise rule for metadata isolation

**File**: `.dependency-cruiser.cjs`
**FR**: FR-028

```javascript
{ name: 'no-metadata-back-edges', from: { path: '^router/src/agents/metadata\\.ts$' }, to: { path: '^router/src/agents/(?!types\\.ts|index\\.ts).*\\.ts$' }, severity: 'error' }
```

### T008-T010: Enforcement scripts

- **T008**: Create `migration-allowlist.txt` listing all 13 production files + `__tests__/`
- **T009**: Create `scripts/check-success-ban.sh` - grep for `.success\b` excluding main.ts + allowlist
- **T010**: Create `scripts/check-literal-ban.sh` - grep for `status: 'success'` excluding types.ts

### T016-T022: Agent migration pattern

For each agent file:

1. Import `AgentSuccess`, `AgentFailure`, `AgentSkipped`
2. Replace object literals with constructor calls
3. Use `partialFindings` for failure cases with `failureStage`
4. Remove from `migration-allowlist.txt`

### T024-T029: Consumer migration pattern

For each consumer file:

1. Replace `if (result.success)` with `switch (result.status)`
2. Add `assertNever(result)` in default case (FR-003)
3. Handle all three variants explicitly (FR-004)
4. Remove from `migration-allowlist.txt`

---

## Files to Modify (Explicit List)

### Agent Files (7 files, Phase 4)

1. `router/src/agents/opencode.ts` - 4 return sites
2. `router/src/agents/pr_agent.ts` - 4 return sites
3. `router/src/agents/ai_semantic_review.ts` - 4 return sites
4. `router/src/agents/semgrep.ts` - 3 return sites
5. `router/src/agents/reviewdog.ts` - 4 return sites
6. `router/src/agents/local_llm.ts` - 7 return sites
7. `router/src/agents/control_flow/index.ts` - 3 return sites

### Consumer Files (6 files, Phase 5)

1. `router/src/phases/execute.ts` - 2 boolean checks
2. `router/src/phases/report.ts` - 2 boolean checks
3. `router/src/report/formats.ts` - 1 boolean check
4. `router/src/telemetry/index.ts` - 1 boolean check
5. `router/src/security-logger.ts` - 1 boolean check
6. `router/src/cache/store.ts` - serialization + boolean checks

### Core Type Files (1 file, Phase 1)

1. `router/src/agents/types.ts` - discriminated union + Zod schema

### New Files (8 files)

1. `router/src/agents/metadata.ts` - typed metadata helpers
2. `router/src/__tests__/agents/types.test.ts` - unit tests
3. `router/src/__tests__/agents/metadata.test.ts` - metadata tests
4. `router/src/__tests__/integration/exhaustiveness-canary.test.ts` - canary test
5. `router/src/__tests__/integration/partial-findings.test.ts` - partialFindings test
6. `scripts/check-success-ban.sh` - grep check for .success
7. `scripts/check-literal-ban.sh` - grep check for literals
8. `migration-allowlist.txt` - temporary allowlist (deleted in Phase 6)

---

## Implementation Strategy

### MVP First (Phase 1-3)

1. Complete Phase 1: Setup (types defined)
2. Complete Phase 2: Foundational (enforcement ready)
3. Complete Phase 3: Tests (prove types work)
4. **STOP and VALIDATE**: All tests pass, grep checks pass

### Incremental Delivery

1. Phase 4: Migrate agents in parallel → All producers use constructors
2. Phase 5: Migrate consumers in parallel → All consumers use switch
3. Phase 6: Cleanup → Remove scaffolding, final validation

---

## Summary Statistics

- **Total Tasks**: 36
- **Phase 1 (Setup)**: 7 tasks
- **Phase 2 (Foundational)**: 3 tasks
- **Phase 3 (Tests)**: 5 tasks
- **Phase 4 (Agents)**: 8 tasks (7 parallel + commit)
- **Phase 5 (Consumers)**: 7 tasks (6 parallel + commit)
- **Phase 6 (Cleanup)**: 6 tasks
- **Parallel Opportunities**: 23 tasks marked [P]
- **Files Modified**: 14 existing + 8 new = 22 total
