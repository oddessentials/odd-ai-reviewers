# Feature Specification: False Positive Deep Fixes & Benchmark Integration

**Feature Branch**: `410-false-positive-deep-fixes`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Reduce false positives in AI code review via safe-source taint analysis, context enrichment, post-processing validation, framework convention prompts, and benchmark harness integration. Addresses 43 documented false positives from issues #158-161. Builds on completed 409 prompt hardening."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Safe Source Recognition Eliminates Pattern-Matching False Positives (Priority: P1)

A developer submits a pull request containing code that uses common safe patterns: constructing a regular expression from a hardcoded constant array, joining file paths with the built-in directory reference, or setting HTML content from a function that returns hardcoded strings. The AI code review system recognizes these as safe (no user-controlled data flows into the dangerous operation) and does NOT produce a security finding. When a genuine vulnerability exists — user input flowing into the same operations — the system still detects and reports it.

**Why this priority**: Pattern A (syntax-matching without data-flow verification) accounts for 28% of all documented false positives (12 of 43). It is the single largest source of false flags and the most damaging to developer trust, because it flags obviously safe code that any human reviewer would skip.

**Independent Test**: Run the review system against a test file containing `new RegExp(HARDCODED_ARRAY[i])`, `path.join(__dirname, 'fixtures', f)`, and `el.innerHTML = '<p>Loading</p>'`. Zero security findings should be produced. Then run against a file with `el.innerHTML = req.query.content` and verify a finding IS produced.

**Acceptance Scenarios**:

1. **Given** a file with `new RegExp(HEDGE_PHRASES[i])` where `HEDGE_PHRASES` is a module-scope constant array of literal strings, **When** the review system analyzes it, **Then** no injection or ReDoS finding is emitted.
2. **Given** a test file with `path.join(__dirname, 'fixtures', filename)` where `filename` comes from reading a local directory listing, **When** the review system analyzes it, **Then** no path-traversal finding is emitted.
3. **Given** a file with `container.innerHTML = buildLegendHTML()` where the function returns HTML composed exclusively from hardcoded constant arrays, **When** the review system analyzes it, **Then** no XSS finding is emitted.
4. **Given** a file with `element.innerHTML = req.query.content` where user input flows directly into the DOM sink, **When** the review system analyzes it, **Then** an XSS finding IS produced (true positive preserved).
5. **Given** a developer-side git hook script piping a local command to a text filter, **When** the review system analyzes it, **Then** no shell injection finding is emitted.

---

### User Story 2 - Enriched Context Prevents Rule-Contradicting Findings (Priority: P2)

A project maintainer has documented architectural decisions in the project's configuration file (e.g., "use a single CSS file, no modularization") and opens a PR whose description clearly states the purpose of the change. The AI code review system reads the project rules and PR description before generating findings, and does NOT produce findings that contradict documented project decisions or that flag the stated purpose of the PR as suspicious.

**Why this priority**: Patterns C (suggesting externalization against project rules, 9%) and D (not reading PR/project context, 12%) together account for 21% of false positives. These are particularly frustrating because they make the reviewer appear to not understand the project it's reviewing — eroding trust in the tool's fundamental competence.

**Independent Test**: Configure a review against a repository whose project rules mandate "Plain CSS in a single file." Submit a large CSS file for review. Verify no "split this CSS file" finding appears. Then submit a PR whose description explains a specific logic change, and verify the system does not flag that exact change as suspicious.

**Acceptance Scenarios**:

1. **Given** a project with rules stating "Plain CSS in `src/styles.css`. No CSS-in-JS, no preprocessors", **When** a large `styles.css` file is reviewed, **Then** no finding suggesting CSS modularization is produced.
2. **Given** a PR with title and description explaining "Fix Enter key handler to exclude trigger and panel focus", **When** the Enter key handler logic change is reviewed, **Then** no finding flagging the intentional change as suspicious is produced.
3. **Given** a project constitution documenting a specific constant value as the canonical determinism seed, **When** that constant appears in reviewed code, **Then** no "undocumented magic number" finding is produced.
4. **Given** a repository with no project rules file, **When** a review runs, **Then** the system operates normally without errors (graceful degradation).

---

### User Story 3 - Post-Processing Filters Self-Contradicting Findings (Priority: P2)

Before findings are posted to a pull request, the system validates each finding for internal consistency. Findings that cite non-existent line numbers, reference code constructs that don't exist at the cited location, or contain self-dismissing language ("no action required", "acceptable as-is") are filtered out and never shown to the developer. Filtered findings are logged for diagnostic purposes.

