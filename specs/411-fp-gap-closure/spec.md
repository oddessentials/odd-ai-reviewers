# Feature Specification: False Positive Gap Closure — Destructuring Taint, Filter Hardening & Benchmark CI

**Feature Branch**: `411-fp-gap-closure`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "Close remaining gaps from 410-false-positive-deep-fixes (issues #158-161, #164). Three workstreams: (1) destructuring assignment taint tracking fix, (2) prompt & deterministic filter hardening for Patterns B/C/D, (3) security hardening & benchmark CI enforcement. Informed by 6-specialist adversarial review team."

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Destructuring Assignment Vulnerabilities Are Detected (Priority: P1)

A developer submits a pull request containing code that destructures user-controlled input (e.g., `const { userId } = req.body`) and passes destructured values to dangerous sinks (database queries, file system operations, DOM manipulation). The AI code review system correctly identifies the taint flow through the destructuring pattern and reports a security finding. This works for array destructuring, object destructuring, renamed properties, rest elements, and nested patterns — matching the same detection quality as simple variable assignments.

**Why this priority**: This is a security-critical false negative. The current system misses real SQL injection, command injection, XSS, and path traversal vulnerabilities when user input flows through destructuring assignments. Estimated 12-15 real vulnerabilities missed per 100 reviews. Issue #164 documents this as the last known taint tracking bypass.

**Independent Test**: Run the review system against a file containing `const { data } = req.body; db.query(data)`. A security finding MUST be produced. Then run against `const { name } = { name: "hardcoded" }; db.query(name)` and verify NO finding is produced (safe constant destructuring).

**Acceptance Scenarios**:

1. **Given** code with `const { userId, token } = req.body; db.query(userId)`, **When** the control-flow vulnerability detector analyzes it, **Then** an injection finding is produced for `db.query(userId)` with taint traced to `req.body`.
2. **Given** code with `let a, b; [a, b] = [req.body.x, "safe"]; db.query(a)`, **When** analyzed, **Then** an injection finding is produced for `db.query(a)` with taint traced to `req.body.x`.
3. **Given** code with `const { data: renamed } = req.body; element.innerHTML = renamed`, **When** analyzed, **Then** an XSS finding is produced for the renamed binding `renamed`.
4. **Given** code with `const [first, ...rest] = req.body.items; exec(rest[0])`, **When** analyzed, **Then** a command injection finding is produced for rest element usage.
5. **Given** code with `const { a: { b } } = req.body; fs.readFile(b)`, **When** analyzed, **Then** a path traversal finding is produced for the nested destructured binding `b`.
6. **Given** code with `const { data } = { data: "hardcoded" }; db.query(data)`, **When** analyzed, **Then** NO finding is produced. _[Rationale: This is NOT Pattern 1 safe-source detection (FR-008 excludes object literals from Pattern 1). Instead, the Binding-Level Taint Semantics "per-binding for literals" tier applies — the RHS is an object literal with all-literal values, so the taint tracker evaluates each binding individually and finds no taint source.]_
7. **Given** code with `const { data } = req.body` in an inner function scope and `const { data } = { data: "safe" }` in an outer scope, **When** analyzed, **Then** only the inner-scope usage produces a finding (scope isolation preserved).

---

### User Story 2 — Framework Convention False Positives Are Suppressed Deterministically (Priority: P2)

A developer submits a pull request using standard framework patterns — Express error middleware with its required 4-parameter signature, React Query with identical query keys for shared cache, `Promise.allSettled` with ordered iteration, or TypeScript's `_prefix` convention for intentionally unused parameters. The review system recognizes these conventions through a combination of improved LLM guidance and a new deterministic post-processing filter, and does NOT produce findings that contradict established framework behavior.

**Why this priority**: Pattern B (framework convention violations) accounts for 12% of documented false positives across issues #158-161. These are particularly trust-damaging because they demonstrate ignorance of the target language's ecosystem — the core competency a developer expects from a code reviewer. A deterministic filter layer ensures these are caught even when LLM behavior varies.

**Independent Test**: Submit code with Express error middleware `(err, req, res, _next)` for review. Verify no "unused parameter" finding is produced. Submit code with two `useQuery` calls sharing the same key and verify no "double-fetching" finding.

**Acceptance Scenarios** — Split by Implementation Approach:

**Deterministic Filter-Backed (FR-013 matcher table):**

