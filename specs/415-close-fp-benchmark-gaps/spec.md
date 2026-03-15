# Feature Specification: Close All 12 Unsuppressed FP Benchmark Scenarios

**Feature Branch**: `415-close-fp-benchmark-gaps`
**Created**: 2026-03-13
**Revised**: 2026-03-13 (v3 — addresses 20 review critiques across 2 rounds)
**Status**: Draft
**Input**: User description: "Close all 12 unsuppressed FP benchmark scenarios (Issue #168)"
**Closes**: [GitHub Issue #168](https://github.com/oddessentials/odd-ai-reviewers/issues/168)

## Scenario Classification _(mandatory, pre-implementation)_

Each of the 12 scenarios from Issue #168 is classified below. No escape hatches — every scenario has a definitive disposition before implementation begins.

| #   | ID       | Pattern       | Classification            | Disposition                                                                                                                                                                                                                         |
| --- | -------- | ------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | fp-b-001 | B (Framework) | **TRUE FP**               | Suppress via prompt convention (Express 4-param contract) + widened T019 matcher                                                                                                                                                    |
| 2   | fp-b-003 | B (Framework) | **TRUE FP**               | Suppress via prompt convention (allSettled order per ECMAScript spec) + T023 evidence-gated matcher                                                                                                                                 |
| 3   | fp-b-006 | B (Framework) | **TRUE FP**               | Suppress via prompt convention (React Query built-in error handling)                                                                                                                                                                |
| 4   | fp-b-007 | B (Framework) | **TRUE FP**               | Suppress via prompt convention (allSettled order) + T023 evidence-gated matcher                                                                                                                                                     |
| 5   | fp-c-005 | C (Context)   | **TRUE FP — FIXTURE FIX** | Add missing `prDescription` to fixture; existing PR intent filter handles suppression                                                                                                                                               |
| 6   | fp-c-006 | C (Context)   | **TRUE FP**               | Suppress via prompt convention (singleton pattern is intentional)                                                                                                                                                                   |
| 7   | fp-d-006 | D (PR Intent) | **RECLASSIFY AS TP**      | Diff shows genuine security concern (raw token in POST body). Reclassify `truePositive: true` with expected finding about token transport. Remove T024 matcher — PR description is not structural evidence for security suppression |
| 8   | fp-f-005 | F (Mixed)     | **TRUE FP — FIXTURE FIX** | Narrow to catch-clause context: add explicit `catch (error)` block to fixture diff to make error origin unambiguous. Suppress via narrowed prompt convention                                                                        |
| 9   | fp-f-007 | F (Mixed)     | **TRUE FP**               | Suppress via T025 matcher (path.join(\_\_dirname, literal) is provably safe)                                                                                                                                                        |
| 10  | fp-f-010 | F (Mixed)     | **TRUE FP**               | Suppress via prompt convention (union switch exhaustiveness) + T026 matcher as defense-in-depth                                                                                                                                     |
| 11  | fp-f-014 | F (Mixed)     | **TRUE FP**               | Suppress via strengthened existence verification prompt convention                                                                                                                                                                  |
| 12  | fp-f-015 | F (Mixed)     | **TRUE FP — FIXTURE FIX** | Narrow to pure standard-library wrapper: ensure fixture diff shows a function whose sole body is `return JSON.parse(input)` with no I/O or side effects. Suppress via narrowed prompt convention                                    |

**Impact on scenario counts**: fp-d-006 moves from FP pool to TP pool. The target becomes: 36 FP scenarios (11 newly passing + 25 existing) + 19 TP scenarios (18 existing + 1 reclassified). Total runnable: 66/66 = 100%.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Benchmark Snapshot Coverage Reaches 100% (Priority: P1)

As a developer running the benchmark suite, I want all LLM-dependent snapshot scenarios to execute and pass via deterministic replay, so that false-positive suppression is comprehensive and regression-free without requiring live API access at merge time.

**Why this priority**: The 12 incomplete scenarios represent a 32.4% gap in benchmark coverage. This is the core deliverable of Issue #168.

**Independent Test**: After recording snapshots locally, run the benchmark test suite with no API keys set. All snapshot scenarios must pass via replay. The runnable scenario ratio must reach 100%.

**Acceptance Scenarios**:

1. **Given** all prompt conventions and matchers are updated, **When** `pnpm benchmark:record` is run locally with a valid API key, **Then** all snapshot files are created/updated with findings that are either absent or fully suppressed by post-processing
2. **Given** all snapshots are committed, **When** the benchmark test suite runs in CI (replay-only, no API keys), **Then** FP suppression rate >= 90%, TP recall = 100%, TP precision >= 70%, and runnable ratio = 100%
3. **Given** prompt changes invalidate snapshot hashes, **When** the CI benchmark-regression job runs, **Then** the job FAILS with a prompt drift error instructing the developer to re-record snapshots. The developer MUST run `pnpm benchmark:record` locally, commit updated snapshots alongside the prompt changes, and push before the gate passes
4. **Given** existing Pattern A/E deterministic scenarios, **When** new matchers or conventions are added, **Then** all previously passing scenarios continue to pass (zero regressions)

---

### User Story 2 - Prompt Conventions Prevent LLM False Positives at Source (Priority: P1)

As an AI code review system, the prompt conventions must instruct the LLM to avoid generating false-positive findings for well-known safe patterns, with each convention scoped to specific evidence-backed conditions and explicit pass-through rules for genuine findings.

**Why this priority**: Prompt-level prevention is the primary defense. 9 of the 11 FP scenarios (excluding reclassified fp-d-006) stem from the LLM describing patterns in ways current conventions don't address.

**Independent Test**: Record fresh snapshots after updating conventions with a single designated provider. Verify that the LLM returns zero findings for each convention-addressed scenario.

**Acceptance Scenarios**:

1. **Given** updated Express error handler convention, **When** the LLM reviews an Express 4-param error handler, **Then** no findings about unused parameters or "declared but not referenced" are produced — BUT findings about `err.stack` exposure in production responses ARE still produced
2. **Given** updated Promise.allSettled convention, **When** the LLM reviews allSettled iteration code, **Then** no findings about order preservation or "missing try-catch" around allSettled are produced — BUT findings about assuming all results are fulfilled without checking `.status` ARE still produced
3. **Given** updated React Query convention, **When** the LLM reviews a single useQuery call, **Then** no findings about missing error handling around the hook are produced — BUT findings about components that ignore the `error` return value when rendering user-facing content ARE still produced
4. **Given** singleton pattern convention, **When** the LLM reviews a lazy-init singleton with guard check, **Then** no resource leak findings are produced — BUT findings about async singleton getters without concurrency guards ARE still produced
5. **Given** switch exhaustiveness convention, **When** the LLM reviews a union-typed switch covering all members without default, **Then** no "missing default" findings are produced — BUT findings about switches on untyped `string` or `number` without default ARE still produced
6. **Given** narrowed error.message convention, **When** the LLM reviews a `catch (error) { renderError(error.message) }` pattern, **Then** no XSS findings are produced — BUT findings about `error.message` used in `innerHTML` where the Error was constructed from `req.body` ARE still produced
7. **Given** narrowed thin wrapper convention, **When** the LLM reviews a function whose sole body is `return JSON.parse(input)`, **Then** no missing-try-catch findings are produced — BUT findings about wrappers around I/O operations (`fs`, `fetch`) or wrappers called from HTTP handlers ARE still produced
8. **Given** strengthened existence verification convention, **When** the LLM reviews code, **Then** no findings reference constructs that do not exist at the cited line

---

### User Story 3 - Deterministic Matchers Catch Residual FPs with Strict Evidence (Priority: P2)

As a post-processing pipeline, new deterministic matchers must suppress false-positive findings that survive prompt conventions, using strict structural evidence from the diff — never heuristic signals like PR descriptions or function names.

**Why this priority**: Even with perfect prompt conventions, LLMs may occasionally produce findings. Matchers T025 and T026 provide defense-in-depth. T024 is removed (fp-d-006 reclassified as TP).

**Independent Test**: Create unit tests with synthetic findings matching each new matcher's target patterns. Verify suppression with valid evidence and pass-through without evidence or when safety constraints trigger.

**Acceptance Scenarios**:

1. **Given** a finding about "path traversal" with evidence of `path.join(__dirname, 'template.html')` in the diff, **When** T025 evaluates it, **Then** the finding is suppressed because both arguments are from the closed allowlist (allowed base + string literal)
2. **Given** a finding about "path traversal" with evidence of `path.join(dir, filename)` in the diff, **When** T025 evaluates it, **Then** the finding passes through because `dir` and `filename` are variables, not from the allowlist
3. **Given** a finding about "path traversal" with evidence of `path.join(__dirname, ${userInput})` in the diff, **When** T025 evaluates it, **Then** the finding passes through because template interpolation is on the rejection list
4. **Given** a finding about "missing default case" with evidence of `switch (theme)` where `type Theme = 'light' | 'dark'` and both cases are present, **When** T026 evaluates it, **Then** the finding is suppressed
5. **Given** a finding about "missing default case" with no visible TypeScript union type in the diff, **When** T026 evaluates it, **Then** the finding passes through because the evidence requirement is not met

---

### User Story 4 - CLI Local Review Achieves FP Suppression Parity (Priority: P2)

As a developer using `npx odd-ai-review local`, I want the same finding post-processing pipeline that GitHub and ADO CI reviews use, so that local reviews apply the same suppressions when given equivalent inputs.

**Why this priority**: CLI local review currently skips sanitization, self-contradiction filtering, framework pattern filtering, and Stage 2 line validation. This is a 4-step gap.

**Independent Test**: Run the framework-pattern-filter unit test suite against synthetic findings and diff content. Assert identical suppression counts regardless of whether findings are routed through the GitHub, ADO, or CLI code paths.

**Acceptance Scenarios**:

1. **Given** identical diff content, agent configuration, project rules, and enabled filters, **When** findings are processed through CLI vs GitHub vs ADO paths, **Then** the suppressed finding set is identical
2. **Given** CLI mode with no prDescription available, **When** the PR intent contradiction filter would have suppressed a finding in GitHub mode, **Then** CLI mode does NOT suppress it (legitimate, documented divergence)
3. **Given** the local review pipeline, **When** findings are produced by agents, **Then** they pass through sanitization, self-contradiction filtering (Stage 1), framework pattern filtering, and diff-bound validation (Stage 2) before terminal output

---

### User Story 5 - Benchmark Smoke Test Uses Meaningful Thresholds (Priority: P3)

As a maintainer, I want the CI benchmark smoke test to use thresholds that would catch real quality regressions, rather than the current vacuous 0.01 values.

**Why this priority**: The benchmark-check smoke test validates that the script works correctly against mock data. After fixing the 12 scenarios, the mock data and thresholds should reflect realistic baselines.

**Independent Test**: Set mock scores below the new thresholds. Verify the CI benchmark-check step fails.

**Acceptance Scenarios**:

1. **Given** updated mock results and thresholds, **When** benchmark scores fall below meaningful minimums, **Then** the CI benchmark-check step fails
2. **Given** the current benchmark improvements, **When** mock results are updated to reflect actual improved scores, **Then** the thresholds match the external benchmark targets (precision >= 0.40, recall >= 0.30, F1 >= 0.35)

---

### Edge Cases

- What happens when a new LLM model version interprets conventions differently? If the prompt template files change, the prompt hash changes, and CI requires snapshot re-recording before merge. If only the model version changes (same prompt templates), snapshots remain valid — the post-processing pipeline is deterministic regardless of which model produced the raw output.
- What happens when a finding matches multiple matchers? The first-match-wins design prevents double-counting. Each finding is evaluated against matchers in order; the first match suppresses it.
- What happens when the LLM produces a finding at warning/error severity instead of info? New matchers (T025/T026) handle all severities via evidence validation, unlike the self-contradiction filter which gates on info-only. The info-only severity gate is NOT relaxed.
- What happens when `path.join` receives a mix of constants and variables? T025 requires ALL path segments to be from the closed allowlist. A single variable segment causes the finding to pass through.
- What happens when the PR has no prDescription (CLI local review mode)? PR intent filtering does not run in CLI mode. This is a documented, legitimate divergence.
- What happens if prompt changes break existing passing snapshots? CI fails with a prompt drift error. The developer must re-record snapshots locally with `pnpm benchmark:record` and commit them alongside the prompt changes in the same PR.
- What happens when `const dir = __dirname; path.join(dir, 'file')` is used? T025 rejects aliases — the allowed base must appear literally as an argument. Alias tracking requires AST analysis beyond the diff-text matcher's scope.
- What happens when a prompt hash mismatch is detected? CI fails the benchmark-regression job with an error identifying the drifted hash and instructing the developer to re-record. This is the same hard failure regardless of snapshot age — freshness is enforced by hash match, not by timestamp.
- What happens when a fixture is edited (FR-017b, FR-017c) — could the edit make it unrealistic? The fixture integrity rule (Constraints section) requires that edits preserve structural realism. Added context must represent code that would naturally exist in production. Simplifying to a synthetic pattern the LLM trivially ignores is prohibited.

## Requirements _(mandatory)_

### Functional Requirements

#### Prompt Conventions (Category 1)

All conventions MUST include both "Do NOT flag" (suppression scope) and "DO still flag" (pass-through rules) sections. Suppression applies ONLY when the specified structural evidence is present.

- **FR-001**: System MUST add an Express error handler convention scoped to the following conditions:
  - **Suppress when**: Function has exactly 4 parameters AND at least one Express indicator is present (Express import, Express type annotation, or `.use()` registration)
  - **Suppress what**: Unused parameter findings, "declared but never referenced", "dead code: parameter never called"
  - **Pass through**: Security findings about the handler body (e.g., sending `err.stack` in production, reflecting unsanitized error messages to clients)

- **FR-002**: System MUST add a Promise.allSettled convention scoped to the following conditions:
  - **Suppress when**: `Promise.allSettled` call is visible in the diff
  - **Suppress what**: "Results may not match input order", "missing try-catch around allSettled", "silent rejection ignoring" when code checks `result.status`
  - **Pass through**: Code that assumes all results are fulfilled without checking `.status`, or that ignores rejected results when failure reporting is required

- **FR-003**: System MUST add a React Query/SWR/Apollo convention scoped to the following conditions:
  - **Suppress when**: Import from a query library (`@tanstack/react-query`, `swr`, `@apollo/client`) is visible in the diff AND a query hook call (`useQuery`, `useSWR`, `useApolloClient`) is present within 10 lines of the finding line AND in the same diff file section (hunk)
  - **Suppress what**: "Missing try-catch around useQuery/useSWR", "double-fetching" for same cache key
  - **Pass through**: Components that destructure `useQuery` but never check `error`/`isError` when rendering user-facing content

- **FR-004**: System MUST add a singleton pattern convention scoped to the following conditions:
  - **Suppress when**: All three observable conditions are met in the diff:
    1. Module-scoped `let` variable initialized to null (regex: `/^(?:let|var)\s+\w+\s*(?::\s*\w[\w<>|]*\s*(?:\|\s*null)?)?\s*=\s*null/m`)
    2. Guard check referencing the same variable name (regex: `/if\s*\(\s*!\s*VARNAME\s*\)/` where VARNAME matches condition 1)
    3. Exactly one `new` expression or factory call assigning to the same variable within the guard block
  - **Suppress what**: "Resource leak", "connection never closed", "shared mutable state" for singletons
  - **Pass through**: Async singleton getters without concurrency guards, singletons creating unbounded sub-resources, `new X()` in per-request handlers without cleanup

- **FR-005**: System MUST add a switch exhaustiveness convention scoped to the following conditions:
  - **Suppress when**: Switch operates on a variable typed as a union and covers ALL union members
  - **Suppress what**: "Missing default", "no fallback", "non-exhaustive switch"
  - **Pass through**: Switches on untyped `string` or `number` without default

- **FR-006**: System MUST strengthen the error object XSS convention scoped to the following conditions:
  - **Suppress when**: Error variable origin is structurally observable in the diff via ONE of:
    1. `catch` clause: `catch (varName)` or `catch (varName: Type)` visible in the diff within 10 lines of the finding
    2. Explicit type annotation: `: Error` or `: SomeError` (any type name ending in `Error`) visible on the variable's declaration in the diff
  - **Non-structural signals that MUST NOT be used for suppression**: (a) function name containing "error"/"handle"/"catch", (b) parameter name being `err`/`error` without type annotation, (c) variable naming conventions, (d) file name or module path patterns. These are heuristic and unreliable — only the `catch` keyword or explicit type annotation provides structural proof of error origin.
  - **Suppress what**: XSS findings about `error.message` in template literals or error display when the error variable has structurally proven origin
  - **Pass through**: `error.message` used in `innerHTML` when the Error was constructed from user input (`new Error(req.body.text)`), error messages from external API responses rendered without sanitization, error variables without structurally observable origin

- **FR-007**: System MUST add a thin wrapper convention scoped to the following conditions:
  - **Suppress when**: Function body contains exactly one statement that is a direct return of a standard library call (JSON.parse, parseInt, new URL, Buffer.from), function is 1-3 lines with no conditional logic, no side effects, and no I/O
  - **Suppress what**: "Missing try-catch", "unhandled exception" for pure standard-library wrappers
  - **Pass through**: Wrappers around I/O operations (fs, fetch, database queries), wrappers called from HTTP request handlers, functions with side effects before the throwing call

- **FR-008**: System MUST strengthen the existence verification convention with CRITICAL prefix requiring LLMs to cross-reference every cited function name, variable name, and API call against actual diff content before finalizing findings. Findings that reference constructs not present in the diff MUST be omitted.

- **FR-009**: All prompt convention changes MUST be synced to all prompt files via the shared conventions marker replacement mechanism

#### Deterministic Matchers (Category 2)

- **FR-010**: _(REMOVED — fp-d-006 reclassified as true positive. T024 OAuth2 matcher is not needed. PR description and function names are cosmetic metadata, not structural evidence for suppressing security findings.)_

- **FR-011**: System MUST add matcher T025 (Safe Local File Read) with a strict closed evidence contract:
  - **Allowed APIs** (exhaustive): `path.join`, `path.resolve`
  - **Allowed bases** (exhaustive): `__dirname`, `__filename`, `import.meta.dirname`, `import.meta.filename`, `import.meta.url`
  - **Allowed segments** (exhaustive): single-quoted string literals, double-quoted string literals, backtick strings with NO interpolation
  - **Canonical regex**: `/path\.(join|resolve)\s*\(\s*(?:__dirname|__filename|import\.meta\.(?:dirname|filename|url))\s*(?:,\s*['"][^'"]*['"]\s*)*\)/`
  - **Rejection list**: Variables, function calls, property access, computed expressions, template interpolation (`${...}`), `process.env.*`, `req.*`, `process.argv`, aliases (e.g., `const dir = __dirname; path.join(dir, ...)` is NOT recognized — the allowed base must appear literally)
  - **Deliberate scope limitation**: T025 operates on single-line diff content only. Multi-line `path.join`/`path.resolve` calls (where arguments span multiple lines) are NOT matched. This is a conservative default that accepts 85–90% coverage in exchange for zero false suppressions. Implementers MUST NOT extend the canonical regex to match multi-line calls without a separate spec amendment.
  - **Expected pass-through variants** (not suppressed by design): (1) multi-line path calls, (2) aliased bases (`const dir = __dirname`), (3) computed segments (`path.join(__dirname, getPath())`), (4) imported path helpers (`import { templateDir } from './paths'`), (5) path construction via string concatenation (`__dirname + '/file'`)
  - **Safety constraint**: MUST NOT suppress if any path component is outside the closed allowlists above

- **FR-012**: System MUST add matcher T026 (Exhaustive Type-Narrowed Switch) with evidence requirements:
  - **Message pattern**: `/missing.*(?:case|default)|no.*default|add.*default|non-?exhaustive/i`
  - **Evidence**: `switch` statement present within 10 lines of finding AND TypeScript union type annotation visible in the diff section (pattern: `/\btype\s+\w+\s*=\s*(['"][^'"]+['"]\s*\|)/`)
  - **Safety constraint**: Must NOT suppress when the switch target type is `string`, `number`, or another non-union type

- **FR-013**: The closed matcher table governance model MUST be formally amended from "5 matchers" to "7 matchers" (adding T025, T026) in the framework-pattern-filter source documentation

#### Post-Processing Pipeline (Category 3)

- **FR-014**: System MUST widen T019 (Express Error Middleware) messagePattern to additionally match: "declared but never referenced", "dead code: never called", "parameter not referenced". Evidence coupling invariant:
  - **(a)** The widened message phrases MUST share the SAME evidence validator as existing T019 patterns — no separate code path
  - **(b)** The evidence validator MUST require 4-param function signature AND Express indicator (import/type annotation/`.use()`) — no phrase-only suppression path exists
  - **(c)** Each new phrase MUST be tested with 5 negative cases: (1) phrase match without 4 params, (2) phrase match without Express indicator, (3) phrase match in non-handler context, (4) phrase match with a different framework (e.g., Koa), (5) phrase match alongside a genuine security finding
  - **(d)** The message pattern widening MUST NOT create any new code path that bypasses evidence validation

- **FR-015**: _(REVISED)_ System MUST NOT widen T023's messagePattern to phrasings that omit "allSettled". Instead, if a separate allSettled error-handling FP category emerges from snapshot recording, a new evidence-gated matcher (T027) MAY be added with the following constraints:
  - Message pattern MUST reference error handling, not generic concurrency
  - Evidence validator MUST require `Promise.allSettled(` within 10 lines of the finding AND `result.status` access pattern in the diff
  - This matcher requires a separate spec amendment if added

- **FR-016**: _(REVISED)_ System MUST add advisory-phrasing patterns to the DISMISSIVE_PATTERNS list: "working as intended", "no issues found", "non-critical", "low priority". The existing three-gate architecture (info severity + pattern match + no actionable suggestion) MUST remain mandatory — phrase match alone MUST NEVER filter a finding. A documentation comment MUST be added above the DISMISSIVE_PATTERNS array explaining the three-gate dependency.

- **FR-017**: System MUST fix the fp-c-005 scenario fixture by adding `prDescription: "feat: Add environment-dependent feature flag"` to enable PR intent contradiction filtering

- **FR-017a**: System MUST reclassify fp-d-006 as `truePositive: true` with a tight match contract for the expected finding, using the same `ExpectedFinding` shape as all 18 existing TP scenarios:
  - `truePositive`: `true`
  - `expectedFindings`: exactly one entry: `{ "file": "src/auth.ts", "severityAtLeast": "warning", "messageContains": "token" }`
  - **Match criteria explained**:
    - `file: "src/auth.ts"` — exact file path match (the only file in the diff). Required, non-negotiable.
    - `severityAtLeast: "warning"` — the finding MUST be at least warning severity. A security concern about raw token transport in a POST body is not an info-level observation. This floor prevents the scenario from passing on a low-confidence info finding that happens to mention "token."
    - `messageContains: "token"` — case-insensitive substring. Present in all reasonable phrasings: "raw token", "token in body", "token transport", "bearer token". Narrow enough to exclude unrelated findings, broad enough to permit cross-provider variation.
    - `line` — NOT specified (consistent with all 18 existing TP scenarios). The LLM may report line 2 or line 3.
    - `ruleId` — NOT specified. LLM-generated `semantic/*` ruleIds vary by provider.
  - The finding validates that the LLM correctly identifies the security concern: a raw token sent in the POST body without encryption or authorization header transport

- **FR-017b**: System MUST update the fp-f-005 fixture diff to include an explicit `catch (error)` block, making the error origin unambiguously a caught exception (not a function parameter of unknown origin).

- **FR-017c**: System MUST verify the fp-f-015 fixture diff shows a pure standard-library wrapper with the following explicit shape:
  - **Required fixture fields**: `id: "fp-f-015"`, `pattern: "F"`, `category: "existence-verification"`, `subcategory: "missing-api"`, `expectedFindings: []`, `truePositive: false`
  - **Required diff structure**: Single exported function, 1–3 lines, whose sole body is `return <STDLIB_CALL>(input)` where `<STDLIB_CALL>` is from the allowlist: `JSON.parse`, `JSON.stringify`, `parseInt`, `parseFloat`, `new URL`, `Buffer.from`, `decodeURIComponent`, `encodeURIComponent`
  - **Prohibited in diff**: `import` statements for I/O modules (`fs`, `http`, `net`, `child_process`), `fetch()` calls, database driver calls, HTTP handler registration (`.get(`, `.post(`, `.use(`), `async` keyword, `await` keyword, multiple statements in function body
  - **Current fixture is compliant**: The existing fp-f-015 diff (`return JSON.parse(input)`) meets all requirements — no modification needed unless the fixture has drifted

#### CLI Local Review Parity (Category 4)

- **FR-018**: The local review command MUST execute exactly 4 post-processing stages matching hosted mode. These stages are the complete and exhaustive definition of CLI parity:
  - **(a)** Sanitization: Findings MUST be sanitized before display (same sanitization logic as hosted mode)
  - **(b)** Stage 1 — Semantic validation: Findings MUST pass through self-contradiction filtering (three-gate: info severity + dismissive pattern + no actionable suggestion)
  - **(c)** Framework convention filtering: Findings MUST pass through framework pattern matchers with diff content from the local diff (same matcher table as hosted mode)
  - **(d)** Stage 2 — Diff-bound validation: Findings MUST pass through line-level validation against the local diff
  - **Out-of-scope divergences** (accepted and documented, NOT bugs): (1) PR intent contradiction filtering (no `prDescription` in CLI), (2) PR description context loading (GitHub/ADO API not available), (3) Platform-specific comment formatting (inline vs. terminal), (4) Platform-specific path normalization (GitHub/ADO path schemes), (5) Review comment threading and resolution tracking

#### Benchmark Smoke Test (Category 5)

- **FR-019**: The CI benchmark-check smoke test MUST use thresholds matching the external benchmark targets (precision >= 0.40, recall >= 0.30, F1 >= 0.35) and the mock results MUST be updated to reflect improved scores

#### Snapshot Recording & Verification (Category 6)

- **FR-020**: All LLM-dependent scenarios classified as FP MUST have valid snapshot files committed to the repository. Scenarios classified as TP MUST have expected findings defined in the regression suite fixture.

- **FR-021**: Snapshot recording MUST be performed with a single designated provider (Anthropic or OpenAI) per recording session. The provider name and model ID MUST be auto-detected and stored in snapshot metadata (fixing the current "unknown" bug).

- **FR-022**: The CI benchmark-regression merge gate MUST be deterministic and replay-only (no live API calls). Drift handling enforces a two-part validation:
  - **Gate 1 — Replay validity (fixture hash)**: Fixture hash MUST match. Mismatch is a hard failure — the scenario's diff content changed, so the snapshot is structurally invalid and MUST be re-recorded
  - **Gate 2 — Prompt freshness (prompt hash)**: Prompt template hash MUST match. Mismatch is a hard failure — snapshots must reflect current prompt conventions to validate that convention changes produce correct suppression. The error message MUST instruct the developer to re-record with `pnpm benchmark:record`
  - **Both gates MUST pass for merge**. The workflow for changing prompts is: (1) modify prompt conventions, (2) run `pnpm benchmark:record` locally to re-record snapshots with the new prompts, (3) commit both prompt changes and updated snapshots in the same PR, (4) CI verifies Gate 1 (replay correctness) and Gate 2 (prompt hash match)
  - **Runnable ratio gate** (>= 80%): Provides the safety net for missing snapshots (scenarios without snapshots are skipped, not failed)

- **FR-023**: _(ADVISORY, NOT MERGE-BLOCKING)_ Cross-provider verification SHOULD be performed as a separate manual or scheduled check. Cross-provider failure does not block merges. This validates prompt convention portability, which is valuable but not a merge-gate concern.

#### Testing Requirements

- **FR-024**: Each new matcher (T025, T026) MUST have unit tests covering: positive match (evidence present), negative match (evidence absent), every rejection-list item, safety constraint enforcement, alias rejection, file mismatch handling, and edge cases
- **FR-025**: Each widened matcher (T019) MUST have unit tests covering the newly accepted message patterns alongside the existing patterns
- **FR-026**: New DISMISSIVE_PATTERNS MUST have unit tests verifying that pattern match + info severity + no actionable suggestion = suppression, AND that pattern match at warning severity or with actionable suggestion = pass-through
- **FR-027**: CLI local review pipeline integration MUST have tests verifying that sanitization, self-contradiction filtering, framework pattern filtering, and Stage 2 validation all execute before terminal output
- **FR-028**: All existing tests (4,095 currently passing) MUST continue to pass after all changes
- **FR-029**: Coverage thresholds MUST be maintained or improved (CI: statements 65%, branches 60%, functions 68%, lines 66%)

### Key Entities

- **Benchmark Scenario**: A test case with an ID, pattern category (A-F), diff content, expected findings, truePositive flag, and optional prDescription/projectRules. Can be deterministic (A/E) or snapshot-dependent (B/C/D/F)
- **Snapshot**: A recorded LLM response for a scenario, including metadata (prompt hash, fixture hash, model ID, provider, timestamp) and response (findings array, raw output). Replayed deterministically in CI without API keys.
- **Framework Matcher**: A deterministic filter with an ID, name, message regex pattern, evidence validator function operating on diff text only, suppression reason, and safety constraints. Part of a governed closed table (currently 5 matchers, amended to 7 by this spec)
- **Prompt Convention**: A numbered instruction in the shared conventions template structured as: Suppress-when conditions, Do-NOT-flag list, DO-still-flag list, Recognition pattern, Why-not-to-flag rationale
- **Finding**: A code review observation with file, line, severity (info/warning/error), message, suggestion, ruleId, and category. Processed through semantic validation, diff-bound validation, and framework pattern filtering

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: _(Per-scenario gate)_ Each of the 11 FP scenarios addressed by this spec (fp-b-001, fp-b-003, fp-b-006, fp-b-007, fp-c-005, fp-c-006, fp-f-005, fp-f-007, fp-f-010, fp-f-014, fp-f-015) individually produces zero surviving false-positive findings after post-processing. Verification: per-scenario assertion in the benchmark test, not just aggregate rate. A single scenario failure fails this criterion even if the aggregate rate exceeds 90%.
- **SC-002**: fp-d-006 (reclassified as TP) produces a finding matching the expected security observation about token transport, validated against the match contract in FR-017a (severity >= warning, message matches token/credential transport pattern, file matches fixture)
- **SC-003**: Benchmark runnable scenario ratio reaches 100% (up from 81.8%)
- **SC-004**: _(Aggregate non-regression floor)_ The aggregate FP suppression rate across all 36 FP scenarios (11 new + 25 existing) remains >= 90%. This is a suite-wide floor that catches broad regressions — it does NOT substitute for SC-001's per-scenario gate. If SC-001 passes but SC-004 fails, existing scenarios have regressed.
- **SC-005**: True-positive recall remains at 100% (no regressions — verified across all 19 TP scenarios including reclassified fp-d-006)
- **SC-006**: True-positive precision remains at or above 70%
- **SC-007**: CLI local review executes exactly the 4 post-processing stages defined in FR-018(a)–(d): sanitization, Stage 1 semantic validation, framework convention filtering, and Stage 2 diff-bound validation. Given identical diff content, agent configuration, project rules, and enabled filters, these 4 stages produce the same suppression set as hosted mode. The 5 out-of-scope divergences listed in FR-018 are accepted and documented — they are NOT measured by this criterion.
- **SC-008**: New matchers maintain security boundary — all safety constraint and rejection-list unit tests pass, demonstrating that genuine security findings are NOT suppressed
- **SC-009**: Prompt conventions produce correct results with at least one LLM provider (Anthropic or OpenAI), verified by successful snapshot recording where all FP scenarios yield zero or fully-suppressed findings
- **SC-010**: All changes pass the existing CI quality gates without exceptions or threshold adjustments that weaken gates (non-regression criterion)

### Assumptions

- API keys (ANTHROPIC_API_KEY or OPENAI_API_KEY) are available for snapshot recording during development. CI merge gates do NOT require API keys.
- The existing benchmark scoring thresholds (90% FP suppression, 100% TP recall, 70% TP precision) are correct and should be maintained, not loosened
- Prompt changes will invalidate all existing 25 snapshots, requiring a full re-recording session as a local development step. Updated snapshots MUST be committed alongside prompt changes — CI enforces hash match (FR-022 Gate 2)
- The closed matcher table governance model (requiring spec amendment) is the right approach — this spec amends the count from 5 to 7
- The existing prompt sync mechanism correctly propagates shared conventions to all prompt files

### Constraints

- The existing severity gate (info-only) in the self-contradiction and PR intent filters MUST NOT be relaxed — it is a deliberate security boundary
- New matchers MUST use the defense-in-depth pattern: message pattern match AND evidence validation against diff text AND safety constraint checking. PR descriptions, function names, and other cosmetic metadata MUST NOT be used as evidence for suppressing security findings.
- Prompt conventions MUST include both suppression scope and explicit pass-through rules. "Suppress ALL" language is prohibited.
- DISMISSIVE_PATTERNS additions MUST rely on the existing three-gate architecture (info severity + pattern match + no actionable suggestion). Phrase match alone MUST NEVER filter a finding.
- The CI benchmark-regression merge gate MUST be deterministic and replay-only — no live API calls, no network dependency
- All changes MUST pass the full CI pipeline including: quality gates, coverage thresholds, benchmark regression, container security scan, and cross-platform bin resolution tests
- **Fixture integrity rule** (applies to FR-017, FR-017b, FR-017c, and any future fixture edits): When a fixture is modified, the edit MUST satisfy ALL of the following:
  - **(FIR-1) Behavioral preservation**: The modified fixture MUST still exercise the same FP/TP pattern the original was designed to test. Per-fixture constraints:
    - fp-c-005: Adding `prDescription` enables the existing PR intent filter; the code under review (env-dependent branching) MUST NOT change
    - fp-f-005: Adding `catch (error)` narrows error origin but the `error.message` in a template literal construct MUST remain — this is the FP trigger
    - fp-f-015: Verifying the pure `JSON.parse` wrapper MUST NOT alter the function body — this is the FP trigger
  - **(FIR-2) Realism preservation**: The modified fixture's diff MUST represent code a developer would plausibly write in a real PR. Additions like defensive checks no developer would write, or `eslint-disable` / `@ts-ignore` comments, are prohibited
  - **(FIR-3) No behavioral removal**: A fixture modification MUST NOT remove or alter the code construct the scenario was created to test (function bodies, API calls, control flow structures that define the pattern)
  - **(FIR-4) Review gate**: The PR review checklist MUST verify that each modified fixture's diff preserves the core pattern (FIR-1), maintains realism (FIR-2), and retains the construct under test (FIR-3)

### Dependencies

- Issue #168 documents the 12 failing scenarios and must be closed by the PR resulting from this spec
- Existing PR #169 (merged) established the benchmark infrastructure and snapshot replay pipeline that this feature builds upon
- The prompt sync script must correctly handle new conventions added to the shared conventions template
- The framework-pattern-filter closed-table amendment replaces the "5 matchers only" governance with "7 matchers" governance

### Out of Scope

The following items were identified during review but are NOT part of this spec. They should be addressed in separate PRs to avoid scope creep:

- **Semgrep version pinning** in ai-review-dispatch.yml (supply chain hardening, unrelated to FP benchmarks)
- **SHA-pinning GitHub App token action** in release.yml (supply chain hardening, unrelated to FP benchmarks)
- **CODEOWNERS file creation** (repo governance, unrelated to FP benchmarks)
- **Cross-provider snapshot verification as a merge gate** (valuable for portability but not required for closing Issue #168)
- **T027 allSettled error-handling matcher** (may be needed if snapshots show a new FP category; requires separate spec amendment)
