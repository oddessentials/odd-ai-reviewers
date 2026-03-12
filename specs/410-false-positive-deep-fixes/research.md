# Research: False Positive Deep Fixes & Benchmark Integration

**Branch**: `410-false-positive-deep-fixes` | **Date**: 2026-03-11

## R-001: Safe-Source Recognition Architecture

**Decision**: Implement safe-source detection as a **filter step between findSources() and trackTaint()** in `vulnerability-detector.ts` analyze(), with declarative patterns in a new `safe-source-patterns.ts` file mirroring the existing `mitigation-patterns.ts` architecture.

**Rationale**: The existing taint-tracking flow is: findSinks() → findSources() → trackTaint() → findAffectedVariable() → generateFinding(). The new step inserts at line ~212 in analyze(), after findSources() returns DetectedSource[] and before trackTaint() consumes them. This prevents false taint from propagating through the entire chain.

**REVISION (post-review)**: Original plan said "filter in findSources()". Corrected to "filter AFTER findSources() returns, BEFORE trackTaint() is called" — findSources() only collects sources into an array, so filtering happens on the returned array, not inside the function itself.

**Alternatives considered**:

- **Option A: Modify trackTaint() only** — Would require safe-source checks at every assignment. More complex, less efficient. Rejected.
- **Option B: New safe-source-detector.ts as parallel class** — Better separation of concerns but requires coordination between two detectors. Adopted as hybrid: declarative patterns in separate file, detection logic integrated into vulnerability-detector.ts.
- **Option C: Mitigation-level suppression** — Treat safe sources as mitigations. Rejected because safe sources prevent taint entirely (no finding generated), while mitigations reduce severity of existing findings.

**Key findings**:

- SOURCE_PATTERNS (vulnerability-detector.ts:126-147) only define user-controlled taint sources. No complementary safe-source list exists.
- findSources() (lines 381-401) uses recursive AST visitor with ts.isPropertyAccessExpression and ts.isElementAccessExpression.
- trackTaint() (lines 509-562) initializes tainted variables from detected sources, then propagates through assignments.
- findAffectedVariable() (lines 589-620) connects sinks to tainted data via regex matching.
- Mitigation patterns architecture (mitigation-patterns.ts) provides a proven declarative pattern model with id, name, description, match criteria, confidence.

**Safe source categories confirmed**:

1. **Constant literals** (FR-001): Module-scope `const` with string/number/array-of-literals initializers. Check via ts.isVariableDeclaration with ts.NodeFlags.Const, parent is SourceFile or ModuleBlock.
2. **Built-in directory refs** (FR-002): `__dirname`, `__filename`, `import.meta.dirname`, `import.meta.url`. Check via ts.isIdentifier matching known names.
3. **Safe directory listings** (FR-003): `fs.readdirSync(safeArg)` where safeArg is constant or \_\_dirname-relative. Check via ts.isCallExpression with safe argument tracing.
4. **Constant array indexing** (FR-004): `CONST_ARRAY[i]` where CONST_ARRAY is a safe constant. Check via ts.isElementAccessExpression with safe array tracing.

**Risk**: Array mutation through aliases (`const ref = SAFE; ref[0] = userInput`).
**Mitigation (REVISED post-review)**: Only trust **direct literal initializers** on module-scope const declarations. Explicitly exclude: aliases (`const Y = X`), function returns, imports, template literals with interpolation, object literals (mutable properties). If the const variable name appears on the LHS of any assignment expression elsewhere in the file, revoke safe status. See updated safe-source-patterns contract for full exclusion list.

**FR-005 REMOVED (post-review)**: Test-file severity downgrade was removed from the spec. Filename-based severity reduction is a policy footgun that normalizes real security issues in test files, fixtures, and sample apps. Severity reflects inherent risk, not file location.

---

## R-002: Agent Context Enrichment Pipeline

**Decision**: Extend AgentContext with `prDescription?: string` and `projectRules?: string` fields. Load PR description from GitHub/ADO API during context assembly in main.ts. Load project rules from CLAUDE.md (or configurable path) via new `context-loader.ts` module.

**Rationale**: Patterns C and D (21% of false positives combined) are caused by agents lacking PR description and project rules. Injecting this context into the user prompt template allows LLM agents to avoid contradicting documented decisions.

**Alternatives considered**:

