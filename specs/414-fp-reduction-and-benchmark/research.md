# Research: False-Positive Reduction & Benchmark Integration

**Date**: 2026-03-12
**Feature**: 414-fp-reduction-and-benchmark

## R1: Prompt File Modification Points

### Decision: Add conventions 7-12 after existing convention 6 in Framework & Language Conventions section

**Rationale**: All 4 prompt files share identical structure for conventions 1-6. New conventions 7-12 follow the same pattern (numbered, bold title, explanation, Pattern/Recognition/Why not to flag sub-items where appropriate).

**Insertion points** (after last convention, before Active Context Directives):

- `config/prompts/semantic_review.md` — after line 94 (end of convention 6)
- `config/prompts/pr_agent_review.md` — after line 86 (end of convention 6)
- `config/prompts/opencode_system.md` — after line 86 (end of convention 6)
- `config/prompts/architecture_review.md` — after line 49 (end of convention 6)

### Decision: architecture_review.md needs 2 new sections added

**Rationale**: This file (58 lines) is missing Data-flow Verification and Active Context Directives sections that exist in the other 3 prompts. These must be added to achieve convention parity.

**Alternatives considered**:

- Only add conventions 7-12 → Rejected: ACDs are part of Gap 3 and are critical for Pattern C FPs
- Create a shared include mechanism → Rejected: Over-engineering; current duplication is intentional for per-agent customization

### Decision: Inline agent fallbacks need convention summary updates

**Rationale**: Three agent files contain inline prompt fallbacks used when the markdown file fails to load. These should include a condensed reference to new conventions to prevent regression when fallbacks activate.

**Files**: `ai_semantic_review.ts:216-242`, `pr_agent.ts:204-217`, `opencode.ts:86-107`

## R2: Framework Pattern Filter Expansion

### Decision: Insert T022 and T023 before `] as const` on line 203

**Rationale**: The FRAMEWORK_MATCHERS array is a closed table. New matchers go at the end, before the array closing. This maintains the T019→T020→T021→T022→T023 ordering.

**Code changes**:

1. Update comment on line 8: "3 matchers" → "5 matchers"
2. Update comment on line 122: "Only these 3 matchers" → "Only these 5 matchers"
3. Insert T022 (react-query-dedup) matcher before line 203
4. Insert T023 (promise-allsettled-order) matcher before line 203

**T022 evidence validator**: Check for `@tanstack/react-query`, `swr`, or `@apollo/client` import in file diff section using `extractFileDiffSection()` (existing helper, line 57).
T022 requires 3-point evidence per feedback tightening: (1) query library import, (2) query hook call near finding line (±10 lines), (3) exclude raw HTTP findings (message mentions `fetch()` or `api call`).

**T023 evidence validator**: Check for `Promise.allSettled(` in file diff section using `extractFileDiffSection()`.
T023 requires 2-point evidence per feedback tightening: (1) `Promise.allSettled(` near finding line (±10 lines, not file-wide), (2) result iteration pattern near finding.
T023 message pattern tightened to: `/allSettled.*(?:order|sequence)|(?:order|sequence).*allSettled|allSettled.*results.*not.*(?:match|correspond|align)/i`.

**Alternatives considered**:

- Add matchers as a plugin system → Rejected: Violates closed-table invariant; spec amendment is the correct mechanism
- Only use prompt conventions without filter backup → Rejected: Prompt-only approach is probabilistic; Gap 4 research showed LLM ignores conventions 2-3 in some cases

## R3: PR Intent Suppression Upgrade

### Decision: Rename `logPRIntentContradictions` → `filterPRIntentContradictions`, return suppressed indices

**Rationale**: The function at `finding-validator.ts:123-159` currently logs warnings but returns void. Upgrading to return suppressed finding indices allows integration into `validateFindingsSemantics()` as a fourth filter pass.

**Implementation**:

1. Change return type from `void` to `Finding[]` (filtered findings)
2. Add severity gate: `if (finding.severity !== 'info') continue` — never suppress warning/error/critical
3. Move call site from after validation (line 261-262) into the validation flow
4. Log all suppressions for auditability (preserve existing console.log)
5. Add `filterType: 'pr_intent_contradiction'` to `FindingValidationResult`

**Constraints**:

- Info severity only (FR-113)
- Verb+subject match AND contradiction verb present
- Existing verb pattern: `/\b(add|fix|remove|rename|update|refactor)\s+(.+)/i` (line 111)
- Existing contradiction map (lines 137-144) is sufficient

