# Feature Specification: False-Positive Reduction & Benchmark Integration

**Feature Branch**: `414-fp-reduction-and-benchmark`
**Created**: 2026-03-12
**Status**: Approved (feedback reviewed, plan and tasks complete)
**Input**: Systematic investigation of 42 documented false positives across GitHub issues #158, #159, #160, #161, plus integration with the withmartian code-review-benchmark for objective quality measurement.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Reviewer Receives Fewer False Positives (Priority: P1)

A developer using odd-ai-reviewers on their pull request receives only findings that identify real issues. The tool no longer flags hardcoded constants as security risks, no longer suggests externalizing co-located values, no longer claims code constructs that don't exist in the diff, and no longer contradicts the PR's stated purpose. The developer trusts the tool's output because every finding is actionable.

**Why this priority**: False positives erode user trust and cause developers to ignore real findings. Reducing the documented 42 FPs across 4 real-world PRs from 78.6% unaddressed to under 15% is the highest-impact improvement.

**Independent Test**: Run the tool against the same PRs that generated issues #158-#161 (or equivalent fixture scenarios) and verify that previously false-positive findings are no longer produced while genuine security, logic, and quality issues are still detected.

**Acceptance Scenarios**:

1. **Given** a PR containing a `RegExp()` call where the pattern argument comes from a hardcoded constant array, **When** the tool reviews the PR, **Then** no ReDoS finding is reported for that pattern.
2. **Given** a PR containing `path.join(__dirname, "fixtures")` in a test file, **When** the tool reviews the PR, **Then** no path traversal finding is reported.
3. **Given** a PR where the description states "broaden Enter key handler to exclude trigger and panel focus," **When** the tool reviews the PR, **Then** no finding flags that exact behavior change as suspicious.
4. **Given** a PR where Express error middleware uses a 4-parameter signature with `_next` unused, **When** the tool reviews the PR, **Then** no "unused parameter" finding is reported.
5. **Given** a PR where code documentation already exists at the flagged line, **When** the tool reviews the PR, **Then** no "missing documentation" finding is reported.
6. **Given** a PR that sends a binary audio buffer via `res.send()` with `audio/*` content-type, **When** the tool reviews the PR, **Then** no XSS finding is reported.
7. **Given** a PR containing two `useQuery` calls sharing the same React Query cache key, **When** the tool reviews the PR, **Then** no "double-fetching" finding is reported.
8. **Given** a PR iterating `Promise.allSettled()` results sequentially, **When** the tool reviews the PR, **Then** no "results may not match input order" finding is reported.
9. **Given** a PR where CLAUDE.md mandates a single CSS file, **When** the tool reviews the PR, **Then** no "modularize CSS" finding is reported.
10. **Given** a PR where a TypeScript parameter is typed as a union `'fast' | 'reasoning'`, **When** the tool reviews the PR, **Then** no "add runtime type validation" finding is reported.

---

### User Story 2 — Genuine Issues Are Still Detected (Priority: P1)

While false positives are suppressed, the tool continues to detect real security vulnerabilities, logic errors, and quality issues. No true positive is lost due to the new filtering rules. The existing 19 true-positive benchmark scenarios (SQL injection, XSS, path traversal, SSRF, auth bypass) all continue to be detected.

**Why this priority**: Equal to P1 because suppressing false positives must not create false negatives. The system must maintain its detection capability.

**Independent Test**: Run the existing 19 true-positive benchmark scenarios and verify 100% detection. Run the full 4,068-test suite and verify no regressions.

**Acceptance Scenarios**:

1. **Given** code where `element.innerHTML = userInput` with `userInput` from `req.query`, **When** the tool reviews the code, **Then** an XSS finding is reported.
2. **Given** code where `db.query(userInput)` with unparameterized SQL, **When** the tool reviews the code, **Then** a SQL injection finding is reported.
3. **Given** code where `fs.readFileSync(req.params.path)` without path validation, **When** the tool reviews the code, **Then** a path traversal finding is reported.
4. **Given** the full regression test suite, **When** all tests are executed, **Then** all 4,068+ tests pass with zero failures.

---

### User Story 3 — Measurable Quality via External Benchmark (Priority: P2)

