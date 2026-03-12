# Research: False Positive Gap Closure

**Branch**: `411-fp-gap-closure` | **Date**: 2026-03-12

## R-001: Destructuring Taint Tracking Extension

**Decision**: Extend `trackTaint()` in vulnerability-detector.ts to handle destructuring assignment targets (ArrayLiteralExpression and ObjectLiteralExpression on the LHS of BinaryExpression), add `extractBindingsFromAssignmentTarget()` to scope-stack.ts, and extend `collectMutatedBindings()` in safe-source-detector.ts.

**Rationale**: The current `trackTaint()` at lines 685-709 only handles `ts.isIdentifier(node.left)` for BinaryExpression nodes. This means `[a, b] = [req.body.x, "safe"]` and `({data} = req.body)` silently skip taint propagation. Meanwhile, `extractBindingNames()` in scope-stack.ts (lines 89-108) **already fully supports** destructuring for VariableDeclaration — it handles ObjectBindingPattern, ArrayBindingPattern, renamed properties, rest elements, and nesting. The gap is exclusively in the assignment expression path.

**Alternatives considered**:

- **Option A: Extend extractBindingNames() for Expression patterns** — Reuse the existing function by converting Expression patterns (ArrayLiteralExpression, ObjectLiteralExpression used as assignment targets) to their BindingPattern equivalents. Rejected: too fragile, different AST node types.
- **Option B: New extractBindingsFromAssignmentTarget() function** — Create a parallel function specifically for Expression-based destructuring targets (BinaryExpression LHS). Adopted: cleaner separation, handles the different AST structure (ArrayLiteralExpression elements vs ArrayBindingPattern elements).
- **Option C: Rewrite trackTaint() to unify both paths** — Factor out a common binding extractor. Rejected: over-engineering, risk of regressions in the existing working path.

**Key findings**:

- `extractBindingNames()` (scope-stack.ts:89-108): Handles `ts.isObjectBindingPattern`, `ts.isArrayBindingPattern`, recursion, rest elements. Proven and tested.
- `trackTaint()` (vulnerability-detector.ts:685-709): BinaryExpression block checks `ts.isIdentifier(node.left)` only. No fallback for complex LHS.
- `collectMutatedBindings()` (safe-source-detector.ts:413-455): Only detects `ts.isIdentifier(node.left)`, `ts.isElementAccessExpression(node.left)`, `ts.isPropertyAccessExpression(node.left)`. Missing destructuring.
- `findAssignedBinding()` (safe-source-detector.ts:464-513): Bails at template expressions (line 500) — correct conservative behavior.
- TypeScript AST: Assignment destructuring uses `ArrayLiteralExpression`/`ObjectLiteralExpression` (not `ArrayBindingPattern`/`ObjectBindingPattern` which are for declarations).

**Binding-Level Taint Semantics implementation**:

1. **Per-element for literals**: When RHS is ArrayLiteralExpression or ObjectLiteralExpression, evaluate each element's taint individually. `[a, b] = [req.body.x, "safe"]` → a is tainted, b is not.
2. **Conservative-all for expressions**: When RHS is any other expression (PropertyAccessExpression like `req.body`, CallExpression like `getUserInput()`), all extracted bindings are tainted.
3. **Safe for Pattern 1**: When RHS resolves to a safe constant array/variable (per safe-source-detector), extracted bindings inherit safe status.

**Risk**: Nested destructuring depth could cause performance issues.
**Mitigation**: Limit recursion depth to 10 levels (matching existing analysis depth limit).

---

## R-002: Framework Pattern Filter Architecture

**Decision**: Create new `framework-pattern-filter.ts` in `router/src/report/` implementing the closed matcher table from FR-013. Integrate into Stage 1 validation in `processFindings()` (report.ts), after `validateFindingsSemantics()` and before `sortFindings()`.

**Rationale**: The three matchers (Express Error Middleware, TypeScript Unused Prefix, Exhaustive Switch) all rely on structural/syntactic evidence from the diff content — not on line resolution or path normalization. Stage 1 is the correct placement because: (1) it's platform-independent, (2) findings haven't been normalized yet so original file paths are preserved, (3) self-contradiction filtering already ran so we don't duplicate that work.

**Alternatives considered**:

- **Option A: Integrate into finding-validator.ts** — Add matchers to existing validation. Rejected: finding-validator handles content-based filtering (severity + message patterns), while framework matchers need diff content for evidence validation. Different concerns.
- **Option B: Integrate into Stage 2 (normalizeAndValidateFindings)** — Run after normalization. Rejected: would run twice (GitHub + ADO), and line renormalization is unnecessary for structural pattern matching.
- **Option C: Run before Stage 1** — Insert between sanitization and semantic validation. Rejected: no benefit over post-Stage-1, and would add filtered findings to Stage 1 stats.

**Key findings**:

- Report pipeline flow: `deduplicateFindings → sanitizeFindings → validateFindingsSemantics → [INSERT HERE] → sortFindings`
- Insertion point: report.ts line 82-83, after `const validated = validationResult.validFindings`
- Diff content available via `_diffFiles` parameter (currently unused in processFindings, passed through)
- Each matcher needs: finding message (regex match), diff content (evidence scan)