- **Option A: Pass context as system prompt** — Rejected; system prompts are already at capacity with Core Rules and False Positive Prevention.
- **Option B: Separate API call per agent** — Rejected; violates efficiency principle and could hit rate limits. Single fetch in context assembly, shared across agents.
- **Option C: Environment variable injection** — Rejected; size limits on env vars, not suitable for multi-paragraph content.

**Key findings**:

- AgentContext (types.ts:330-357) currently has: repoPath, diff, files, config, diffContent, prNumber, env, effectiveModel, provider.
- prNumber already exists but no title/body. trust.ts PullRequestContext has number but not description.
- PR description available via: GitHub payload (`pull_request.body`, `pull_request.title`) in CI, or via Octokit API fetch for local review.
- Project rules: No CLAUDE.md loading exists. Model after existing reviewignore.ts (lines 241-310) for file loading.
- Token budget: LimitsSchema max_tokens_per_pr defaults to 12000 tokens. Estimation at 1 token ≈ 4 chars. FR-010 truncation: projectRules truncated first, then prDescription, when combined context exceeds 90%.

**REVISION (post-review)**: Added mandatory sanitization for prDescription and projectRules before injection. These are user-controlled content and may contain prompt injection attempts, null bytes, or control characters. context-loader.ts MUST: (1) strip null bytes, (2) limit prDescription to 2000 chars and projectRules to configurable limit, (3) escape control characters. This is critical — PR descriptions on fork PRs are attacker-controlled.

**REVISION (post-review)**: FR-009 changed from "agents MUST consider" (untestable) to "router MUST inject context into user prompt template" (observable, verifiable). The router ensures context is structurally present; we don't rely on LLM behavior to "consider" it.

**Prompt injection points confirmed**:

- opencode.ts buildReviewPrompt (lines 114-138): Add "PR Description" and "Project Rules" sections before "Diff Content"
- ai_semantic_review.ts (lines 250-271): Same pattern
- pr_agent.ts (lines 229-251): Same pattern

**Context loading design**:

- New `context-loader.ts` with: `loadProjectRules(repoPath: string): Promise<string | undefined>` and `loadPRDescription(prNumber: number, env: Record<string, string | undefined>): Promise<string | undefined>`
- Graceful degradation: If CLAUDE.md missing → undefined. If PR description unavailable → undefined.
- Truncation: If combined length exceeds budget, truncate projectRules with "(truncated)" indicator.

---

## R-003: Post-Processing Finding Validation

**Decision**: Create new `finding-validator.ts` module in `router/src/report/` that runs after sanitization and before dispatch. Two validation passes: (1) line number validation using existing LineResolver, (2) self-dismissing language detection via regex matching.

**Rationale**: Pattern E (9% of false positives) produces self-contradicting findings. Existing sanitize.ts only handles security threats (null bytes, dangerous URLs). No content validation exists.

**Alternatives considered**:

- **Option A: Extend sanitize.ts** — Rejected; sanitization and content validation are different concerns. Sanitization removes dangerous content; validation filters low-quality content.
- **Option B: Per-agent validation** — Rejected; violates Router Owns All Posting principle. Centralized validation ensures consistency.
- **Option C: LLM-based validation** — Rejected; adds latency and cost. Regex-based filtering is deterministic and fast.

**Key findings**:

- Report pipeline (report.ts:54-130): processFindings() → sanitizeFindings() → sortFindings() → dispatchReport().
- LineResolver (line-resolver.ts:227-434) already exists with validateLine(), hasFile(), isDeleted(), remapPath().
- Already built at github.ts:172 for drift signal computation. Can be reused by constructing earlier.
- Self-dismissing phrases from spec: "no action required", "acceptable as-is", "not blocking", "no change needed". Additional patterns from issue analysis: "minor concern", "not a real issue", "can be ignored".

**Validation pipeline design**:

1. Build LineResolver from diff files (reuse existing buildLineResolver)
2. For each finding:
   a. Line validation: If finding.line exists and finding.file is in diff, validate line is within diff range
   b. Self-dismissing check: Regex match against message and suggestion fields
   c. Record: { finding, valid: boolean, filterReason?: string }
3. Return: { validFindings: Finding[], filtered: FilteredFinding[] }
4. Log filtered findings at diagnostic level with reasons (FR-013)

**Insertion point**: Between sanitizeFindings() (report.ts:69) and sortFindings(). New call: `validateFindings(sanitized, lineResolver)`.

---

## R-004: Framework Convention Prompt Rules