1. **Given** an Express error handler with signature `(err, req, res, _next)` registered via `.use()`, **When** reviewed, **Then** no "unused parameter" or "remove \_next" finding is emitted. _[Implementation: Express Error Middleware matcher]_
2. **Given** a TypeScript function parameter prefixed with `_` (e.g., `_unused: string`), **When** reviewed, **Then** no "unused parameter" finding is emitted. _[Implementation: TypeScript Unused Prefix matcher]_

**Prompt-Guided (improved LLM guidance, not deterministically filtered):** 3. **Given** a value constrained by a strict union type with a default via `??` operator, **When** reviewed, **Then** no "add runtime validation" finding is emitted. _[Implementation: Prompt guidance via FR-010 type-system awareness section]_ 4. **Given** two `useQuery()` calls with identical query keys in the same component, **When** reviewed, **Then** no "double-fetching" or "duplicate query" finding is emitted. _[Implementation: Prompt guidance via FR-010 React Query section]_ 5. **Given** code iterating `Promise.allSettled()` results in input order, **When** reviewed, **Then** no "resolution order" finding is emitted. _[Implementation: Prompt guidance via FR-010 Promise.allSettled section]_

**True Positive Preservation (applies to all approaches):** 6. **Given** genuine unused parameter without `_` prefix in non-middleware code, **When** reviewed, **Then** the finding IS produced (true positive preserved).

**Note**: Scenarios 1-2 are deterministically verified by syntax/structure inspection. Scenarios 3-5 require semantic understanding of type systems or library internals and remain prompt-guided with explicit framework convention recognition (FR-010).

---

### User Story 3 — Project Rules and PR Description Actively Prevent Contradicting Findings (Priority: P2)

A project maintainer has documented architectural decisions (e.g., "single CSS file, no modularization") and opens a PR whose description clearly states its purpose. The review system's prompts now include explicit directives to consult project rules and PR description before generating findings. Findings contradicting documented project decisions are reduced through improved prompt guidance (FR-011). Findings appearing to contradict the PR's stated purpose are logged diagnostically but still posted unchanged (FR-014).

**Why this priority**: Patterns C (project context, 9%) and D (PR description, 12%) together account for 21% of false positives. The infrastructure (context injection) was built in v1.8.0, but prompts lacked active directives to USE the injected context. This is the highest-leverage prompt improvement available.

**Independent Test**: Configure a review against a repository whose project rules mandate "Plain CSS in a single file." Submit a large CSS file. Verify no "split this CSS file" finding appears. Submit a PR whose description states "Add Enter key handler fix" and verify the system does not flag the Enter key handler change as suspicious.

**Acceptance Scenarios**:

1. **Given** project rules stating "Plain CSS in `src/styles.css`. No modularization", **When** a large `styles.css` is reviewed, **Then** no CSS splitting/modularization finding is produced.
2. **Given** project rules documenting `0x0DD` as the canonical determinism seed, **When** code containing `const BLOCK_SEED = 0x0DD` is reviewed, **Then** no "magic number" finding is produced.
3. **Given** a PR description stating "Fix Enter key handler to exclude trigger and panel focus", **When** the Enter key handler logic change is reviewed, **Then** findings about the change may still be produced; if they appear to contradict the stated PR purpose, they are logged with a diagnostic warning and proceed to posting unchanged.
4. **Given** constants tightly coupled to adjacent code (e.g., `TIER_THRESHOLDS` next to its switch statement), **When** reviewed with project rules discouraging externalization, **Then** no "externalize constants" finding is produced.
5. **Given** a repository with no project rules file and an empty PR description, **When** a review runs, **Then** the system operates normally without errors (graceful degradation).

---

### User Story 4 — Self-Contradiction Filter Is Hardened Against Bypass (Priority: P2)

The post-processing self-contradiction filter is hardened against Unicode bypass techniques. Zero-width spaces, Unicode homoglyphs, and non-standard whitespace characters in finding messages do not evade the dismissive language detection. The filter normalizes text before pattern matching, ensuring that all variants of "no action required", "acceptable as-is", etc. are caught regardless of encoding.

**Why this priority**: The Devil's Advocate review identified that zero-width Unicode characters (U+200B, U+200C, U+200D) and Unicode line separators (U+2028) can be inserted into finding messages to bypass the existing regex patterns. While this is currently a theoretical attack vector (findings are LLM-generated), it represents a defense-in-depth gap.