The project maintainer can measure the tool's code review quality objectively against an industry-standard benchmark. By running the withmartian code-review-benchmark, the maintainer obtains precision, recall, and F1 scores that can be tracked over releases and compared against other tools (CodeRabbit, GitHub Copilot, Greptile, etc.).

**Why this priority**: External benchmarking provides objective quality measurement that internal tests cannot — it validates the tool against real-world PRs from diverse projects and languages, judged by an independent LLM evaluator.

**Independent Test**: Fork the 50 benchmark PRs, let the tool review them, run the benchmark pipeline, and obtain a scored result with precision/recall/F1.

**Acceptance Scenarios**:

1. **Given** 50 forked benchmark PRs from Sentry, Grafana, Cal.com, Discourse, and Keycloak, **When** the tool reviews all 50 PRs, **Then** findings are produced for each PR in standard review comment format.
2. **Given** completed tool reviews on benchmark PRs, **When** the benchmark judge pipeline evaluates the findings against golden comments, **Then** a precision, recall, and F1 score is produced.
3. **Given** benchmark results from the current release, **When** compared to the previous release, **Then** any score regression beyond thresholds is flagged as a failure.

---

### User Story 4 — Developer Iteration via Local Benchmark (Priority: P3)

A contributor working on prompt improvements or filter changes can run the benchmark locally (or via Docker) to measure the impact of their changes before submitting a PR. The adapter script transforms the tool's JSON output into the benchmark's candidate format, and a regression check script validates scores against minimum thresholds.

**Why this priority**: Enables rapid iteration on quality improvements. Without local benchmarking, contributors must submit PRs and wait for CI to measure impact.

**Independent Test**: Run the adapter script locally against 2-3 benchmark PRs, verify output format matches the benchmark's expected candidate structure, and verify the regression check script correctly passes/fails based on thresholds.

**Acceptance Scenarios**:

1. **Given** a locally cloned benchmark PR, **When** the adapter script runs `ai-review local` and transforms the output, **Then** the result is a valid candidate JSON matching the benchmark schema.
2. **Given** benchmark results with precision=0.45, recall=0.35, **When** the regression check runs with thresholds precision≥0.40 and recall≥0.30, **Then** the check passes.
3. **Given** benchmark results with precision=0.30, **When** the regression check runs with threshold precision≥0.40, **Then** the check fails with a clear error message.

---

### User Story 5 — Automated Benchmark in CI (Priority: P3)

The CI pipeline runs the external benchmark on a weekly schedule and on manual trigger, uploading results as artifacts. If scores regress below thresholds, the workflow fails. This ensures quality is continuously monitored without manual intervention.

**Why this priority**: Automation prevents quality drift. Weekly runs catch regressions from prompt or filter changes before they reach production.

**Independent Test**: Trigger the CI workflow manually, verify it completes successfully, and verify results are uploaded as artifacts.

**Acceptance Scenarios**:

1. **Given** a manual trigger of the benchmark CI workflow, **When** the workflow completes, **Then** benchmark results are uploaded as artifacts with precision, recall, and F1 scores.
2. **Given** the weekly schedule trigger, **When** Sunday 2am UTC arrives, **Then** the benchmark workflow runs automatically.
3. **Given** benchmark scores above thresholds, **When** the regression check step runs, **Then** the workflow succeeds.
4. **Given** benchmark scores below thresholds, **When** the regression check step runs, **Then** the workflow fails with actionable diagnostics.

---

### Edge Cases

- What happens when a prompt convention and a framework filter matcher both apply to the same finding? The framework filter suppresses deterministically; the prompt convention provides defense-in-depth.
- What happens when PR intent suppression removes a finding that is actually a valid issue? Restricted to info severity only, so warning+ findings about the PR's own changes still surface.
- What happens when a benchmark PR's repository is unavailable or archived? The adapter script skips unavailable PRs and reports them in the summary.
- What happens when the LLM judge produces inconsistent scores across runs? Results are stored per judge model; multiple judge models can be used for cross-validation.
- What happens when a new prompt convention causes the LLM to under-report legitimate issues? The internal benchmark's TP preservation pool catches this — any drop below 100% triggers investigation.
- What happens when the framework filter's closed matcher table is expanded beyond 5 matchers? Each addition requires a spec amendment to maintain the closed-table invariant.

## Requirements _(mandatory)_

### Functional Requirements

#### Part 1: False-Positive Reduction