Per feedback review: contradiction map tightened to exact pairs (add↔remove/delete, remove↔add/missing, rename↔revert, refactor↔revert/undo). Open-ended verbs like 'break', 'keep', 'preserve', 'downgrade' removed.
Added closed category gate: only `documentation`, `style`, `cosmetic`, `refactoring` categories eligible.
Added subject match requirement: finding must reference same file OR code construct.
Added kill switch: `prIntentSuppression: boolean` config flag (default: true).

**Alternatives considered**:

- Severity downgrade instead of suppression → Rejected by spec: FR-112 specifies "active suppression"
- Suppress all severities → Rejected: FR-113 explicitly restricts to info-only

## R4: Active Context Directive Strengthening

### Decision: Upgrade from "CHECK" to "MANDATORY" with hard constraints

**Rationale**: Gap 3 analysis showed ACDs are too passive. The LLM reads project rules but still generates contradicting findings. Changing from advisory to mandatory language with specific anti-patterns addresses 7 Pattern C FPs.

**Changes to ACD section** (identical across all 4 prompts):

1. "CHECK Project Rules" → "MANDATORY: Check Project Rules" with HARD CONSTRAINT prefix
2. "CHECK PR Description" → "MANDATORY: Check PR Description" with explicit prohibitions
3. Add new item 3: "Design Intent Awareness" covering quota systems, cache key discrimination, singleton guarantees

**Risk mitigation**: Hard constraints only apply when project rules are documented. Security findings with clear user-input data flow bypass the constraint (the "unless demonstrably user-controlled" qualifier).

## R5: Data-flow Verification Additions

### Decision: Add binary response body and Zod-validated input rules

**Rationale**: Gap 7 identified that `res.send(buffer)` with `audio/*` content-type is flagged as XSS. Binary responses are not XSS vectors. Similarly, Zod `.parse()` output is type-safe.

**Insertion point**: After existing data-flow rules in "Security sinks require data-flow verification" section.

**New rules**:

- Binary response bodies (audio, images, ArrayBuffer, Buffer) with non-HTML content-type are NOT XSS vectors
- Zod-validated inputs after `.parse()` are type-safe — do not flag unless schema is permissive

## R6: Benchmark Adapter Architecture

### Decision: TypeScript adapter script using `ai-review local --format json`

**Rationale**: The CLI already outputs structured JSON via `generateJsonOutput()` in `terminal.ts:945-976`. The adapter clones benchmark PRs, runs the CLI, and transforms output to benchmark candidate format.

**Output mapping**:

- `finding.message` → `candidate.text` (with suggestion appended when present)
- `finding.file` → `candidate.path`
- `finding.line` → `candidate.line`
- `source` field set to `"extracted"`

**CLI integration**: `ai-review local --path <repo> --base <baseRef> --head <headRef> --format json`

**Alternatives considered**:

- Python adapter → Rejected: project is TypeScript; using ts-node/tsx keeps toolchain consistent
- GitHub bot path only → Rejected: need local iteration capability for development

## R7: Test Infrastructure

### Decision: Add scenarios to existing regression-suite.json, use snapshot replay for prompt-dependent patterns

**Rationale**: The benchmark test infrastructure (`false-positive-benchmark.test.ts`) already supports:

- `BenchmarkScenario` type with `pattern`, `category`, `truePositive`, `snapshot` fields
- Snapshot replay with SHA-256 hash validation against prompt source files
- Tiered execution: deterministic (Pattern A, E) vs snapshot replay (B, C, D, F)
- Scoring via `scoreScenario()` and `computeReport()`

**New scenarios needed**:

- Gap 1 (Pattern F): 2-3 existence verification scenarios (snapshot replay)
- Gap 2 (Pattern E): 2-3 over-engineering scenarios (snapshot replay)
- Gap 3 (Pattern C): 2-3 project context scenarios (snapshot replay)
- Gap 4 (Pattern B): 2 framework filter scenarios (deterministic — T022, T023)
- Gap 5 (Pattern D): 1-2 PR intent suppression scenarios (deterministic)
- Gap 6 (Pattern A): 1 developer tooling scenario (deterministic or snapshot)
- Gap 7 (Pattern A): 1 binary response scenario (deterministic or snapshot)

**Total**: ~13-18 new scenarios added to regression-suite.json

**Snapshot generation**: Record LLM responses for new prompt-dependent scenarios after conventions 7-12 are in place. Hash will be computed from updated prompt sources.