**Independent Test**: Submit a finding with message containing "No\u200Baction\u200Brequired" (zero-width spaces) at info severity with no suggestion. Verify it IS filtered (bypass closed).

**Acceptance Scenarios**:

1. **Given** a finding with message "No\u200B action\u200B required" (zero-width spaces), **When** post-processing runs, **Then** the finding is filtered as self-contradicting.
2. **Given** a finding with message using Unicode line separator U+2028 between words, **When** post-processing runs, **Then** the finding is filtered.
3. **Given** a finding with standard "no action required" text, **When** post-processing runs, **Then** the finding is filtered (existing behavior preserved).
4. **Given** a warning-severity finding with Unicode-obfuscated dismissive text, **When** post-processing runs, **Then** the finding is NOT filtered (severity guard preserved).

---

### User Story 5 — Template Literal Taint Mixing Is Detected (Priority: P2)

When a safe-source constant is mixed with tainted user input inside a template literal, the vulnerability detector recognizes the mixed expression as tainted. A safe constant used alone remains safe, but combining it with any tainted interpolation in a template literal produces a tainted result.

**Why this priority**: The Devil's Advocate review identified that template literals mixing safe constants with tainted data are not properly tracked. The safe-source detector correctly rejects the constant from suppression, but the vulnerability detector fails to trace taint through the template literal's interpolated expressions.

**Independent Test**: Run the review against `const SAFE = "prefix"; const result = new RegExp(\`${SAFE}${req.body.pattern}\`);`. A finding MUST be produced. Run against `const SAFE = "prefix"; const result = new RegExp(\`${SAFE}\`);` and verify no finding is produced.

**Acceptance Scenarios**:

1. **Given** code with ``new RegExp(`${SAFE_CONST}${req.body.input}`)``, **When** analyzed, **Then** an injection finding is produced (mixed safe + tainted).
2. **Given** code with ``new RegExp(`${SAFE_CONST}`)`` where `SAFE_CONST` is a module-scope string literal, **When** analyzed, **Then** no finding is produced (pure safe template).
3. **Given** code with `` `${req.body.a}-${req.body.b}` `` passed to `eval()`, **When** analyzed, **Then** an injection finding is produced (all-tainted template).

---

### User Story 6 — Benchmark Runs as CI Release Gate with Expanded Coverage (Priority: P3)

The project's benchmark harness runs automatically in the CI pipeline as a required release gate (SC-005 enforcement). The benchmark fixture set is expanded with destructuring taint scenarios, additional true-positive preservation cases (SSRF, path traversal), and compound taint patterns. Previously skipped LLM-dependent fixtures (Patterns B/C/D) gain deterministic coverage through recorded API response snapshots, enabling full 53+ scenario execution in CI.

**Why this priority**: Without CI enforcement, the benchmark is advisory-only and can silently regress. The Benchmark Engineer identified that SC-005 (suite must pass before merge) is specified but not enforced. Additionally, 58% of fixtures are skipped in CI, creating a blind spot.

**Independent Test**: Push a commit that would cause a benchmark regression (e.g., remove safe-source detection). Verify the CI pipeline fails and blocks the merge.

**Acceptance Scenarios**:

1. **Given** the CI pipeline runs on a pull request, **When** the benchmark suite is executed, **Then** it runs all deterministic fixtures and reports pass/fail with metrics.
2. **Given** a code change that causes SC-001 (suppression rate) to drop below 85%, **When** CI runs, **Then** the pipeline fails and the PR is blocked from merging.
3. **Given** the expanded fixture set with destructuring scenarios, **When** the benchmark runs, **Then** destructuring taint detection is validated (array, object, nested, rest patterns).
4. **Given** recorded LLM response snapshots for Patterns B/C/D, **When** CI runs the benchmark, **Then** those fixtures execute deterministically using the recorded responses.
5. **Given** a new true-positive fixture for SSRF (`fetch(req.query.url)`), **When** the benchmark runs, **Then** the SSRF finding is correctly detected and scored.

---

### Edge Cases