- **FR-101**: All four review prompt files MUST include Convention 7 (existence verification) requiring LLMs to verify that referenced code constructs exist in the diff before reporting findings.
- **FR-102**: All four review prompt files MUST include Convention 8 (TypeScript type-system trust) instructing LLMs not to suggest runtime validation for values already constrained by TypeScript's type system.
- **FR-103**: All four review prompt files MUST include Convention 9 (no business-decision findings) instructing LLMs not to flag budget, pricing, or resource allocation values as code quality issues.
- **FR-104**: All four review prompt files MUST include Convention 10 (no cosmetic refactoring) instructing LLMs not to suggest splitting orchestrator components, optimizing initialization code, adding comments to self-documenting code, or expanding minified assets.
- **FR-105**: All four review prompt files MUST include Convention 11 (developer tooling) instructing LLMs not to flag shell commands in .husky/, Makefiles, scripts/, or CI configuration as injection risks unless user-controlled input is present.
- **FR-106**: Active Context Directives in all four prompt files MUST be upgraded from advisory ("CHECK") to mandatory ("MANDATORY") with hard constraints including: not contradicting documented project decisions, not suggesting testability when no test framework exists, and checking project constitution before flagging hardcoded values.
- **FR-107**: Active Context Directives MUST include a "Design Intent Awareness" section covering: intentional resource consumption in quota systems, undefined fields as cache key discriminators, and singleton architecture guarantees.
- **FR-108**: The data-flow verification section in all four prompt files MUST include rules for binary response bodies (not XSS vectors when content-type is non-HTML) and Zod-validated inputs (type-safe after `.parse()`).
- **FR-109**: The framework pattern filter MUST be expanded from 3 to 5 matchers by adding T022 (React Query key deduplication) and T023 (Promise.allSettled order preservation).
- **FR-110**: Matcher T022 MUST suppress findings matching `/duplicate|double.?fetch|redundant.*query|multiple.*useQuery/i` when ALL of: (1) the file section contains an import from `@tanstack/react-query`, `swr`, or `@apollo/client`, (2) a query hook call (`useQuery`, `useSWR`, `useInfiniteQuery`, `useMutation`, `useSubscription`) appears within ±10 lines of the finding, and (3) the finding message does not reference raw HTTP calls (`fetch()`, `api call`, `http request`).
- **FR-111**: Matcher T023 MUST suppress findings matching `/allSettled.*(?:order|sequence)|(?:order|sequence).*allSettled|allSettled.*results.*not.*(?:match|correspond|align)/i` when ALL of: (1) `Promise.allSettled(` appears within ±10 lines of the finding (not just anywhere in the file section), and (2) the nearby code shows result iteration (`.forEach`, `.map(`, indexed access, or `for...of`).
- **FR-112**: The finding validator's PR intent contradiction detection MUST be upgraded from diagnostic-only logging to active suppression for info-severity findings whose message verb contradicts the PR description's stated intent.
- **FR-113**: PR intent suppression MUST be restricted to info-severity findings only. Warning, error, and critical findings MUST NOT be suppressed by this mechanism.
- **FR-114**: All four prompt files MUST include Convention 12 (React useRef pattern) instructing LLMs not to flag `useRef<T>(null)` with type assertions as unsafe.

#### Part 2: Benchmark Integration

- **FR-201**: A benchmark adapter script MUST transform the tool's JSON output into the withmartian benchmark candidate format (text, path, line, source fields).
- **FR-202**: The adapter MUST map findings as follows: `message` → `text` (with `suggestion` appended when present), `file` → `path`, `line` → `line`.
- **FR-203**: A benchmark regression check script MUST validate precision, recall, and F1 scores against configurable minimum thresholds and exit non-zero on regression.
- **FR-204**: A Docker configuration MUST be provided for reproducible benchmark runs, including Node.js 22, Python 3, uv package manager, GitHub CLI, and pnpm.
- **FR-205**: A CI workflow MUST run the benchmark on weekly schedule and manual trigger, uploading results as artifacts.
- **FR-206**: The CI workflow MUST include a regression guard step that fails the build if scores drop below defined thresholds.

#### Part 3: Testing & Regression Prevention

