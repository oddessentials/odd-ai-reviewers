# Gap Analysis: Prompt and Rule Gaps Allowing Remaining False Positives

Generated: 2026-03-12 | Analyst: AI Code Review Architect (Task #2)

## Executive Summary

Of the 42 catalogued false positives, 9 are fully caught by deterministic filters (v1.8.0). The remaining 33 require a mix of **new prompt conventions** (highest ROI), **PR intent suppression upgrade**, **framework filter expansion**, and **post-processing heuristics**. No single fix addresses more than 9 FPs, but the top 4 interventions collectively cover 28 of the 33 remaining FPs.

**Key finding:** The existing prompt conventions (1-6) and Active Context Directives are well-designed but insufficiently enforced. The LLM ignores them in ~40% of cases. The solution is not more rules but **stronger framing** (mandatory checklist, explicit "NEVER" phrasing) plus a small number of targeted new conventions.

---

## Table of Contents

1. [Gap-by-Gap Root Cause Analysis](#1-gap-by-gap-root-cause-analysis)
2. [New Prompt Conventions (7-15)](#2-new-prompt-conventions-7-15)
3. [Framework Filter Recommendations](#3-framework-filter-recommendations)
4. [PR Intent Contradiction Upgrade](#4-pr-intent-contradiction-upgrade)
5. [Post-Processing Filter Candidates](#5-post-processing-filter-candidates)
6. [Active Context Directive Strengthening](#6-active-context-directive-strengthening)
7. [Risk Assessment](#7-risk-assessment)
8. [Implementation Ordering](#8-implementation-ordering)
9. [Impact Projection](#9-impact-projection)

---

## 1. Gap-by-Gap Root Cause Analysis

### Priority 1: Factual Errors / Hallucinations (Pattern F) -- 9 FPs

These are the highest-priority gaps because they produce the most damaging FPs (wrong facts, hallucinated constructs) and cannot be caught by any existing deterministic filter.

#### FP-158-6: Claiming documentation doesn't exist when it does

- **Root cause:** LLM did not read the full context around the referenced line. The diff context window may not include the existing comment at line 640.
- **Fix type:** Prompt convention (new #7)
- **File changes:** `config/prompts/semantic_review.md` (add convention), replicate to `pr_agent_review.md`, `opencode_system.md`
- **Blast radius:** LOW -- adds a "verify before claiming absence" rule. No TP regression risk since this only applies to "missing documentation" findings.

#### FP-158-10: Suggesting to verify values that are already verified

- **Root cause:** LLM generated a "verify this matches production" suggestion for a fixture value that demonstrably matches.
- **Fix type:** Prompt convention (new #8)
- **Blast radius:** LOW -- restricts "verify" suggestions to cases with concrete mismatch evidence.

#### FP-159-3: Flagging duplicate code already fixed in prior commit

- **Root cause:** Multi-commit PR; model analyzed intermediate state instead of final diff state.
- **Fix type:** Prompt convention (new #9)
- **Blast radius:** LOW -- instructs model to review final PR state only.

#### FP-159-5, 159-6, 159-7, 159-8, 159-9: Hallucinated code constructs

- **Root cause:** Pure LLM hallucination. The model claimed `contenteditable`, `ctx!` at line 73, `ImageBitmap` leak, early-return cleanup bypass, and array index keys -- none of which exist in the actual code.
- **Fix type:** Prompt convention (strengthening Core Rule 2). Currently Core Rule 2 says "ALWAYS quote the exact code construct." This needs to be more forceful: "If the construct does not appear in the diff, do not report the finding. Never infer the existence of code constructs."
- **File changes:** `config/prompts/semantic_review.md` lines 5-6 (Core Rule 2 strengthening), replicated to all 3 prompts
- **Blast radius:** LOW -- makes an existing rule stronger. No TP regression since real issues always have code evidence.

#### FP-161-3: Confusing two independent subsystems

- **Root cause:** LLM conflated the 2-agent cap system note (line 358) with the per-user rate limiter. These are independent subsystems.
- **Fix type:** Prompt convention (new #10)
- **Blast radius:** LOW -- tells model to verify that ordering concerns involve the same subsystem.

#### FP-161-5: Not tracing singleflight key composition

- **Root cause:** LLM did not examine the full cache key. The singleflight key includes `userEmail`, making shared-state concerns unfounded.
- **Fix type:** Prompt convention (new #11)
- **Blast radius:** LOW -- tells model to examine full cache/dedup keys before claiming shared state.

### Priority 2: Over-engineering Suggestions (Pattern E) -- 5 unaddressed FPs

#### FP-158-9: Runtime validation for TypeScript-typed values

- **Root cause:** No prompt convention prevents suggesting runtime type guards for values already constrained by TypeScript's type system.
- **Fix type:** Prompt convention (new #12)
- **File changes:** `config/prompts/semantic_review.md`, replicate to all prompts
- **Blast radius:** MEDIUM -- must be carefully worded to not suppress legitimate runtime validation at trust boundaries (e.g., API input validation). The key distinction is internal typed values vs. external inputs.

#### FP-159-10: Budget config as code quality issue

- **Root cause:** Model opined on a business decision ($50/month budget).
- **Fix type:** Prompt convention (new #13)
- **Blast radius:** LOW -- restricts model from commenting on business/pricing decisions. No TP regression since these are never real bugs.

#### FP-159-11: Root orchestrator component complexity

- **Root cause:** Model suggested splitting a root component without identifying specific extractable logic.
- **Fix type:** Prompt convention (new #14)
- **Blast radius:** LOW-MEDIUM -- must allow legitimate complexity warnings while preventing vague "too complex" suggestions.

#### FP-160-5: One-time initialization optimization

- **Root cause:** Model suggested optimizing a sub-ms one-time initialization loop.
- **Fix type:** Covered by new convention #14 (combined with init-code specificity)
- **Blast radius:** LOW

#### FP-160-9: Comments on self-documenting code

- **Root cause:** No rule against suggesting comments when variable names and logic make intent clear.
- **Fix type:** Prompt convention (new #15)
- **Blast radius:** MEDIUM -- the line between "self-documenting" and "needs a comment" is subjective. Must be worded to only suppress obviously self-documenting cases.

### Priority 3: Project Context Blindness (Pattern C) -- 7 partially addressed FPs

All 7 are PARTIALLY ADDRESSED by Active Context Directives. The directives exist but the LLM does not consistently follow them. This is not a gap in rules but a gap in enforcement.

#### Root cause analysis

The current Active Context Directives (semantic_review.md lines 96-108) use polite framing:

- "CHECK Project Rules (if the 'Project Rules' section is present)"
- "Re-evaluate any finding that flags the exact change described in the PR purpose"

The LLM treats these as suggestions, not mandates. Evidence: 7 of 7 Pattern C FPs occurred despite directives being present.

#### Fix type: Directive strengthening (see Section 6)

- Reframe as MANDATORY checklist with NEVER/ALWAYS language
- Add specific sub-rules for common project context patterns
- **File changes:** `config/prompts/semantic_review.md` lines 96-108, replicate to all prompts

#### Per-FP specifics:

| FP        | Missing Context                                | Specific Sub-Rule Needed                                                               |
| --------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| FP-158-5  | Design intent for undefined fingerprint fields | "Before flagging optional/undefined in cache keys, verify design intent"               |
| FP-159-13 | CLAUDE.md mandate for single CSS file          | "NEVER suggest structural changes that contradict explicit project rules"              |
| FP-160-4  | Constitution-documented brand constant         | "Check constitution/brand docs before flagging 'magic numbers'"                        |
| FP-160-6  | No test framework in project                   | "Check for test infrastructure before suggesting testability refactors"                |
| FP-160-7  | Intentionally minified code                    | "Do not suggest reformatting code that is intentionally minified"                      |
| FP-160-8  | Singleton architecture guarantee               | "Consider singleton/architectural guarantees before flagging instanceof"               |
| FP-161-1  | Rate limiter slot consumption by design        | "Before flagging resource 'leaks', verify if consumption-without-release is by design" |

- **Blast radius:** LOW -- these all add specificity to existing rules. No TP regression because real context-blind findings would still be caught.

### Priority 4: Framework Conventions Not Filtered (Pattern B) -- 3 FPs

#### FP-159-12: React useRef type assertion

- **Root cause:** No prompt convention or filter for `useRef<T>(null) as MutableRefObject<T>`, which is the standard React 18 TypeScript pattern.
- **Fix type:** Prompt convention (new #7 in Framework section) + optional framework filter matcher
- **File changes:** Add to convention list in `semantic_review.md` section "Framework & Language Conventions"
- **Blast radius:** LOW -- `useRef` type assertion is universally recognized as safe in React TypeScript codebases.

#### FP-161-7: Promise.allSettled order (prompt convention exists but ignored)

- **Root cause:** Prompt convention 3 explicitly states "Do NOT flag sequential iteration of `allSettled` results." The LLM ignored it.
- **Fix type:** This is an enforcement problem, not a missing rule. Two options:
  1. **Framework filter matcher** (deterministic): Add a `promise-allsettled-order` matcher to `framework-pattern-filter.ts`
  2. **Prompt strengthening**: Move conventions higher in the prompt / add NEVER emphasis
- **Recommended:** Option 1 (deterministic filter) because the prompt already has the rule and the LLM ignored it. Code-level suppression is more reliable.
- **File changes:** `router/src/report/framework-pattern-filter.ts` -- add matcher #4
- **Blast radius:** LOW -- the ECMAScript spec guarantees order preservation. Zero TP risk.

#### FP-161-10: React Query dedup (prompt convention exists but ignored)

- **Root cause:** Same as FP-161-7. Prompt convention 2 explicitly covers this, but the LLM still flagged it.
- **Fix type:** Framework filter matcher (deterministic)
- **File changes:** `router/src/report/framework-pattern-filter.ts` -- add matcher #5
- **Blast radius:** LOW -- React Query/SWR/Apollo dedup is well-documented. Zero TP risk.

### Priority 5: PR Intent Contradiction (Pattern D) -- 2 FPs

#### FP-158-2: Flagging intentional conditional behavior

#### FP-160-2: Flagging the exact PR change

- **Root cause:** `logPRIntentContradictions()` in `finding-validator.ts` (lines 123-159) is DIAGNOSTIC ONLY. It logs warnings but never suppresses findings. The function explicitly states "DIAGNOSTIC ONLY -- no suppression, no filtering, no modification of findings."
- **Fix type:** Architecture change -- upgrade from diagnostic to suppressive
- **File changes:** `router/src/report/finding-validator.ts` (modify `logPRIntentContradictions` to return contradiction matches), `router/src/phases/report.ts` (consume results)
- **Blast radius:** MEDIUM -- this is the riskiest change. Suppressing findings based on PR description matching could hide real issues if the PR description is misleading. See Risk Assessment (Section 7).

### Priority 6: Residual Pattern A -- 3 FPs

#### FP-158-1: Shell scripts outside TypeScript AST analysis

- **Root cause:** Safe-source detector only handles TS/JS files. `.husky/` shell scripts are outside its scope.
- **Fix type:** Prompt convention -- add to "Framework & Language Conventions" section
- **Rule:** "Shell commands in developer tooling hooks (.husky/, Makefile, Dockerfile) are not user-input vectors unless they explicitly read from environment variables, command-line arguments, or stdin."
- **Blast radius:** LOW -- developer tooling scripts are rarely actual security risks.

#### FP-159-1: Cross-function taint tracking needed

- **Root cause:** Safe-source detector cannot trace that a function's callers never pass user input. `path.join` inside `durable-spooler.ts` is flagged because the detector only analyzes local scope.
- **Fix type:** Prompt convention (cross-function taint is architecturally infeasible for now)
- **Rule:** "When flagging path.join, fs operations, or exec calls, verify whether any call site in the diff passes user-controlled data. If no call site in the diff involves user input, downgrade to info with an uncertainty qualifier."
- **Blast radius:** LOW -- this is a severity downgrade rule, not suppression.

#### FP-159-2: Binary response bodies flagged as XSS

- **Root cause:** No rule distinguishes binary response bodies (audio buffers, images) from HTML responses.
- **Fix type:** Prompt convention
- **Rule:** "Binary response bodies (Buffer, ArrayBuffer, audio/image content-type) are not XSS vectors. Do not flag writes to res/response when the content is binary."
- **Blast radius:** LOW -- binary responses genuinely cannot contain XSS payloads.

---

## 2. New Prompt Conventions (7-15)

To be added to the "False Positive Prevention" section of `config/prompts/semantic_review.md` (and replicated to `pr_agent_review.md` and `opencode_system.md`):

### Convention 7: Verify existence before claiming absence

```markdown
7. **Verify before claiming absence**: Before reporting that code lacks documentation, error handling, cleanup, or validation, verify that the referenced line and its surrounding context (within 10 lines) do not already contain the construct you claim is missing. If a comment, try/catch, cleanup call, or guard already exists, do not report the finding.
   - **Pattern**: Findings that assert something is "missing" — documentation, error handling, resource cleanup, input validation
   - **Recognition**: Finding message contains "no documentation", "lacks", "missing", "should add", "not handled"
   - **Why not to flag**: The construct may already exist outside the narrow view of the diff hunk. Verify first.
```

**FPs addressed:** FP-158-6, FP-158-10, FP-159-7, FP-159-8 (4 FPs)

### Convention 8: Fixture/test data correctness

```markdown
8. **Fixture and test data values**: Do NOT suggest verifying fixture, test, or mock data values unless there is concrete evidence of a mismatch between the value and its source. If the value demonstrably matches the production schema or source data, it is correct by definition.
   - **Pattern**: "Verify this value matches...", "Ensure this aligns with production..."
   - **Recognition**: Finding targets a test fixture, mock, or seed data file
   - **Why not to flag**: Test fixtures are intentionally chosen values. Without a concrete mismatch, "verify" suggestions are noise.
```

**FPs addressed:** FP-158-10 (1 FP, overlaps with #7)

### Convention 9: Multi-commit PRs use final state

```markdown
9. **Multi-commit PR state**: When reviewing PRs with multiple commits, findings must reflect the final state of the code, not intermediate commits. If an issue was introduced in commit A and fixed in commit B within the same PR, do not flag it.
   - **Pattern**: Findings about issues that exist in early commits but are resolved in later commits
   - **Recognition**: PR has multiple commits + finding references code that changed across commits
   - **Why not to flag**: The PR as a whole represents the intended change. Intermediate states are irrelevant.
```

**FPs addressed:** FP-159-3 (1 FP)

### Convention 10: Independent subsystem ordering

```markdown
10. **Independent subsystem ordering**: When flagging ordering issues (e.g., "check should happen before action"), verify that the check and the action are part of the same subsystem or concern. Different subsystems (e.g., agent caps vs rate limiters, auth vs logging) operate independently and their ordering is not a defect.

- **Pattern**: "X should happen before Y", "ordering issue"
- **Recognition**: Two operations that reference different state (different variables, different modules, different concerns)
- **Why not to flag**: Independent subsystems have no ordering dependency. Flagging their relative order is a false correlation.
```

**FPs addressed:** FP-161-3 (1 FP)

### Convention 11: Cache/dedup key analysis

```markdown
11. **Cache and deduplication key analysis**: Before flagging caching, singleflight, or memoization patterns as causing shared-state bugs (double-counting, stale data), examine the full cache key composition. If the key includes a per-entity discriminator (userId, email, sessionId), the concern about cross-entity contamination is unfounded.

- **Pattern**: "may cause double-counting", "shared state", "singleflight/cache may..."
- **Recognition**: Finding references a caching/dedup pattern + the cache key is a composite including an entity identifier
- **Why not to flag**: Per-entity cache keys guarantee isolation. The concern only applies to globally-shared keys.
```

**FPs addressed:** FP-161-5 (1 FP)

### Convention 12: No runtime validation for type-constrained values

```markdown
12. **TypeScript type system trust**: Do NOT suggest adding runtime type validation (type guards, assertions, runtime checks) for function parameters or variables that are already constrained by TypeScript's type system (union types, enums, branded types, generic constraints). Runtime validation is only appropriate at trust boundaries: API inputs, deserialized data, user-provided configuration.

- DO NOT flag: `function process(tier: 'basic' | 'premium')` missing a runtime check
- DO NOT flag: `function handle(status: StatusEnum)` needing an assertion
- DO flag: `function handleWebhook(body: unknown)` without validation
- **Pattern**: Suggesting runtime validation for typed internal parameters
- **Recognition**: Parameter has a TypeScript type annotation with a finite set of values (union, enum, branded) + function is internal (not an API boundary)
- **Why not to flag**: TypeScript's compiler enforces type constraints at compile time. Adding runtime checks for already-typed values adds maintenance burden with no safety benefit.
```

**FPs addressed:** FP-158-9 (1 FP)

### Convention 13: Business decisions are out of scope

```markdown
13. **Business and configuration decisions**: Do NOT flag budget amounts, pricing values, resource limits, SLA thresholds, or similar business-decision values as code quality issues. These are product/business decisions, not engineering defects. Only flag configuration values if they would cause a runtime error (e.g., negative timeout, zero-length buffer).

- DO NOT flag: `budget: 50` as "may be insufficient"
- DO NOT flag: `maxRetries: 3` as "consider increasing"
- DO flag: `timeout: -1` (would cause an error)
- **Pattern**: Findings that question the adequacy of business-domain values
- **Recognition**: Finding message contains "may be insufficient", "consider increasing/decreasing", "low/high value"
- **Why not to flag**: Code review evaluates code correctness, not business strategy.
```

**FPs addressed:** FP-159-10 (1 FP)

### Convention 14: Avoid vague complexity and optimization suggestions

```markdown
14. **Concrete refactoring only**: Do NOT suggest splitting, extracting, or optimizing code unless you can identify a specific, extractable unit AND the PR's purpose includes refactoring. Do NOT suggest:

- Splitting a root orchestrator component without naming the specific sub-component to extract
- Optimizing one-time initialization code (runs once at startup) without profiling evidence
- Extracting expressions that follow an established pattern used consistently in the same file
- **Pattern**: "Consider splitting", "extract to function", "could be optimized"
- **Recognition**: Suggestion lacks a specific extraction target OR targets init-only code OR targets a pattern used consistently in the file
- **Why not to flag**: Vague refactoring suggestions add noise. Concrete suggestions with named units are welcome.
```

**FPs addressed:** FP-159-11, FP-160-3, FP-160-5 (3 FPs)

### Convention 15: Self-documenting code does not need comments

```markdown
15. **Comment necessity**: Do NOT suggest adding comments to code where the variable names, function names, and control flow make the intent clear. Only suggest comments for:

- Non-obvious algorithms (bit manipulation, mathematical formulas)
- Business rules not derivable from code (regulatory requirements, domain knowledge)
- Workarounds with non-obvious reasons (browser bugs, API quirks)
- **Pattern**: "Add a comment explaining...", "Document why..."
- **Recognition**: The code under review uses descriptive names and straightforward logic
- **Why not to flag**: Comments on self-documenting code add maintenance burden. They go stale faster than code.
```

**FPs addressed:** FP-160-9 (1 FP)

### Summary of Convention Impact

| Convention                  | FPs Addressed    | Risk       |
| --------------------------- | ---------------- | ---------- |
| #7 (verify absence)         | 4                | LOW        |
| #8 (fixture data)           | 1 (overlap w/#7) | LOW        |
| #9 (multi-commit)           | 1                | LOW        |
| #10 (subsystem ordering)    | 1                | LOW        |
| #11 (cache key analysis)    | 1                | LOW        |
| #12 (type system trust)     | 1                | MEDIUM     |
| #13 (business decisions)    | 1                | LOW        |
| #14 (concrete refactoring)  | 3                | LOW-MEDIUM |
| #15 (self-documenting code) | 1                | MEDIUM     |
| **Total unique FPs**        | **~12**          |            |

---

## 3. Framework Filter Recommendations

### Current state

The framework-pattern-filter has 3 matchers in a CLOSED table:

1. `express-error-mw` (T019)
2. `ts-unused-prefix` (T020)
3. `exhaustive-switch` (T021)

### Recommendation: Add 2 matchers

The closed table should be expanded to 5 matchers. This requires a spec amendment (as noted in the filter's own docstring).

#### Matcher #4: `promise-allsettled-order`

```typescript
{
  id: 'promise-allsettled-order',
  name: 'Promise.allSettled Order Preservation',
  messagePattern: /(?:order|ordering|sequence|index|position).*(?:allSettled|all\s*settled)|(?:allSettled|all\s*settled).*(?:order|ordering|may not match|not guaranteed)/i,
  evidenceValidator(finding: Finding, diffContent: string): boolean {
    const fileSection = extractFileDiffSection(finding, diffContent);
    if (!fileSection) return false;
    const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
    const nearbyText = nearbyLines.join('\n');
    // Must have Promise.allSettled in the nearby code
    return /Promise\.allSettled\s*\(/.test(nearbyText);
  },
  suppressionReason: 'Promise.allSettled guarantees result order per ECMAScript spec',
}
```

**Rationale:** Prompt convention 3 already covers this, but the LLM ignored it (FP-161-7). Deterministic filter is more reliable.
**FPs addressed:** FP-161-7
**TP regression risk:** ZERO -- ECMAScript spec guarantee

#### Matcher #5: `react-query-dedup`

```typescript
{
  id: 'react-query-dedup',
  name: 'React Query/SWR Cache Deduplication',
  messagePattern: /(?:duplicate|double|redundant|repeated).*(?:fetch|request|query|api\s*call)|(?:fetch|request|query).*(?:duplicate|twice|double|redundant)/i,
  evidenceValidator(finding: Finding, diffContent: string): boolean {
    const fileSection = extractFileDiffSection(finding, diffContent);
    if (!fileSection) return false;
    // Check for React Query/SWR/Apollo imports anywhere in the file section
    const hasQueryLib = /from\s+['"](?:@tanstack\/react-query|swr|@apollo\/client)['"]/
      .test(fileSection);
    if (!hasQueryLib) return false;
    // Check for useQuery/useSWR/useSubscription near the finding
    const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 15);
    const nearbyText = nearbyLines.join('\n');
    return /(?:useQuery|useSWR|useSubscription)\s*\(/.test(nearbyText);
  },
  suppressionReason: 'React Query/SWR/Apollo deduplicates requests by cache key',
}
```

**Rationale:** Same as matcher #4 -- prompt convention 2 exists but LLM ignored it.
**FPs addressed:** FP-161-10
**TP regression risk:** ZERO -- well-documented library behavior

#### NOT recommended for filter table:

- **React useRef type assertion** (FP-159-12): Better handled as prompt convention. The `useRef` pattern has many variants and a regex-based filter would need to cover `as MutableRefObject`, `as HTMLElement`, etc. Prompt convention is more flexible.

### Implementation notes

- The CLOSED table docstring says "Adding a new matcher requires a spec amendment." This is an intentional gate. The spec amendment should document the ECMAScript spec citation for matcher #4 and the React Query docs citation for matcher #5.
- Both matchers follow the existing evidence-based pattern: message regex triggers evaluation, then structural evidence (nearby code patterns) confirms.

---

## 4. PR Intent Contradiction Upgrade

### Current state

`logPRIntentContradictions()` in `finding-validator.ts` (lines 111-159):

- Extracts action verb + subject from PR description
- Compares against finding messages for contradiction
- **Only logs** -- does not modify, filter, or suppress findings
- Called during Stage 1 validation in `validateFindingsSemantics()`

### Recommended upgrade

**Approach:** Convert from diagnostic-only to a **severity downgrade** mechanism (not full suppression).

Rationale for downgrade instead of suppression:

- Full suppression is risky because PR descriptions can be misleading or incomplete
- A severity downgrade (e.g., `warning` -> `info`) preserves the finding for human review while preventing gating impact
- This is conservative and reversible

### Specific changes

**File: `router/src/report/finding-validator.ts`**

1. Rename `logPRIntentContradictions` to `detectPRIntentContradictions`
2. Change return type from `void` to `Finding[]` (returns the modified findings array)
3. When a contradiction is detected:
   - If finding severity is `warning` or `error`, downgrade to `info`
   - Append `" [severity downgraded: contradicts PR intent]"` to the finding message
   - Log the downgrade (existing logging)
4. Keep the existing verb/subject matching logic unchanged

**File: `router/src/report/finding-validator.ts` - `validateFindingsSemantics()`**

After the self-contradiction filter pass, add a PR intent downgrade pass that calls the renamed function and applies downgrades.

### Blast radius assessment

- **Risk:** MEDIUM -- a misleading PR description could cause legitimate high-severity findings to be downgraded to info. However:
  - The finding is preserved (not deleted), just downgraded
  - The `[severity downgraded: contradicts PR intent]` annotation makes the reason visible
  - Gating would need to be at `info` level to be affected, which is unusual
  - The verb/subject matching is already quite narrow (requires exact verb+subject overlap)

**FPs addressed:** FP-158-2, FP-160-2 (2 FPs)

---

## 5. Post-Processing Filter Candidates

Beyond the framework filter and PR intent upgrades, there are potential deterministic post-processing filters that could catch Pattern F (factual errors). These are more speculative and have higher TP regression risk.

### Candidate 1: Hallucination guard -- line number verification

**Concept:** After the LLM produces findings, verify that the code construct mentioned in the finding message actually appears at the cited line in the diff.

**Implementation sketch:**

- Extract quoted identifiers/constructs from finding.message (e.g., `ctx!`, `contenteditable`, `ImageBitmap`)
- Check if any extracted term appears within +/- 5 lines of finding.line in the diff
- If zero terms match, downgrade to info with annotation

**FPs addressed:** FP-159-5, FP-159-6, FP-159-9 (3 FPs)
**TP regression risk:** MEDIUM -- the LLM may describe a finding in different terms than the exact code. E.g., "null pointer" finding on code that uses `?.` -- the finding message says "null pointer" but the code shows `?.`.
**Recommendation:** Worth prototyping but needs careful false-negative testing. NOT included in the initial implementation phase.

### Candidate 2: Self-documenting comment detection

**Concept:** If a finding suggests "add a comment" and the code already has a comment within 3 lines, suppress.

**FPs addressed:** FP-158-6 (1 FP, overlap with convention #7)
**TP regression risk:** LOW
**Recommendation:** LOW priority. Convention #7 covers this at the prompt level.

### Candidate 3: Binary content-type detection

**Concept:** If a finding flags XSS/injection in a response write, check diff for `content-type` header set to binary (audio/_, image/_, application/octet-stream).

**FPs addressed:** FP-159-2 (1 FP)
**TP regression risk:** LOW -- binary responses cannot execute scripts
**Recommendation:** LOW priority. Prompt convention covers this. Only 1 FP affected.

### Summary: No post-processing filters recommended for initial implementation

All candidate filters have limited FP coverage (1-3 each) and non-trivial implementation complexity. The prompt convention approach covers the same FPs with less risk. Post-processing filters should be revisited only if prompt conventions prove insufficient after deployment.

---

## 6. Active Context Directive Strengthening

The current Active Context Directives (`semantic_review.md` lines 96-108) are polite suggestions. They need to be reframed as mandatory checks.

### Current text (lines 96-108):

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

### Proposed replacement:

```markdown
### Active Context Directives (MANDATORY)

BEFORE generating ANY findings, you MUST complete this checklist. Findings that violate these directives will be treated as false positives:

1. **MANDATORY: Verify Project Rules** (if a "Project Rules" section is present):
   - Read ALL project rules. You MUST NOT generate findings that contradict documented project decisions.
   - If a project rule mandates a specific structure (e.g., "single CSS file", "no test framework"), NEVER suggest alternatives.
   - Check project constitution, CLAUDE.md, and brand guidelines before flagging hardcoded values as "magic numbers."
   - Check for test infrastructure (test directories, test configs) before suggesting "extract for testability."
   - Consider architectural guarantees (singletons, module systems) before flagging instanceof or shared-state patterns.

2. **MANDATORY: Verify PR Description** (if a "PR Description" section is present):
   - Read the PR title and description to understand the author's stated intent.
   - NEVER flag the exact change described in the PR purpose as an issue.
   - If the PR explicitly describes conditional or environment-dependent behavior, do NOT flag that behavior as inconsistent.
   - If the PR description explains WHY a change was made, that explanation overrides generic best-practice concerns.

3. **MANDATORY: Verify Code Existence**:
   - NEVER report a finding about a code construct that does not demonstrably exist in the diff.
   - Before flagging "missing" documentation, cleanup, or validation, verify the surrounding context (within 10 lines) does not already contain it.
   - Before flagging resource leaks, verify that cleanup/dispose/close is not already called in finally blocks, return paths, or effect cleanup functions.
```

### Impact

This strengthened directive addresses all 7 Pattern C FPs (FP-158-5, FP-159-13, FP-160-4, FP-160-6, FP-160-7, FP-160-8, FP-161-1) plus provides defense-in-depth for Pattern F.

The key changes:

- "CHECK" -> "MANDATORY: Verify"
- Added "MUST NOT", "NEVER" framing
- Added specific sub-rules derived from actual FPs
- Added a new directive #3 for code existence verification

---

## 7. Risk Assessment

### TP Regression Risk Matrix

| Change                                      | FPs Fixed | TP Regression Risk | Mitigation                                                                             |
| ------------------------------------------- | --------- | ------------------ | -------------------------------------------------------------------------------------- |
| Prompt conventions 7-11 (factual errors)    | 7         | LOW                | Only add constraints on "absence" claims and subsystem confusion                       |
| Prompt convention 12 (type system trust)    | 1         | MEDIUM             | Must exclude trust boundaries; careful wording required                                |
| Prompt conventions 13-15 (over-engineering) | 5         | LOW-MEDIUM         | Convention 14 (vague refactoring) could suppress legitimate complexity warnings        |
| Active Context Directive strengthening      | 7         | LOW                | Adds specificity to existing rules, does not remove any                                |
| Framework filter matchers #4-5              | 2         | ZERO               | ECMAScript spec + library guarantees                                                   |
| PR intent downgrade                         | 2         | MEDIUM             | Misleading PR descriptions could hide real issues; mitigated by downgrade-not-suppress |
| Core Rule 2 strengthening                   | 5         | LOW                | Makes existing rule stronger; real findings always have code evidence                  |

### Highest-risk changes (require careful testing):

1. **PR intent downgrade** -- Test with adversarial PR descriptions that match legitimate findings
2. **Convention 12 (type system trust)** -- Test with API boundary functions that genuinely need runtime validation
3. **Convention 14 (vague refactoring)** -- Test with genuinely complex code that should be split

### Recommended safety measures:

- Run the existing 42-FP benchmark after each change to verify FP reduction
- Run a TP regression suite (set of known true positives) to verify no suppression
- Deploy prompt changes first (reversible, no code changes) before filter changes
- Deploy PR intent downgrade last (highest risk, most testing needed)

---

## 8. Implementation Ordering

### Phase 1: Prompt changes (LOW risk, HIGH reward) -- ~3 hours

**Dependency:** None

1. Strengthen Core Rule 2 in all 3 prompt files (FPs: 159-5, 159-6, 159-7, 159-8, 159-9)
2. Replace Active Context Directives with mandatory version in all 3 prompt files (FPs: 158-5, 159-13, 160-4, 160-6, 160-7, 160-8, 161-1)
3. Add conventions 7-11 to all 3 prompt files (FPs: 158-6, 158-10, 159-3, 161-3, 161-5)
4. Add conventions 13-15 to all 3 prompt files (FPs: 159-10, 159-11, 160-3, 160-5, 160-9)
5. Add React useRef pattern to Framework Conventions section (FP: 159-12)
6. Add shell script / binary response / cross-function prompt rules (FPs: 158-1, 159-1, 159-2)

**Files modified:**

- `config/prompts/semantic_review.md`
- `config/prompts/pr_agent_review.md`
- `config/prompts/opencode_system.md`
- Inline defaults in `router/src/agents/ai_semantic_review.ts` (lines 216-242)
- Inline defaults in `router/src/agents/pr_agent.ts` (lines 204-217)
- Inline defaults in `router/src/agents/opencode.ts` (corresponding inline prompt)

**Expected FP reduction:** ~24 FPs addressed (prompt-level, probabilistic)

### Phase 2: Framework filter expansion (ZERO risk) -- ~1 hour

**Dependency:** None (can run in parallel with Phase 1)

1. Add `promise-allsettled-order` matcher (#4) to `framework-pattern-filter.ts`
2. Add `react-query-dedup` matcher (#5) to `framework-pattern-filter.ts`
3. Update closed-table docstring to say "5 matchers"
4. Add tests in `router/src/__tests__/report/` for both new matchers

**Files modified:**

- `router/src/report/framework-pattern-filter.ts`
- `router/src/__tests__/report/framework-filter.test.ts` (or new test file)

**Expected FP reduction:** 2 FPs deterministically caught

### Phase 3: Convention 12 (MEDIUM risk) -- ~30 min

**Dependency:** Phase 1 (deploy other conventions first, get feedback)

1. Add convention 12 (type system trust) with careful trust-boundary exception wording
2. Test against known API-boundary validation TPs

**Files modified:** Same as Phase 1

**Expected FP reduction:** 1 FP

### Phase 4: PR intent contradiction upgrade (MEDIUM risk) -- ~2 hours

**Dependency:** Phase 1 (Active Context Directives should be strengthened first, which may naturally reduce PR intent FPs)

1. Rename `logPRIntentContradictions` to `detectPRIntentContradictions`
2. Implement severity downgrade logic
3. Update `validateFindingsSemantics` to apply downgrades
4. Add tests for contradiction detection + downgrade behavior
5. Add test with adversarial PR description (TP safety check)

**Files modified:**

- `router/src/report/finding-validator.ts`
- `router/src/__tests__/report/finding-validator.test.ts` (or existing test file)

**Expected FP reduction:** 2 FPs

### Total implementation estimate: ~6.5 hours across 4 phases

---

## 9. Impact Projection

### Before (current state)

- Fully addressed: 9/42 (21.4%)
- Partially addressed: 14/42 (33.3%)
- Unaddressed: 16/42 (38.1%)
- **Remaining FPs potentially surfacing in production: 33/42 (78.6%)**

### After all phases (projected)

| Mechanism                          | Deterministic | Probabilistic (prompt) | FPs Covered |
| ---------------------------------- | ------------- | ---------------------- | ----------- |
| Existing filters (v1.8.0)          | 9             | --                     | 9           |
| New framework matchers (#4, #5)    | 2             | --                     | 2           |
| PR intent downgrade                | 2             | --                     | 2           |
| Core Rule 2 strengthening          | --            | 5                      | 5           |
| Active Context Directive rewrite   | --            | 7                      | 7           |
| New conventions 7-15               | --            | 12                     | 12          |
| Shell/binary/cross-fn prompt rules | --            | 3                      | 3           |
| **Total unique FPs covered**       | **13**        | **~24**                | **~37-40**  |

**Projected remaining FPs: 2-5 out of 42 (5-12%)**

The 2-5 residual FPs are expected to be:

- Pattern F hallucinations that no prompt can fully prevent (LLM limitation)
- Edge cases where convention wording doesn't perfectly match the FP pattern

### Deterministic vs. probabilistic coverage

- **Deterministic (code-level filters):** 13/42 (31%) -- guaranteed suppression
- **Probabilistic (prompt-level):** Additional ~24/42 (57%) -- depends on LLM adherence
- **Expected effective rate:** With strengthened mandatory framing, LLM adherence should improve from ~60% to ~80-90%, yielding an effective prompt coverage of ~19-22 additional FPs
- **Realistic total:** ~32-35/42 FPs addressed (76-83%)
