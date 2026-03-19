# Implementation Plan: Recover External Benchmark Quality

**Branch**: `418-benchmark-quality-recovery` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/418-benchmark-quality-recovery/spec.md`

## Summary

Recover benchmark quality efficiently by converting the highest-value Grafana misses from Issue #192 into deterministic regression cases, then addressing recall before precision. This plan keeps merge safety deterministic, preserves security boundaries, and uses optional live external reruns only as confirmation.

## Why This Plan Is Best

This is the best plan because it attacks the actual bottleneck in the correct order:

1. The external runner is already operationally stable, so more infrastructure work is low leverage.
2. The benchmark weakness is now known and concrete: six zero-candidate misses plus a smaller set of adjacent false positives.
3. Live external runs are too expensive and too variable to be the primary development loop.
4. Deterministic curated regressions let us iterate quickly, keep CI constitutional, and still validate improvements later with paid reruns.

In short: convert expensive signal into cheap signal first, then improve the product against that signal.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22+  
**Testing**: Vitest + existing router unit/integration suites  
**Primary Constraints**:

- merge-blocking validation must remain deterministic
- security suppressions must remain evidence-gated
- no weakening of structured findings or severity semantics
- external benchmark reruns remain optional confirmation, not the sole test oracle

## Constitution Check

| Principle                        | Status | Design Response                                                                                        |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | PASS   | No posting-path changes are planned.                                                                   |
| II. Structured Findings Contract | PASS   | All regression assertions target structured findings and routed outputs.                               |
| III. Provider-Neutral Core       | PASS   | Changes focus on shared prompt/post-processing/core review behavior, not provider-specific code paths. |
| IV. Security-First Design        | PASS   | Precision fixes must be narrowly evidence-based; no blanket suppressions.                              |
| V. Deterministic Outputs         | PASS   | Curated replay fixtures become the primary regression mechanism.                                       |
| VI. Bounded Resources            | PASS   | Day-to-day iteration moves off paid live benchmark runs.                                               |
| VII. Environment Discipline      | PASS   | CI remains replayable and pinned; no new runtime bootstrap pattern is introduced.                      |
| VIII. Explicit Non-Goals         | PASS   | No scope creep into benchmark-platform ownership or service orchestration.                             |

## Workstreams

### Phase 0 - Baseline Capture

Objective: freeze the current quality signal into actionable deterministic inputs.

- catalog the Grafana slice misses and mixed-quality wins from Issue #192
- select the first curated case set:
  - at least 3 zero-candidate recall misses
  - at least 2 mixed-quality precision cases
- define expected output contracts for each case

Deliverable:

- a committed case manifest or equivalent documentation mapping curated cases to source PRs and expected outcomes

### Phase 1 - Deterministic Regression Harness

Objective: make the curated benchmark-quality cases runnable in CI without external services.

- add committed fixtures for each curated case
- add deterministic tests that assert:
  - expected finding presence for recall cases
  - expected true-positive retention plus adjacent-noise removal for precision cases
  - no new adjacent false positives are introduced by recall-oriented fixes
- document the local command used to run this suite

Deliverable:

- a replayable benchmark-quality regression suite with no network dependency

### Phase 2 - Recall Recovery

Objective: recover the highest-impact misses first.

- analyze the three highest-value zero-candidate cases for common causes
- implement the narrowest fixes that surface the missing issues
- prefer improvements in:
  - prompt guidance scoped to observed miss classes
  - context loading or diff interpretation gaps
  - deterministic post-processing that currently discards valid findings
- do not loosen severity or broad-match speculative findings just to pass cases

Deliverable:

- deterministic tests proving at least two curated recall cases now emit expected findings

### Phase 3 - Precision Recovery

Objective: reduce adjacent over-reporting without regressing the recovered recall cases.

- target the mixed-quality cases from Issue #192
- remove weak extras only where evidence supports the suppression/refinement
- ensure each precision fix is cross-checked against the retained true positive

Deliverable:

- deterministic tests proving at least one curated precision case retains the intended finding while dropping the known weak extra

### Phase 4 - Live Validation

Objective: confirm aggregate movement after deterministic improvements are in place.

- rerun the Grafana external benchmark slice manually
- compare updated precision/recall/F1 to the baseline captured in Issue #192
- treat any live divergence as follow-up input, not a replacement for deterministic regressions

Deliverable:

- documented before/after benchmark slice results linked from the issue or follow-up PR

## Implementation Strategy

### Case Selection Heuristic

Prioritize cases using this order:

1. zero-candidate cases that likely represent broadly applicable miss classes
2. mixed-quality cases with one clear true positive and a small, understandable false-positive set
3. cases with minimal fixture complexity and strong reproducibility

This keeps the first pass efficient and reduces the chance of overfitting to one repo.

### Fix Ordering

Apply changes in this order:

1. add regression case
2. reproduce failing behavior deterministically
3. implement narrow fix
4. prove no regression in adjacent curated cases
5. only then schedule optional live rerun

This ensures every fix creates durable leverage rather than one-off benchmark movement.

### Guardrails

The implementation must preserve these constraints throughout:

- do not loosen severity semantics to manufacture recall gains
- do not weaken benchmark thresholds to declare success
- do not accept a precision fix unless the known true positive is still asserted
- do not rely on live external reruns as the primary development loop

### Validation Strategy

Required on every implementation PR:

- focused deterministic benchmark-quality tests
- relevant existing router unit/integration suites
- docs update if commands, expectations, or benchmark workflow semantics change
- clear evidence that regression-first ordering was followed for each curated case

Recommended before merge of a meaningful batch:

- one manual Grafana slice rerun via the external benchmark orchestrator

## Risks and Mitigations

- **Risk**: Overfitting fixes to a tiny external slice  
  **Mitigation**: choose cases that represent classes of misses, not one-off phrasings

- **Risk**: Improving recall by allowing weaker speculative findings  
  **Mitigation**: preserve severity semantics and require structured expected contracts

- **Risk**: Precision fixes accidentally hide genuine defects  
  **Mitigation**: every precision case must also assert preservation of the known true positive

- **Risk**: Merge safety drifts back toward live benchmark dependence  
  **Mitigation**: keep all new required checks deterministic and replay-only

## Proposed Deliverables

- `specs/418-benchmark-quality-recovery/spec.md`
- deterministic curated benchmark-quality fixtures
- deterministic tests for recall and precision recovery cases
- updated benchmark quality documentation and issue tracking

## Exit Criteria

The first implementation pass is ready for review when:

- the curated regression suite is committed and runnable without external keys
- at least 2 recall cases and 1 precision case are improved deterministically
- all existing quality gates still pass
- the issue and docs clearly separate deterministic merge safety from optional live benchmark confirmation
