# Feature Specification: Recover External Benchmark Quality

**Feature Branch**: `418-benchmark-quality-recovery`  
**Created**: 2026-03-19  
**Status**: Draft  
**Input**: User request to capture a constitution-aligned plan for improving external benchmark quality after the deterministic Grafana slice showed weak recall and low F1  
**Closes**: [GitHub Issue #192](https://github.com/oddessentials/odd-ai-reviewers/issues/192)

## Problem Statement

The external benchmark runner is now operationally stable, but the first trustworthy Grafana slice exposed a product-quality gap:

- precision: `0.4167`
- recall: `0.2273`
- f1: `0.2941`
- true positives: `5`
- false positives: `7`
- false negatives: `17`

The dominant failure mode is **under-detection**:

- `6/10` Grafana PRs produced zero candidates
- several remaining PRs found a real issue but over-reported adjacent concerns

This spec covers the most efficient, constitution-aligned path to recover benchmark quality without reintroducing non-deterministic CI gates or coupling quality work to the external benchmark infrastructure.

## Scope

This spec covers:

- converting the most important Grafana misses into deterministic regression assets
- improving recall on the identified zero-candidate and low-recall PR patterns
- tightening finding selection on the highest-value false-positive cases
- adding stable validation so future changes do not silently reintroduce the same misses

This spec does **not** cover:

- redesigning the external benchmark runner
- changing benchmark infrastructure thresholds
- introducing live API benchmark runs into merge-blocking CI
- broad architectural changes unrelated to the concrete misses in Issue #192

## User Scenarios & Testing

### User Story 1 - High-Value Grafana Misses Become Deterministic Regressions (Priority: P1)

As a maintainer, I want the most important external benchmark misses represented in deterministic regression fixtures, so that future work can improve quality without relying on repeated paid benchmark runs to detect regressions.

**Why this priority**: The runner is fixed. The next bottleneck is repeatable product-quality iteration.

**Independent Test**: Run the deterministic benchmark regression suite with no external API keys. The curated Grafana-derived fixtures must execute locally and in CI.

**Acceptance Scenarios**:

1. **Given** the Grafana slice artifacts from Issue #192, **When** the curated regression pack is generated, **Then** it includes representative zero-candidate misses and representative false-positive cases with explicit expected outcomes
2. **Given** no benchmark credentials, **When** the deterministic regression suite runs, **Then** all curated Grafana-derived cases execute without network access
3. **Given** a future change regresses one of the captured miss patterns, **When** the deterministic regression suite runs, **Then** it fails with a case-specific assertion identifying the missed pattern

---

### User Story 2 - Recall Improves on the Dominant Zero-Candidate Patterns (Priority: P1)

As a maintainer, I want the router to surface real findings for the dominant zero-candidate Grafana cases, so that benchmark recall rises for the highest-impact misses first.

**Why this priority**: Recall is the primary benchmark weakness. Six PRs contributed no candidates at all.

**Independent Test**: For each curated zero-candidate regression fixture, run the relevant detection and post-processing path and verify that at least one expected finding survives.

**Acceptance Scenarios**:

1. **Given** a zero-candidate regression fixture covering a concrete bug class, **When** the review pipeline runs deterministically against it, **Then** at least one expected finding is emitted with the correct file and a materially matching message
2. **Given** multiple zero-candidate fixtures from different categories, **When** the targeted fixes are applied, **Then** they improve recall without reducing severity floors or bypassing structured findings
3. **Given** a case where the current system still cannot confidently detect the issue, **When** the fixture is reviewed, **Then** the system fails explicitly in the regression report rather than being silently omitted from the tracked set

---

### User Story 3 - Precision Tightens on Known Adjacent Over-Reporting (Priority: P2)

As a maintainer, I want the system to avoid adjacent or speculative findings on known Grafana cases, so that benchmark precision improves without suppressing genuine defects.

**Why this priority**: Precision is above threshold but fragile. Some PRs already produce a true positive plus several weak extras.

**Independent Test**: Run deterministic regressions for the known mixed-quality cases and verify that the intended finding remains while the previously observed weak extras do not survive.

**Acceptance Scenarios**:

1. **Given** a curated mixed-quality case, **When** the review pipeline runs, **Then** the known good finding remains present
2. **Given** the same case, **When** output is compared to the golden expectation, **Then** the previously identified adjacent false-positive themes are absent
3. **Given** a candidate suppression or prompt refinement intended to cut precision noise, **When** it would also hide the expected true positive, **Then** the change is rejected by the deterministic regression suite

---

### User Story 4 - External Benchmark Runs Stay Informative but Non-Blocking During Iteration (Priority: P2)

As a maintainer, I want live external benchmark runs to remain a validation tool rather than the only source of truth, so that quality work is fast, repeatable, and cost-aware.

**Why this priority**: The constitution requires deterministic merge gates and bounded resources.

**Independent Test**: CI and local deterministic tests pass without external keys; optional external benchmark reruns can be used to confirm aggregate score movement.

**Acceptance Scenarios**:

1. **Given** no benchmark API keys, **When** CI runs on a PR implementing this spec, **Then** all new benchmark-quality tests still execute
2. **Given** an optional paid external rerun, **When** maintainers execute the Grafana slice manually, **Then** the run serves as confirmation rather than the only regression signal
3. **Given** a future benchmark dataset change, **When** deterministic regressions are updated, **Then** quality assertions remain anchored to committed fixtures rather than a floating external baseline

## Requirements

### Functional Requirements

- **FR-001**: The system MUST create a committed deterministic regression pack derived from the Grafana slice in Issue #192. The pack MUST include, at minimum, fixtures representing:
  - at least 3 zero-candidate recall misses from the observed set
  - at least 2 mixed-quality precision cases from the observed set

- **FR-002**: Each curated regression case MUST include:
  - source PR identifier
  - minimal diff/context required to reproduce the miss
  - expected finding contract or expected suppression contract
  - rationale explaining why the case was selected

- **FR-003**: The deterministic regression pack MUST run without network access or external API keys in local and CI environments.

- **FR-004**: The implementation MUST prioritize recall fixes for the dominant zero-candidate cases before broad precision tuning. The initial target set MUST be taken from Issue #192 and explicitly named in project documentation or test metadata.

- **FR-005**: Every recall fix MUST preserve the structured findings contract:
  - findings remain centrally normalized
  - no raw free-form agent output becomes first-class
  - no severity floors are weakened to force benchmark passing

- **FR-006**: Every precision fix MUST be evidence-gated. The implementation MUST NOT add broad heuristic suppressions that would hide genuine defects across unrelated repos.

- **FR-007**: The implementation MUST produce a deterministic local/CI test command that validates the curated benchmark-quality regressions without requiring a live external benchmark run.

- **FR-008**: Documentation for benchmark quality work MUST distinguish clearly between:
  - deterministic regression fixtures used for merge safety
  - optional live external benchmark reruns used for aggregate validation

- **FR-009**: The first implementation pass MUST define explicit exit criteria for “quality recovery progress” using deterministic artifacts, not only aggregate live-benchmark scores.

- **FR-010**: The implementation MUST follow this fix ordering for each curated case:
  1. add the deterministic regression test
  2. reproduce the failing behavior
  3. implement the narrowest responsible fix
  4. verify no regression in adjacent curated cases

- **FR-011**: The implementation MUST NOT loosen benchmark thresholds, severity semantics, or expected finding contracts to manufacture apparent recall improvement.

### Testing Requirements

- **FR-012**: The repository MUST add deterministic tests covering each curated regression case introduced by this spec.
- **FR-013**: The repository MUST add replayable, network-free tests proving at least one zero-candidate Grafana-derived case now emits the expected finding.
- **FR-014**: The repository MUST add replayable, network-free tests proving recall improvements do not introduce new false positives in adjacent curated cases.
- **FR-015**: The repository MUST add replayable, network-free tests proving at least one mixed-quality Grafana-derived case keeps the expected true positive while dropping the known weak extra.
- **FR-016**: All existing CI quality gates and test thresholds MUST remain in force.

## Key Entities

- **External Benchmark Slice**: A filtered live benchmark run against the upstream dataset, used to measure aggregate precision/recall/F1 and identify misses worth turning into deterministic regressions.
- **Curated Benchmark Regression Case**: A committed, deterministic fixture derived from an external benchmark miss or false positive, with explicit expected outputs.
- **Recall Recovery Case**: A curated case where the previous system emitted zero findings or missed the key issue entirely.
- **Precision Recovery Case**: A curated case where the system emitted the right core finding plus one or more weak adjacent findings.

## Success Criteria

- **SC-001**: The curated regression pack is committed and runnable without external credentials.
- **SC-002**: At least 3 previously zero-candidate Grafana-derived cases are covered by deterministic regression tests.
- **SC-003**: At least 2 mixed-quality Grafana-derived cases are covered by deterministic regression tests.
- **SC-004**: The first implementation pass demonstrates deterministic improvement on at least 2 recall cases and at least 1 precision case.
- **SC-005**: No change introduced under this spec weakens the constitution’s deterministic, security, or provider-neutral constraints.
- **SC-006**: Documentation clearly explains how deterministic regressions and optional live external reruns work together.
- **SC-007**: Every curated fix lands with regression-first ordering preserved and verified in the PR narrative or implementation history.
- **SC-008**: Live external benchmark reruns are used only as post-fix validation, not as the primary mechanism for discovering whether a change worked.

## Constitution Alignment

| Principle                        | Status | Evidence                                                                                                         |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | This work changes detection/validation logic and tests only. No new posting path is introduced.                  |
| II. Structured Findings Contract | PASS   | Regression cases are asserted against structured findings, not raw model prose.                                  |
| III. Provider-Neutral Core       | PASS   | The recovery plan focuses on core pipeline behavior and deterministic fixtures, not provider-specific branching. |
| IV. Security-First Design        | PASS   | Precision fixes are required to be evidence-gated and must not use broad unsafe suppressions.                    |
| V. Deterministic Outputs         | PASS   | The core deliverable is a deterministic regression pack to reduce reliance on live paid runs.                    |
| VI. Bounded Resources            | PASS   | Merge safety shifts toward replayable fixtures, reducing repeated live benchmark cost.                           |
| VII. Environment Discipline      | PASS   | No dynamic runtime bootstrap is introduced for merge gates; deterministic tests remain local/CI safe.            |
| VIII. Explicit Non-Goals         | PASS   | This does not turn the project into a benchmark service or external orchestrator.                                |

## Out of Scope

- expanding the live external benchmark to new datasets before the Grafana slice is addressed
- replacing the current benchmark runner again
- changing merge policy to require live external benchmark success
- large prompt overhauls not tied to the curated miss set