- **FR-301**: New test scenarios MUST be added to the false-positive benchmark regression suite for each of the 7 gaps (Gaps 1-7), covering the newly addressable FP patterns.
- **FR-302**: Framework pattern filter tests MUST cover matchers T022 and T023 with both suppression (evidence present) and pass-through (evidence absent) cases.
- **FR-303**: Finding validator tests MUST cover PR intent suppression for info-severity findings, and verify that warning+ findings are not suppressed.
- **FR-304**: All existing 4,068+ tests MUST continue to pass after changes.

### Key Entities

- **Finding**: A code review issue with severity, file, line, message, suggestion, and category. The unit of analysis for both FP suppression and TP preservation.
- **Framework Pattern Matcher**: A deterministic filter rule with message pattern (regex), evidence validator (function), and suppression reason. Part of the closed matcher table.
- **Prompt Convention**: A numbered instruction in the review prompt that guides LLM behavior. Replicated across all 4 prompt files for consistency.
- **Active Context Directive**: A pre-analysis instruction that tells the LLM to check project rules, PR description, or design intent before generating findings.
- **Benchmark Candidate**: A tool finding transformed into the withmartian format (text, path, line, source) for judge evaluation.
- **Golden Comment**: A human-curated ground-truth issue from the benchmark dataset, with description and severity.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-101**: The internal false-positive benchmark achieves ≥90% FP suppression rate across all patterns (A through G), maintaining or improving from the current 100% baseline on existing scenarios.
- **SC-102**: The internal true-positive benchmark preserves 100% recall — all 19 TP scenarios continue to be detected with zero false negatives.
- **SC-103**: The tool produces zero false positives when evaluated against the 42 documented FPs from issues #158-#161 that have deterministic or prompt-level fixes (29-31 of 42).
- **SC-104**: All 4,068+ existing automated tests pass with zero regressions after all changes.
- **SC-105**: The tool achieves a measurable F1 score ≥0.35 on the withmartian code-review-benchmark offline evaluation (50 PRs across 5 projects).
- **SC-106**: Benchmark precision ≥0.40, indicating that at least 40% of the tool's findings match real issues identified by human reviewers.
- **SC-107**: Benchmark recall ≥0.30, indicating the tool finds at least 30% of issues that human reviewers identified.
- **SC-108**: The framework pattern filter table is expanded from 3 to 5 matchers with no false suppressions on the existing test suite.
- **SC-109**: Contributors can run the benchmark locally in under 30 minutes for a single project (10 PRs) using the adapter script.
- **SC-110**: The CI benchmark workflow completes within 2 hours and produces uploaded artifacts with scores.

## Assumptions

- The withmartian benchmark's offline dataset (50 PRs) remains stable and accessible during integration. If PRs are removed or modified, the adapter script will need to be updated.
- The LLM judge's semantic matching produces consistent enough results for tracking scores over time. Cross-model variance is expected but tracked per judge model.
- Prompt convention changes are probabilistic — they reduce but cannot eliminate LLM hallucinations. The 29-31 addressable FPs represent the expected upper bound; some FPs may persist due to inherent LLM limitations.
- The framework filter's closed-table expansion from 3 to 5 matchers is the spec amendment itself. Future matchers beyond T023 require a new spec amendment.
- PR intent suppression restricted to info severity provides sufficient safety margin against TP regression. If warning-severity FPs from Pattern D emerge in the future, a separate analysis will be needed.
- Multi-language coverage gaps (Python, Go, Ruby, Java) will limit recall on the external benchmark. The initial F1 target of ≥0.35 accounts for this limitation.
- Docker Desktop availability is assumed for local benchmark runs. Contributors without Docker can use the adapter script directly with a local Python/uv installation.

## Scope Boundaries

### In Scope

- Prompt conventions 7-12 across all 4 review prompt files
- Strengthened Active Context Directives with mandatory constraints
- Framework pattern filter expansion (T022, T023)
- PR intent suppression upgrade (info severity only)
- Benchmark adapter script and regression check
- Docker configuration for benchmark runs
- CI workflow for automated benchmarking
- New test scenarios for Gaps 1-7

### Out of Scope

- Cross-function taint analysis (architectural change, deferred to a future feature)
- Multi-language agent support for Python, Go, Ruby, Java (separate feature)
- Online benchmark integration (requires GitHub App deployment, future phase)
- Leaderboard submission process (manual, after initial scores are validated)
- Changes to the safe-source detector or vulnerability detector code (existing mitigations are sufficient for Pattern A)