**Why this priority**: Pattern E (self-contradicting or zero-impact findings, 9%) causes the most visible embarrassment — citing wrong line numbers or flagging an issue then immediately dismissing it makes the reviewer appear broken, even if the overall review is otherwise reasonable.

**Independent Test**: Submit a set of findings where some cite invalid line numbers and some contain self-dismissing language. Verify the invalid ones are filtered out while valid findings pass through.

**Acceptance Scenarios**:

1. **Given** a finding claiming a specific code construct exists at line 73, **When** the system validates against the actual diff content and that construct does not exist at line 73, **Then** the finding is filtered before posting.
2. **Given** a finding with the message "Minor inefficiency in renderInline. No action required; acceptable as-is", **When** post-processing runs, **Then** the finding is filtered (self-dismissing language detected).
3. **Given** a finding citing line 504 which exists in the diff with matching content, **When** post-processing validates it, **Then** the finding passes validation and is posted.
4. **Given** a set of 10 findings where 3 are invalid, **When** post-processing runs, **Then** the 7 valid findings are posted and the 3 filtered findings are logged with their filter reasons.

---

### User Story 4 - Framework Convention Awareness Prevents Language-Level False Positives (Priority: P2)

A developer uses standard framework patterns: Express error middleware with its required 4-parameter signature, React Query with identical query keys in two locations, `Promise.allSettled` with ordered iteration, or TypeScript's `_prefix` convention for intentionally unused parameters. The review system understands these conventions and does NOT suggest removing required parameters, flag standard deduplication as double-fetching, or claim results may be out of order.

**Why this priority**: Pattern B (ignoring language/framework guarantees, 12%) erodes trust by demonstrating ignorance of the target language's type system and common framework conventions — the core competency area developers expect from a code reviewer.

**Independent Test**: Submit code with Express error middleware `(err, req, res, _next)` and verify no "unused parameter" finding. Submit code with two `useQuery` calls sharing the same key and verify no "double-fetching" finding.

**Acceptance Scenarios**:

1. **Given** an Express error handler function with signature `(err, req, res, _next)`, **When** reviewed, **Then** no "unused parameter" finding is emitted for `_next`.
2. **Given** two query hook calls with identical query keys in the same component, **When** reviewed, **Then** no "double-fetching" or "duplicate query" finding is emitted.
3. **Given** code iterating `Promise.allSettled` results in input order, **When** reviewed, **Then** no finding about "resolution order" or "results may not match input order" is emitted.
4. **Given** a value constrained by a strict union type with a default via `??` operator, **When** reviewed, **Then** no "add runtime validation" finding is emitted.

---

### User Story 5 - Benchmark Harness Measures Review Quality Objectively (Priority: P3)

The project maintainer can run a benchmark command that evaluates the review system's accuracy using a regression test suite of 43 documented false positives and (optionally) external benchmark scenarios. The harness reports precision, recall, F1 score, and false-positive rate, enabling data-driven quality tracking across releases.

**Why this priority**: Without objective measurement, there is no way to verify that improvements actually work or to detect regressions when other changes are made. This is the foundation for continuous quality improvement.

**Independent Test**: Run the benchmark command against the current codebase and verify it produces a JSON report with precision, recall, F1, and false-positive rate metrics.

**Acceptance Scenarios**:

1. **Given** the 43 false-positive regression fixtures, **When** the regression suite runs, **Then** at most 15% of fixtures produce a false positive (improvement from 100% baseline).
2. **Given** the 2 documented true-positive cases, **When** the regression suite runs, **Then** both true positives are still detected.
3. **Given** any benchmark scenario set, **When** the harness adapter runs, **Then** a JSON report is produced containing precision, recall, F1, and false-positive rate metrics.

---

### Edge Cases