**Matcher implementation design**:

```
FrameworkPatternMatcher {
  id: string;
  name: string;
  messagePattern: RegExp;          // What finding message triggers evaluation
  evidenceValidator(finding, diffContent): boolean;  // Does structural evidence exist?
  suppressionReason: string;       // Logged diagnostic reason
}
```

- Express Error Middleware: `messagePattern: /unused.*param|remove.*(_next|_err|_req|_res)/i`, evidence: scan diff for `.use(` + 4-param function in same file
- TypeScript Unused Prefix: `messagePattern: /unused.*(variable|parameter|binding)/i`, evidence: finding.file has identifier matching `/^_\w+$/` at the cited line
- Exhaustive Switch: `messagePattern: /missing.*case|unhandled.*case/i`, evidence: `assertNever` or exhaustive throw in default case visible in diff

---

## R-003: Unicode Normalization for Self-Contradiction Detection

**Decision**: Add a `normalizeUnicode()` helper function to finding-validator.ts that strips zero-width and invisible characters before DISMISSIVE_PATTERNS matching. Apply to both Stage 1 and Stage 2 self-contradiction checks.

**Rationale**: The Devil's Advocate review identified that zero-width characters (U+200B-U+200F, U+2028-U+2029, U+FEFF) can break word boundaries in regex patterns. For example, "No\u200Baction\u200Brequired" would not match `/\bno action required\b/i` because the zero-width space breaks the word boundary.

**Alternatives considered**:

- **Option A: Modify regex patterns to be Unicode-aware** — Use Unicode property escapes (`\p{Zs}` etc.). Rejected: would make patterns complex and hard to maintain.
- **Option B: Normalize at sanitization phase** — Strip in sanitize.ts before validation. Rejected: sanitization is for security threats (null bytes, dangerous URLs), not for content normalization. Different concerns.
- **Option C: Normalize inline in each check** — Adopted: simple `normalizeUnicode()` function applied to message and suggestion text before matching.

**Characters to strip**:

| Codepoint | Name                                        | Hex Escape |
| --------- | ------------------------------------------- | ---------- |
| U+200B    | Zero Width Space                            | `\u200B`   |
| U+200C    | Zero Width Non-Joiner                       | `\u200C`   |
| U+200D    | Zero Width Joiner                           | `\u200D`   |
| U+200E    | Left-to-Right Mark                          | `\u200E`   |
| U+200F    | Right-to-Left Mark                          | `\u200F`   |
| U+2028    | Line Separator                              | `\u2028`   |
| U+2029    | Paragraph Separator                         | `\u2029`   |
| U+FEFF    | Byte Order Mark / Zero Width No-Break Space | `\uFEFF`   |

**Implementation**: Single regex replacement: `/[\u200B-\u200F\u2028\u2029\uFEFF]/g` → `''`

---

## R-004: Template Literal Taint Detection

**Decision**: Extend `findTaintInExpression()` in vulnerability-detector.ts to recursively check all template spans (interpolated expressions) within `ts.isTemplateExpression` nodes. If any span contains a tainted identifier, the entire template is tainted.

**Rationale**: Currently, template literals are treated as opaque nodes — `findTaintInExpression()` recurses through children generically but doesn't specifically handle template span taint. The safe-source-detector correctly bails at template expressions (line 500, returns null), but the vulnerability-detector needs to positively detect taint flow through interpolations.

**Alternatives considered**:

- **Option A: Handle in findAffectedVariable()** — Check template spans when resolving sink connections. Rejected: too late in the pipeline, taint should be registered at propagation time.
- **Option B: Handle in trackTaint() directly** — Add template literal taint registration. Rejected: trackTaint processes assignments, not expressions in sinks. findTaintInExpression is the right abstraction.
- **Option C: Add specific TemplateExpression handler in findTaintInExpression()** — Adopted: iterate over `node.templateSpans`, check each `span.expression` for taint. Clean and minimal.

**Key findings**:

- TypeScript AST for template literals:
  - `ts.isTemplateExpression(node)`: `` `head${expr1}middle${expr2}tail` ``
  - `node.head`: The TemplateHead (`` `head${ ``)
  - `node.templateSpans`: Array of TemplateSpan, each with `.expression` and `.literal`
- `findTaintInExpression()` (lines 769-799): Currently does generic child recursion. Needs explicit `ts.isTemplateExpression` branch to check each span expression.
- Safe-source-detector already handles this correctly by returning null for template expressions (conservative = tainted).

---

## R-005: Benchmark CI Job Integration

**Decision**: Add a new `benchmark-regression` job to `.github/workflows/ci.yml` that runs all deterministic benchmark fixtures (Patterns A, E, destructuring, TP-preservation) as a required status check. Replay-mode fixtures (Patterns B/C/D/F) run for visibility but don't block merge.

**Rationale**: The benchmark test file exists (`false-positive-benchmark.test.ts`, 512 lines, 53 scenarios) but is not integrated into the CI pipeline. The `quality` job runs `pnpm --filter ./router test:ci:coverage` which includes the benchmark but: (1) skipped patterns produce no gate signal, (2) release gate metrics (SC-001 through SC-007) are assertions within the test but aren't surfaced as CI status.

**Alternatives considered**:

- **Option A: Add benchmark to existing `quality` job** — Run as part of the test suite. Rejected: benchmark has 15s timeouts per scenario, would add ~7 minutes to the quality job.
- **Option B: Separate `benchmark-regression` job** — Adopted: runs in parallel with quality, independent timeout, clear CI status name for branch protection.
- **Option C: Scheduled-only benchmark** — Run nightly, not per-PR. Rejected: violates FR-017 which requires benchmark as merge gate.

**CI job design**:

```yaml
benchmark-regression:
  runs-on: ubuntu-latest
  needs: [quality] # Needs quality to pass first (compilation check)
  timeout-minutes: 15
  steps:
    - checkout
    - pnpm install
    - pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts
```

**Branch protection**: Add `benchmark-regression` as required status check for `main` branch.

**Performance estimate**: 16 deterministic scenarios × 15s = 240s worst case, plus 10+ TP scenarios × 15s = 150s. Total: ~7 minutes with margin.

---

## R-006: Recorded Response Snapshot Architecture

**Decision**: Extend the benchmark adapter (`adapter.ts`) with a `SnapshotAdapter` mode that loads pre-recorded LLM responses from JSON files. Each snapshot file contains metadata headers (prompt hash, model ID, fixture hash) for drift detection. A `--record` CLI flag captures live responses.

**Rationale**: 27 of 53 fixtures (Patterns B/C/D/F) are skipped because they require LLM interaction. Recorded snapshots enable deterministic CI execution without API keys or network access. Metadata headers prevent stale snapshots from silently passing.

**Alternatives considered**:

- **Option A: Mock LLM adapter with hardcoded responses** — Inline fixture responses. Rejected: brittle, hard to maintain, doesn't detect prompt drift.
- **Option B: Full LLM mock with response templates** — Template-based response generation. Rejected: over-engineering, doesn't capture real LLM behavior.
- **Option C: Recorded response snapshots with metadata** — Adopted: captures real responses, metadata enables drift detection, simple file-based storage.

**Snapshot file format**:

```json
{
  "metadata": {
    "recordedAt": "2026-03-12T10:00:00Z",
    "promptTemplateHash": "sha256:abc123...",
    "modelId": "claude-sonnet-4-5-20250514",
    "provider": "anthropic",
    "fixtureHash": "sha256:def456...",
    "adapterVersion": "1.0.0"
  },
  "response": {
    "findings": [...],
    "rawOutput": "..."
  }
}
```

**Drift detection**: On load, compute current prompt template hash and fixture content hash. If either differs from metadata, fail with diagnostic output naming the stale snapshot and what changed.

**Storage location**: `router/tests/fixtures/benchmark/snapshots/` — one file per scenario ID.

---

## R-007: Prompt Active Directives (FR-011/FR-012)

**Decision**: Add explicit "Active Context Directives" sections to all 3 prompt files (`semantic_review.md`, `opencode_system.md`, `pr_agent_review.md`) between "Framework & Language Conventions" and "Output Format". These directives instruct the LLM to CHECK project rules and PR description sections BEFORE generating findings.

**Rationale**: Context injection (project rules, PR description) was implemented in v1.8.0 but prompts lack explicit directives to USE the context. The LLM sees the context but may not prioritize consulting it. Active directives make context consultation a required step in the review process.

**Alternatives considered**:

- **Option A: System prompt directives** — Add to system prompt. Rejected: system prompts already at capacity.
- **Option B: User prompt preamble** — Add before diff content. Rejected: inconsistent with prompt template structure.
- **Option C: Dedicated section in prompt template** — Adopted: clean, auditable, follows existing section structure.

**Directive content (for all 3 prompts)**:

```markdown
### Active Context Directives

Before generating any findings:

1. **CHECK Project Rules** (if the "Project Rules" section is present above):
   - Read ALL project rules before evaluating code organization, constant placement, or architecture
   - Do NOT generate findings that contradict documented project decisions
   - If a project rule explicitly permits a pattern, do NOT flag that pattern

2. **CHECK PR Description** (if the "PR Description" section is present above):
   - Read the PR title and description to understand the author's stated intent
   - Re-evaluate any finding that flags the exact change described in the PR purpose
   - If the PR description explains WHY a change was made, factor that into severity assessment
```

**Prompt files affected**:

- `config/prompts/semantic_review.md` — after line 76 (Framework Conventions), before Output Format
- `config/prompts/opencode_system.md` — same position
- `config/prompts/pr_agent_review.md` — same position

**Hardcoded fallback sync**: The 3 agent source files (`opencode.ts`, `ai_semantic_review.ts`, `pr_agent.ts`) contain hardcoded fallback prompts that lack Framework Conventions AND Active Context Directives. These fallbacks must be updated to include at minimum a summary of both sections.