- What happens when a destructuring pattern contains a computed property key (e.g., `const { [expr]: val } = req.body`)? The system treats computed destructuring keys conservatively — all extracted bindings are marked tainted if the source is tainted, regardless of the key expression.
- What happens when a rest element in destructuring is never used in a sink? No finding is produced (taint exists but never reaches a dangerous operation).
- What happens when a template literal contains only safe interpolations? No taint is propagated; the expression is treated as safe.
- What happens when the framework-pattern-filter encounters code that looks like Express middleware but isn't (e.g., a 4-param function not registered with `.use()`)? The filter uses default-deny semantics per the closed matcher table in FR-013. If the Required Evidence is not present (e.g., no `.use()` registration visible), the finding passes through unsuppressed. Only exact matches against the matcher table are suppressed.
- What happens when snapshot validation is required in CI but snapshots are unvalidated or newly recorded? The `benchmark-regression` job validates metadata before execution. If metadata is missing or mismatched, the job logs diagnostic output and exits code 1 (failure). Snapshots must be re-recorded locally before resubmitting the PR.
- What happens when recorded LLM response snapshots become stale (model updates change output)? The CI pipeline uses snapshot replay by default. A periodic manual `--record` pass regenerates snapshots. Stale snapshots that no longer match expected patterns are flagged as test failures, prompting re-recording.
- What happens when Unicode normalization strips characters that are semantically meaningful in non-English messages? Normalization only strips zero-width and invisible characters (U+200B-U+200F, U+2028-U+2029, U+FEFF). Visible Unicode characters (including non-Latin scripts) are preserved.
- What happens when a finding references a line that shifted due to diff context but is still valid? Stage 2 validation applies a tolerance window (documented in the finding-validation contract) before dropping line-mismatched findings.

## Requirements _(mandatory)_

### Functional Requirements

**Workstream 1: Destructuring Taint Tracking**

- **FR-001**: The taint tracking system MUST propagate taint through object destructuring in variable declarations (`const { a, b } = taintedSource`). Each extracted binding that could receive tainted data MUST be registered as tainted in the scope stack.
- **FR-002**: The taint tracking system MUST propagate taint through array destructuring in variable declarations (`const [a, b] = taintedSource`). Each extracted element that could receive tainted data MUST be registered as tainted.
- **FR-003**: The taint tracking system MUST propagate taint through destructuring in assignment expressions (`[a, b] = taintedSource` and `({ a } = taintedSource)`) where variables are declared separately. This covers BinaryExpression nodes where the left-hand side is an ArrayLiteralExpression or ObjectLiteralExpression.
- **FR-004**: The taint tracking system MUST propagate taint through renamed property destructuring (`const { original: renamed } = taintedSource`) — the taint attaches to the local binding name (`renamed`), not the property key.
- **FR-005**: The taint tracking system MUST propagate taint through rest elements (`const [first, ...rest] = taintedSource` and `const { a, ...rest } = taintedSource`). The rest binding MUST be treated as tainted.
- **FR-006**: The taint tracking system MUST propagate taint through nested destructuring patterns (`const { a: { b } } = taintedSource`). Taint MUST flow through all nesting levels.
- **FR-007**: The taint tracking system MUST isolate destructured bindings by scope. A destructured binding `{ data }` from a tainted source in one scope MUST NOT affect a same-named binding from a safe source in a different scope.

**Binding-Level Taint Semantics for Mixed Sources** (applies to FR-001 through FR-007):

- When destructuring from an **array or object literal** with both safe and tainted elements (e.g., `const [safe, tainted] = ["literal", req.body.x]`), taint MUST be evaluated **per-binding**: `safe` receives no taint, `tainted` is marked tainted. This prevents over-tainting when the source structure is statically knowable.
- When destructuring from a **tainted expression** that is not a literal (e.g., `const { a, b } = req.body`, `const [x, y] = getUserInput()`), **all extracted bindings MUST be conservatively marked tainted**, regardless of property names or positions. This applies to object, array, renamed, rest, and nested destructuring patterns.
- When destructuring from a **safe constant source** qualifying under existing Pattern 1 criteria (e.g., `const [x, y] = SAFE_CONST_ARRAY`), the extracted bindings inherit the safe-source classification and MUST NOT be registered as tainted.

- **FR-008**: ~~REMOVED — Non-Goal.~~ The safe-source detector does NOT recognize destructuring from object literal sources in this release. Object literals are excluded from safe-source Pattern 1 due to runtime property mutability. Extending Pattern 1 to support frozen-object or immutable-by-contract semantics is out of scope for this feature and deferred to a future design cycle. **Note**: This does not conflict with US1 Acceptance Scenario 6 — that scenario is resolved by the Binding-Level Taint Semantics "per-binding for literals" tier (taint tracker evaluates each binding against its literal initializer), NOT by Pattern 1 safe-source classification.
- **FR-009**: The mutation tracking system MUST detect mutations to variables via destructuring assignment targets. If a variable previously identified as safe is later assigned via destructuring from a tainted source, its safe status MUST be revoked.