**Decision**: Add a "Framework Conventions" section to all 3 main prompt files (semantic_review.md, opencode_system.md, pr_agent_review.md) with explicit rules for Express middleware, React Query, Promise.allSettled, TypeScript \_prefix, and exhaustive switches. Also add externalization suppression rule (FR-016).

**Rationale**: Pattern B (12% of false positives) is caused by agents lacking framework-specific knowledge. Prompt hardening (409) established Core Rules and False Positive Prevention but did not cover framework conventions.

**Alternatives considered**:

- **Option A: Dynamic framework detection** — Detect frameworks from package.json and inject relevant rules. Rejected for now; over-engineering. Static rules covering common frameworks are sufficient.
- **Option B: Separate framework prompt files** — One prompt per framework. Rejected; adds complexity. A single "Framework Conventions" section keeps prompts manageable.

**Key findings**:

- Current prompts have Core Rules (4 rules) and False Positive Prevention (6 categories). Only assertNever is mentioned (semantic_review.md line 39).
- Missing conventions confirmed: Express 4-param error MW, React Query dedup, Promise.allSettled ordering, TS \_prefix, exhaustive switch/assertNever (general).
- Hardcoded fallback prompts in agents drift from file-based prompts. Fallbacks lack False Positive Prevention sections entirely.
- architecture_review.md exists but has no agent implementation. Include for completeness but low priority.

**Prompt update plan**:

- New section "### Framework & Language Conventions" placed after "False Positive Prevention" and before "Output Format"
- 6 rules covering: Express error MW, React Query dedup, Promise.allSettled order, TS \_prefix, exhaustive switch/assertNever, constant externalization
- Update hardcoded fallbacks in opencode.ts, ai_semantic_review.ts, pr_agent.ts to include summary of conventions

---

## R-005: Benchmark Harness Architecture

**Decision**: Implement benchmark as a Vitest integration test suite (`false-positive-benchmark.test.ts`) with JSON fixture files organized by pattern category. Scoring module computes precision/recall/F1/FPR. Optional CLI command (`ai-review benchmark`) for standalone execution.

**Rationale**: The existing `control_flow-benchmark.test.ts` provides a proven pattern for parametrized benchmark testing in Vitest. Using the same framework ensures consistency and avoids new dependencies. The CLI command enables CI integration and manual runs.

**Alternatives considered**:

- **Option A: Standalone benchmark tool** — Separate binary with its own CLI. Rejected; adds build complexity and violates simplicity.
- **Option B: Integration via code-review-benchmark (external)** — Direct integration with withmartian/code-review-benchmark. Deferred; design adapter interface now, implement external integration later when format stabilizes.
- **Option C: Pure unit tests** — Test each component separately. Rejected; regression suite needs end-to-end validation through the full pipeline.

**Key findings**:

- LocalReviewDependencies DI (local-review.ts:83-123): `getLocalDiff`, `executeAllPasses`, `reportToTerminal` are all injectable.
- JsonOutput (terminal.ts:197-225): schema_version "1.0.0", summary with counts, findings[], partialFindings[], passes[].
- Existing fixtures: redos-corpus/v1.json (pattern-based), golden.json (end-to-end with diff + config + expected findings).
- control_flow-benchmark.test.ts (lines 24-453): Vitest pattern with describe blocks, parametrized tests, performance assertions.

**Benchmark fixture format** (merged from both existing patterns):

```json
{
  "id": "410-pattern-a-001",
  "category": "safe-source",
  "pattern": "A",
  "description": "RegExp from hardcoded constant array",
  "source_issue": "#158.1",
  "diff": "diff --git a/src/validators.ts ...",
  "config": { "passes": [...] },
  "expectedFindings": [],
  "truePositive": false
}
```

**Scoring formulas**:

- Precision = TP / (TP + FP)
- Recall = TP / (TP + FN)
- F1 = 2 _ Precision _ Recall / (Precision + Recall)
- FPR = FP / (FP + TN)

Where:

- TP: Expected finding present AND actual finding produced
- FP: No expected finding BUT actual finding produced (false positive)
- TN: No expected finding AND no actual finding (correct suppression)
- FN: Expected finding present BUT no actual finding (missed detection)

**CLI command design**:

- `ai-review benchmark --fixtures <path> [--output <path>] [--verbose]`
- Follows existing Commander.js pattern from local-review command
- Dynamic import for lazy loading: `const { runBenchmark } = await import('./cli/commands/benchmark.js')`