- What happens when the project rules file is absent from the target repository? The system operates normally with no project-rule-based suppression; no errors occur.
- What happens when the PR description is empty? No context-based suppression is applied; all findings proceed through normal validation.
- What happens when a finding references a file not present in the diff (cross-file concern)? Line validation is skipped for that finding, but self-contradiction checks still apply.
- What happens when the combined project rules and diff content exceed the review system's processing limits? Project rules are truncated first (preserving the diff), with a note appended indicating truncation occurred.
- What happens when a data source is borderline (e.g., an environment variable read at startup and used later)? The finding is reported at the lowest severity level with an explicit uncertainty qualifier.
- What happens when a benchmark scenario times out? That scenario is scored as 0 precision and 0 recall.
- What happens when a finding is on a borderline between safe and unsafe (e.g., `innerHTML = sanitize(userInput)`)? The finding is still reported but at reduced severity with a note about the sanitization.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The review system MUST recognize module-scope constant declarations with literal initializers (strings, numbers, arrays of literals) as safe data sources that cannot carry user-controlled taint.
- **FR-002**: The review system MUST recognize built-in directory references (`__dirname`, `__filename`, `import.meta.dirname`, `import.meta.url`) as safe data sources.
- **FR-003**: The review system MUST recognize local directory listing return values as safe when the directory argument is a constant string or a built-in-directory-relative path.
- **FR-004**: The review system MUST NOT flag regular expression construction when the pattern argument can be traced to a constant array of literal strings.
- **FR-005**: The review system MUST downgrade severity of findings in test files (files matching common test file naming patterns) by one level.
- **FR-006**: The review system MUST accept a PR description (title and body) as input context and make it available to review agents.
- **FR-007**: The review system MUST accept project-level rules (from a project configuration file such as CLAUDE.md) as input context and make it available to review agents.
- **FR-008**: The review system MUST accept file exclusion patterns (from a review-ignore configuration) as input context.
- **FR-009**: When PR description and project rules are available, review agents MUST consider them before generating findings to avoid contradicting documented project decisions or the stated PR purpose.
- **FR-010**: When combined context (project rules + diff) exceeds 90% of processing capacity, project rules MUST be truncated first, preserving the diff content with a truncation indicator appended.
- **FR-011**: A post-processing validation step MUST verify that each finding's cited line number falls within the diff's valid line range for the referenced file.
- **FR-012**: The post-processing step MUST filter findings whose message contains self-dismissing language such as "no action required", "acceptable as-is", "not blocking", or "no change needed".
- **FR-013**: The post-processing step MUST log all filtered findings at a diagnostic level with the specific filter reason, for debugging purposes.
- **FR-014**: The post-processing validation MUST run after all agents complete and before findings are posted to the code hosting platform.
- **FR-015**: Review agent prompts MUST include explicit rules about common framework conventions: Express 4-parameter error middleware, query library key-based deduplication, promise-settling order preservation, TypeScript underscore-prefix convention for unused parameters, and exhaustive switch enforcement patterns.
- **FR-016**: Review agent prompts MUST instruct agents NOT to suggest externalizing constants that are tightly coupled to adjacent code unless a concrete maintenance benefit is cited.
- **FR-017**: A benchmark adapter MUST translate the review system's finding output into a format suitable for comparison against ground truth labels.
- **FR-018**: A scoring module MUST compute precision, recall, F1, and false-positive rate from findings compared against ground truth.
- **FR-019**: A regression test suite MUST encode all 43 documented false positives as "expected no finding" test cases.
- **FR-020**: The regression suite MUST be executable via a single command and produce a machine-readable results report.

### Key Entities

- **Finding**: The core output of a review agent — a structured record with severity, file location, message, and optional suggestion. The unit that is either a true positive or a false positive.
- **Safe Source**: A data source recognized as provably non-tainted (hardcoded constants, built-in directory references, local directory listings with safe arguments). Used to suppress false-positive sink findings.
- **Agent Context**: The input provided to review agents, including diff content, file metadata, and (newly) PR description, project rules, and file exclusion patterns.
- **Finding Validation Result**: The outcome of post-processing validation for a single finding — valid (passes through to posting) or filtered (suppressed with a logged reason).
- **Benchmark Scenario**: A test case consisting of input diff content, expected true-positive findings, and expected non-findings (documented false positives), used to measure review accuracy.
- **Benchmark Report**: The aggregate output of a benchmark run — precision, recall, F1, false-positive rate, and per-scenario pass/fail results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: False-positive rate on the 43 documented regression cases drops from 100% (43 of 43 are false positives) to at most 15% (at most 6 of 43 produce a false positive).
- **SC-002**: The 2 documented true-positive findings continue to be detected (zero regression in true-positive detection).
- **SC-003**: Review precision (true positives / total findings) reaches at least 70% on security-category findings in benchmark evaluation.
- **SC-004**: Overall false-positive rate (false positives / total findings) drops to at most 25% across combined finding categories in benchmark evaluation.
- **SC-005**: All 43 regression test fixtures pass within 3 releases of this feature being shipped.
- **SC-006**: Context enrichment (injecting PR description and project rules) adds less than 5% overhead to median review completion time.
- **SC-007**: Post-processing filters at least 80% of self-contradicting findings (findings containing self-dismissing language) in the regression suite.
- **SC-008**: No existing automated tests are broken by the changes (zero test regressions).