**Workstream 2: Prompt & Deterministic Filter Hardening**

- **FR-010**: All review agent prompts MUST include identification guidance for framework conventions — not just "don't flag X" suppression rules, but concrete recognition criteria (e.g., "If a function has exactly 4 parameters and is registered as Express middleware via `.use()`, recognize it as an error handler").
- **FR-011**: All review agent prompts MUST include an explicit directive to consult the "Project Rules" section before generating findings about code organization, constant placement, architectural patterns, or style choices. The directive MUST appear before the output format section.
- **FR-012**: All review agent prompts MUST include an explicit directive to consult the "PR Description" section before generating findings. The directive MUST guide agents to recognize findings that would flag the exact changes described in the PR purpose as likely false positives and to re-evaluate severity or suppress generation of such findings. This is a prompt guidance requirement only — no deterministic post-processing filtering of PR-matching findings is performed.
- **FR-013**: A deterministic post-processing framework pattern filter MUST be implemented that catches Pattern B false positives after LLM review and before posting. **Pipeline placement**: The filter runs during Stage 1 validation (semantic-only, no diff context required), after self-contradiction filtering (FR-015) and before Stage 2 diff-bound validation. It receives the original diff content for evidence validation (e.g., verifying `.use()` registration is visible in the diff). The filter operates on **default-deny** semantics with a closed, auditable matcher table:

  | Matcher                  | Pattern Recognition Criteria                                     | Required Evidence                                           | Suppresses                                |
  | ------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
  | Express Error Middleware | Function has exactly 4 parameters AND is registered via `.use()` | `.use()` call visible in same file; all 4 params present    | "unused parameter" findings on params 3-4 |
  | TypeScript Unused Prefix | Parameter name matches `/^_\w+$/`                                | No other binding with that name in scope                    | "unused variable/parameter" findings      |
  | Exhaustive Switch        | `default` case contains `assertNever(x)` or exhaustive throw     | `assertNever` call or throw referencing switch discriminant | "missing case" findings on the default    |

  Any finding matching a matcher's Recognition Criteria AND providing the Required Evidence MUST be suppressed with reason logged at diagnostic level. All other findings pass through unchanged. This matcher table is **closed** — additions require a spec amendment. No "confidence threshold" heuristic is used; matchers either fully match or do not match.

- **FR-014**: The post-processing validation pipeline MAY extract explicit contradiction signals from PR descriptions (exact phrases matching patterns like "Add X", "Fix Y", "Remove Z") and use these ONLY for diagnostic logging when a finding message appears to contradict such signals. **No findings are suppressed based on PR description** — all findings MUST proceed to the code hosting platform regardless of PR purpose. This is a diagnostic/observability feature only.

**Workstream 3: Security Hardening & Benchmark CI**

- **FR-015**: The self-contradiction detection regex patterns MUST normalize input text before matching by stripping Unicode zero-width characters (U+200B Zero Width Space, U+200C Zero Width Non-Joiner, U+200D Zero Width Joiner, U+200E Left-to-Right Mark, U+200F Right-to-Left Mark, U+FEFF Byte Order Mark) and Unicode line/paragraph separators (U+2028, U+2029).
- **FR-016**: The vulnerability detector MUST detect taint flow through template literal expressions. When a template literal contains any tainted interpolation (`${taintedVar}`), the entire template expression MUST be treated as tainted, even if other interpolations are safe constants. **Intentional non-goal**: Sanitization functions (`sanitize()`, `encodeURIComponent()`, etc.), encoding helpers, and allowlisted validators do NOT break taint in this release. Expressions like `` `${sanitize(req.body.input)}` `` are treated as tainted. This is conservative by design, consistent with the safe-source principle "when in doubt, treat as tainted." A future release may introduce an explicit sanitizer registry; implementers MUST NOT attempt ad-hoc taint-breaking based on function names in this version.
- **FR-017**: A required CI job named `benchmark-regression` MUST run on all pull requests targeting main. This job executes all deterministic fixtures (Patterns A and E, plus new destructuring and TP-preservation fixtures) and fails if any fixture produces unexpected findings or misses expected findings. Failure MUST block merge via branch protection required status check. Replay-mode fixtures (Patterns B/C/D/F — LLM-dependent with recorded snapshots) MAY run in the same job for visibility reporting but MUST NOT block merge until snapshot stability is validated in a subsequent release.
- **FR-018**: The benchmark fixture set MUST be expanded to include at least 6 destructuring taint scenarios (array, object, renamed, rest, nested, scope-isolated) as Pattern A extensions.
- **FR-019**: The benchmark fixture set MUST include at least 2 additional SSRF true-positive preservation cases and 1 additional path-traversal true-positive case.
- **FR-020**: The benchmark adapter MUST support a recorded-response mode where LLM API responses are loaded from snapshot files instead of making live API calls, enabling deterministic CI execution of Patterns B/C/D/F fixtures. Each snapshot file MUST include metadata headers: prompt-template content hash, model ID and provider, and fixture content hash. On load, the adapter MUST validate snapshot metadata against current state; any metadata mismatch (drift detected) MUST fail the benchmark with diagnostic output identifying which snapshot is stale and what changed.
- **FR-021**: The recorded-response mode MUST include a `--record` CLI flag that captures live LLM responses and saves them as snapshot files with metadata headers for subsequent deterministic replay. Re-recording MUST be required when prompt templates or model configuration change; the CI job MUST reject snapshots with mismatched metadata.

### Key Entities

- **Destructuring Binding**: A variable name extracted from a destructuring pattern (object property, array element, renamed property, rest element, or nested binding). The unit that receives or does not receive taint from the destructured source.
- **Framework Pattern Rule**: A deterministic recognition rule for common framework conventions, defined by a closed matcher table (FR-013) with explicit recognition criteria, required evidence, and default-deny semantics. Currently covers Express Error Middleware, TypeScript Unused Prefix, and Exhaustive Switch matchers.
- **PR Intent**: Explicit action signals extracted from the PR title and description (e.g., "Add X", "Fix Y", "Remove Z"), used only for diagnostic logging when findings appear to contradict stated PR changes. No findings are suppressed based on PR intent.
- **Recorded Response Snapshot**: A captured LLM API response for a specific benchmark scenario, stored as a file and replayed during deterministic CI execution.
- **Unicode-Normalized Text**: Finding message text with invisible Unicode characters stripped, used as input to the self-contradiction regex matching.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The vulnerability detector detects taint flow through all 6 enumerated destructuring patterns in the benchmark fixture set (object, array, renamed, rest, nested, scope-isolated) — verified by dedicated test cases that all pass. This guarantees coverage for documented patterns from issues #158-161 and #164; it does not claim universal bypass-proof coverage for all possible destructuring edge cases.
- **SC-002**: Scope isolation is maintained for destructured bindings — a tainted destructured variable in one scope does not contaminate a same-named safe binding in another scope, verified by dedicated test.
- **SC-003**: At least 18 of the 27 previously skipped benchmark fixtures (Patterns B/C/D/F) become deterministic and pass in CI, representing a coverage increase from 30% to at least 64% of all fixtures.
- **SC-004**: The deterministic framework pattern filter is validated against a fixed benchmark set of 15 scenarios: 10 Pattern B false positives (conventions that should be suppressed) and 5 true positives (genuine bugs that resemble conventions). The filter MUST suppress at least 8 of the 10 false positives AND preserve all 5 true positives (zero incorrect suppressions). Results reported as "X/10 FP suppressed, Y/5 TP preserved" in test output. Maximum allowed incorrect suppressions: 0.
- **SC-005**: Unicode zero-width space bypass of the self-contradiction filter is closed — validated by test cases using U+200B, U+200C, U+200D, U+2028, and U+FEFF in finding messages.
- **SC-006**: Template literal taint mixing is detected — verified by test cases where safe constants are mixed with tainted input in template expressions.
- **SC-007**: The benchmark suite runs as a required CI release gate (SC-005 from the original spec). A benchmark regression blocks merge to main.
- **SC-008**: Zero existing test regressions across all changes — the full test suite (3887+ tests) continues to pass.
- **SC-009**: The expanded benchmark fixture set includes at least 6 destructuring scenarios, 2 additional SSRF fixtures, and 1 additional path-traversal fixture, bringing total fixtures to 62+.
- **SC-010**: Recorded LLM response snapshots enable deterministic CI execution of at least 10 previously LLM-dependent fixtures.
