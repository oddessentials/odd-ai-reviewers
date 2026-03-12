# LLM Prompt Analysis: False Positive Pattern Assessment

**Date:** 2026-03-12
**Reviewer:** Prompt & Policy Engineer
**Scope:** Framework convention sections (Pattern B), project context (Pattern C), PR description (Pattern D), and mixed patterns (Pattern F)

---

## Executive Summary

The current prompt architecture has **strong foundational rules** (Core Rules 1-4) and **adequate framework convention coverage** (6 rules). However, **critical gaps exist in context injection and prompt guidance for patterns B, C, and D**:

- **Pattern B (Framework Conventions):** Rules are present but PASSIVE — they rely on LLM recognition without explicit guidance
- **Pattern C (Project Context):** Context IS injected but prompts lack DIRECTIVE to check it or handle conflicts
- **Pattern D (PR Description):** Context IS injected but MISSING EXPLICIT INSTRUCTION to verify against it before flagging design decisions
- **Pattern F (Mixed):** Inherits weaknesses from B/C/D combinations

**Recommendation:** Add explicit meta-instructions to guide LLM behavior when context is present, make certain patterns deterministic where possible, and strengthen validation around intentional design choices.

---

## Detailed Findings by Pattern

### Pattern B: Framework Conventions - Passive Recognition Problem

**Status:** PARTIALLY EFFECTIVE
**Root Cause:** Rules exist but are presented as non-flagging constraints, not as recognition guides.

#### Current Implementation

**File-based prompts** (semantic_review.md:59-76, opencode_system.md:51-68, pr_agent_review.md:51-68):

```markdown
### Framework & Language Conventions

Do NOT flag the following well-known patterns as issues:

1. **Express error middleware**: ... Do NOT flag unused `_next` or `next` parameters...
2. **Query library key deduplication**: ... Do NOT flag identical query keys...
3. **Promise.allSettled order preservation**: ... Do NOT flag sequential iteration...
4. **TypeScript `_prefix` convention**: ... Do NOT flag `_`-prefixed parameters...
5. **Exhaustive switch enforcement**: ... Do NOT flag these...
6. **Constant externalization**: Do NOT suggest extracting/externalizing constants...
```

**Hardcoded fallbacks** (opencode.ts:101-102, ai_semantic_review.ts:236-237, pr_agent.ts:213-214):

```typescript
Do NOT flag: (1) Express 4-param error middleware unused _next, (2) identical query keys as double-fetching (React Query dedup),
(3) Promise.allSettled iteration as "wrong order", (4) TypeScript _prefix unused params, (5) assertNever/exhaustive switch as
missing error handling, (6) constants adjacent to their only usage as needing externalization.
```

#### Identified Gaps

**Gap B1: Missing Pre-Flag Recognition Guidance**

- Prompts only say "don't flag" AFTER the pattern is recognized
- No guidance on HOW to IDENTIFY the pattern before flagging
- LLM may recognize the code construct without connecting it to the convention

**Example from issues #159, #161:**

- Express 4-param error middleware flagged as "unused parameter" → LLM saw `_next` but didn't check if it's an Express handler
- React Query `useQuery` with identical key flagged as "double-fetching" → LLM saw duplicate key but didn't check if it's a cache dedup pattern

**Gap B2: Missing Context Hints for Ambiguous Patterns**

- Promise.allSettled: No guidance on checking that iteration follows promise order
- TypeScript `_` prefix: No mention that ESLint recognizes this convention (increases credibility)
- No guidance on checking ADJACENT usage for constant externalization rule

**Gap B3: Incomplete Convention Coverage**
Currently 6 rules. Missing patterns seen in v1.8.0 but not yet in prompts:

- **Intentional no-ops in type-safe switches** (covered by Rule 5 exhaustiveness, but could be clearer)
- **Runtime validation for strict union types** (not covered; should be part of type-safety guidance)

#### Specific Prompt Improvements Needed

**For semantic_review.md (replace lines 59-76):**

```markdown
### Framework & Language Conventions

**BEFORE FLAGGING**, verify that the code matches well-known patterns:

1. **Express error middleware**: Express error handlers MUST have exactly 4 parameters `(err, req, res, next)`.
   - IDENTIFY: Function is registered with `.use()` or as error handler AND has signature `(err, ...)`
   - DO NOT FLAG: `_next` or unused `next` — this is a required parameter for Express to recognize the function as an error handler
   - DO FLAG: Only if the parameter signature changes (e.g., `(err, req, res)` without `next`)

2. **Query library key deduplication**: React Query, SWR, Apollo use cache keys for automatic deduplication.
   - IDENTIFY: `useQuery`, `useSWRQuery`, `useQuery` in Apollo client with identical key/id across components
   - DO NOT FLAG: Identical query keys as "double-fetching" — the library automatically serves cache hits
   - DO FLAG: Only if the query handler logic differs (e.g., different `queryFn` with same key)

3. **Promise.allSettled order preservation**: `Promise.allSettled()` guarantees results are in the same order as input promises.
   - IDENTIFY: Code iterates `allSettled().map()` or loops through results by index
   - DO NOT FLAG: Sequential iteration as "results may not match input order" — they are guaranteed to match
   - DO FLAG: Only if code relies on sorted/reordered results without verification

4. **TypeScript `_prefix` convention**: Parameters and variables prefixed with `_` indicate intentionally unused items.
   - IDENTIFY: Parameter name starts with `_` or `_name` pattern
   - RECOGNIZE: This is a standard TypeScript convention, recognized by @typescript-eslint/no-unused-vars
   - DO NOT FLAG: `_`-prefixed items as unused — the prefix explicitly marks them as intentional
   - DO FLAG: Only if the prefix is inconsistently applied (e.g., some unused params without `_`, others with `_`)

5. **Exhaustive switch enforcement**: `assertNever(x)` or `default: throw new Error('Unexpected ...')` in switch statements over discriminated unions.
   - IDENTIFY: Switch operates over a typed enum or discriminated union
   - RECOGNIZE: The type system guarantees which cases exist — unexpected values are impossible
   - DO NOT FLAG: `assertNever()` or `default: throw` as "missing error handling" or "unreachable" — this is correct exhaustiveness enforcement
   - DO FLAG: Only if the switch is not exhaustive (missing a type case)

6. **Constant externalization**: Do NOT suggest extracting constants that are tightly coupled to adjacent code.
   - IDENTIFY: Constant is defined immediately before/after the code that uses it
   - DO NOT FLAG: `const SEVERITY_MAP = { error: 'red', warning: 'yellow' }` adjacent to its switch statement
   - DO NOT FLAG: `const PATTERNS = [/regex1/, /regex2/]` used only in the next function
   - DO FLAG: Only if the constant is duplicated across 3+ files OR used in unrelated contexts (true reuse opportunity)
```

**For opencode_system.md and pr_agent_review.md:** Apply the same expanded guidance, adjusting formatting as needed.

**For hardcoded fallbacks in agent source files:** Expand the terse version:

```typescript
// OLD (lines 101-103, 236-237, 213-214):
Do NOT flag: (1) Express 4-param error middleware unused _next, (2) identical query keys as double-fetching (React Query dedup),
(3) Promise.allSettled iteration as "wrong order", (4) TypeScript _prefix unused params, (5) assertNever/exhaustive switch as
missing error handling, (6) constants adjacent to their only usage as needing externalization.

// NEW:
### Framework & Language Conventions
Before flagging, recognize these patterns:
- Express error middleware: 4-param handlers with _next are required by the framework — verify @app.use() registration
- Query library keys: Identical keys in React Query/SWR are cache dedup, not double-fetching — check library name
- Promise.allSettled: Result order matches input promise order — verify iteration follows this guarantee
- TypeScript _prefix: Marks intentionally unused params (ESLint recognizes this) — check parameter name
- Exhaustive switches: assertNever() enforces type safety — check type is discriminated union
- Constants: Don't externalize if tightly coupled to adjacent code — check usage spread
```

---

### Pattern C: Project Context - Missing Directive Problem

**Status:** CONTEXT INJECTED, DIRECTIVE MISSING
**Root Cause:** Project rules are included in the prompt but prompts don't explicitly direct LLM to check/respect them.

#### Current Implementation

**Context Injection:**

- context-loader.ts:44-51: Loads CLAUDE.md from repo root
- All agents (opencode.ts:118-119, ai_semantic_review.ts:254-255, pr_agent.ts:234): Injects as `## Project Rules` section in user prompt

Example injected context:

```
## Project Rules

The following project rules/conventions apply:

[Contents of CLAUDE.md...]
```

**Prompt Guidance:**

- semantic_review.md: Lines 49-50 mention "Configuration and tooling choices are intentional" but DON'T direct checking CLAUDE.md
- opencode_system.md: Lines 43 mention "Configuration files reflect deliberate project decisions" but NO explicit check directive
- pr_agent_review.md: Lines 43 mention "Configuration files reflect deliberate project decisions" but NO explicit check directive
- **None of the prompts explicitly instruct:** "Before flagging a finding about [pattern X], verify it against the project rules"

#### Identified Gaps

**Gap C1: No Explicit Check Directive**
Current prompt says "don't flag configuration" generically, but doesn't say:

- "Before suggesting code changes, verify against the Project Rules section"
- "If a pattern conflicts with stated project rules, do NOT flag it"
- "Prioritize project rules over generic best practices"

**Gap C2: Missing Conflict Resolution**
When project rules contradict a finding:

- Should project rule win? (Yes, but prompts don't say this)
- Should finding severity drop? (Maybe, but prompts don't address it)
- Should finding be omitted entirely? (Yes, but prompts don't direct this)

**Gap C3: No Pattern-Specific Guidance**
Issues #158, #160 show:

- Constants externalization flagged despite project rules saying constants should be tightly scoped
- CSS modularization suggested despite project explicitly mandating non-modularized CSS
- **Prompts need to explicitly check project rules for each finding type**

#### Specific Prompt Improvements Needed

**Add a new section to semantic_review.md (after Core Rules, before Review Focus):**

```markdown
## Project Context

The prompt includes a "Project Rules" section containing project-specific conventions and constraints.
**BEFORE REPORTING A FINDING**, verify that it doesn't conflict with the stated project rules:

1. **Configuration and code organization**: If the Project Rules section mentions specific file/module organization, directory structure, or configuration patterns, do NOT flag violations unless they introduce concrete problems (e.g., security, correctness).

2. **Library and framework choices**: If the Project Rules specify certain libraries or frameworks, do NOT flag alternative patterns as "better" or "more modern."

3. **Constants and configuration**: If the Project Rules specify that constants should be tightly scoped or kept adjacent to usage, do NOT suggest externalization. Only flag if the same constant is duplicated across 3+ files AND the project rules don't explicitly forbid it.

4. **Conflict resolution**: If a finding contradicts the stated Project Rules, do NOT report it. If the Project Rules explain WHY a pattern was chosen, respect that trade-off.

5. **Severity adjustment**: If a finding is allowed by the Project Rules but differs from standard practice, report it at "info" severity with the qualifier: "Note: This practice is permitted by project rules."
```

**Add to opencode_system.md (same location):**

```markdown
## Project Context

The prompt includes a "Project Rules" section with project-specific constraints.
**ALWAYS CHECK PROJECT RULES** before flagging code organization, constant placement, or architectural patterns.
If the rules explain a pattern, do NOT flag it.
```

**Add to pr_agent_review.md (same location):**

```markdown
## Project Context

The prompt includes a "Project Rules" section.
**Before suggesting changes to:**

- Code organization or module structure
- Configuration or constants
- Architectural choices

**Check the Project Rules section first.** If the rules justify the pattern, do NOT report it.
```

**Update context-loader.ts to add metadata:** Mark which sections of Project Rules are "constraints" vs. "guidance":

```typescript
// In truncateContext() or new function, add:
export function extractProjectRulesMetadata(rules: string): {
  hasConstraints: boolean;
  constraintPattern: RegExp;
} {
  // Detect sections like "MUST NOT", "SHALL NOT", "FORBIDDEN"
  return {
    hasConstraints: /MUST NOT|SHALL NOT|FORBIDDEN|do not|don't/i.test(rules),
    constraintPattern: /MUST NOT|SHALL NOT|FORBIDDEN/i,
  };
}
```

---

### Pattern D: PR Description - Missing Verification Directive

**Status:** CONTEXT INJECTED, VERIFICATION DIRECTIVE MISSING
**Root Cause:** PR description is included but prompts don't explicitly direct LLM to verify findings against stated purpose.

#### Current Implementation

**Context Injection:**

- context-loader.ts:61-75: Loads PR title + body and sanitizes
- All agents inject as `## PR Description` section in user prompt

Example injected context:

```
## PR Description

The author describes this PR as:

[PR title and body...]
```

**Prompt Guidance:**

- All four prompts (semantic_review.md, opencode_system.md, pr_agent_review.md, architecture_review.md): **NO MENTION of PR description anywhere**
- Prompts don't instruct: "Verify findings against the PR purpose"
- Prompts don't instruct: "Don't flag the PR's stated purpose as a problem"

#### Identified Gaps

**Gap D1: No Explicit Verification Against PR Purpose**
Issues #160 findings 1-2:

- PR stated: "Add new security feature"
- Finding: "Why is security check being added?" (flagging the purpose)

Issues #158 findings 6, 10:

- PR stated: "Refactor without adding docs"
- Finding: "Why aren't there new docs?" (flagging the stated intent)

**Gap D2: No Guidance on Design Decision Verification**
Issues #160, #161 show findings that contradict PR purpose:

- PR purpose: "Fix X"
- Finding: "You should have fixed Y instead" (suggesting alternative designs)

**Gap D3: Missing "Intentional" Detection**
When a PR description says "Intentionally [pattern]" or "By design [pattern]", prompts should recognize this.

#### Specific Prompt Improvements Needed

**Add new section to all four prompt files (after "Core Rules"):**

```markdown
## PR Context Verification

The prompt includes a "PR Description" section with the author's stated purpose and scope.

**BEFORE REPORTING A FINDING**:

1. **Verify the finding is not the PR's stated purpose**: If the PR says "Add feature X", do NOT report "X should be added" as a finding. Do NOT report "Why is X being added?" if the answer is obvious from the PR description.

2. **Verify the finding doesn't contradict the PR's stated scope**: If the PR says "Refactor without adding docs", do NOT flag "Missing documentation added". If it says "Fix bug X only", do NOT flag "Bug Y should be fixed too."

3. **Verify the finding respects stated design decisions**: If the PR description explains why a pattern was chosen (e.g., "Using approach A for performance"), do NOT suggest approach B as "better." Instead, report at "info" severity with: "Note: The PR description states this approach was chosen for [reason]."

4. **Detect intentional patterns**: If the code comment or PR description says "Intentionally [pattern]" or "By design [pattern]", treat this as a documented choice. Do NOT flag it as a problem.

5. **Check for existing documentation**: Before suggesting "add documentation", verify that the PR description doesn't say documentation already exists elsewhere (e.g., "documented in CONTRIBUTING.md").
```

**Enhance context-loader.ts to extract PR metadata:**

```typescript
export function extractPRIntentPatterns(description: string): {
  statedPurpose: string[];
  excludedScopes: string[];
  intentionalPatterns: string[];
} {
  const statedPurpose: string[] = [];
  const excludedScopes: string[] = [];
  const intentionalPatterns: string[] = [];

  // Detect purpose statements: "Add X", "Fix Y", "Refactor Z"
  const purposePatterns = /^(Add|Fix|Refactor|Remove|Update|Improve)\s+(.+?)(?:\n|$)/gim;
  let match;
  while ((match = purposePatterns.exec(description)) !== null) {
    statedPurpose.push(`${match[1]} ${match[2]}`);
  }

  // Detect scope exclusions: "without", "does not", "intentionally"
  const exclusionPatterns = /without\s+(.+?)(?:\n|[,.])/gi;
  while ((match = exclusionPatterns.exec(description)) !== null) {
    excludedScopes.push(`without ${match[1]}`);
  }

  // Detect intentional patterns
  const intentionalPatterns = /(?:intentional|by design|deliberately)\s+(.+?)(?:\n|[,.])/gi;
  while ((match = intentionalPatterns.exec(description)) !== null) {
    intentionalPatterns.push(match[1]);
  }

  return { statedPurpose, excludedScopes, intentionalPatterns };
}
```

**Update agents to log PR context metadata:**

```typescript
// In buildReviewPrompt() or buildUserPrompt(), add:
const prMeta = extractPRIntentPatterns(context.prDescription || '');
console.log(`[agent] PR Intent: ${prMeta.statedPurpose.join(', ')}`);
console.log(`[agent] Excluded Scopes: ${prMeta.excludedScopes.join(', ')}`);
```

---

### Pattern F: Mixed - Combines B/C/D Weaknesses

**Status:** INHERITS GAPS FROM B/C/D
**Root Cause:** 13 fixtures fail due to combinations of:

- Framework convention not recognized (Pattern B)
- Project rule ignored (Pattern C)
- PR purpose flagged anyway (Pattern D)

#### Example from Issues

**Issue #160 finding 2 (Pattern D + B):**

- PR states: "Implement permission checks"
- Finding: "Why is permission check being added?" (flagging stated purpose)
- Also fails to recognize: Framework pattern for permission checking (Pattern B)

**Issue #161 finding 1 (Pattern D + C):**

- PR states: "Refactor with intentional design X"
- Finding: "Design X is wrong, use Y instead" (contradicts PR description)
- Also fails to check: Project rules might prefer design X (Pattern C)

#### Solution

Implementing improvements for B, C, and D automatically improves Pattern F coverage. No additional changes needed beyond the three sections above.

---

## Summary of Actionable Recommendations

### Priority 1: Add Explicit Meta-Instructions (HIGH IMPACT)

1. **Expand Framework Convention rules** (semantic_review.md:59-76) to include IDENTIFICATION guidance, not just "don't flag" warnings
   - Estimated impact: Fix 4-5 Pattern B fixtures
   - Implementation: 30 minutes, update all 4 prompt files

2. **Add "Check Project Rules" directive** (new section in all prompts) to prevent contextually-invalid findings
   - Estimated impact: Fix 3-4 Pattern C fixtures
   - Implementation: 30 minutes, update context-loader.ts and all 4 prompt files

3. **Add "Verify PR Purpose" directive** (new section in all prompts) to prevent flagging stated intent
   - Estimated impact: Fix 4-5 Pattern D fixtures
   - Implementation: 45 minutes, update context-loader.ts (metadata extraction) and all 4 prompt files

### Priority 2: Make Patterns Deterministic (MEDIUM IMPACT)

4. **Add static pattern detection for Framework Conventions B1-B5** (post-LLM filtering)
   - What: After LLM returns findings, filter out recognized framework patterns
   - Code changes: New file `router/src/report/framework-pattern-filter.ts`
   - Estimated impact: Fix remaining Pattern B fixtures (robust fallback)
   - Implementation: 2-3 hours

5. **Add PR intent extraction and conflict detection** (context-loader enhancement)
   - What: Extract stated purpose/excluded scopes; filter findings that match
   - Code changes: Enhance context-loader.ts with metadata extraction; call from report.ts
   - Estimated impact: Fix remaining Pattern D fixtures
   - Implementation: 2-3 hours

### Priority 3: Strengthen Testing (LOW IMPACT, HIGH CONFIDENCE)

6. **Expand prompt-sync test** to verify new meta-instructions are present
   - Update router/tests/unit/prompts/prompt-sync.test.ts to check for new sections
   - Estimated impact: Prevent future drift
   - Implementation: 30 minutes

---

## Files Requiring Changes

### Prompt Files (Update All 4)

- `config/prompts/semantic_review.md`
- `config/prompts/opencode_system.md`
- `config/prompts/pr_agent_review.md`
- `config/prompts/architecture_review.md`

### Agent Source Files (Update Hardcoded Fallbacks)

- `router/src/agents/opencode.ts` (lines 101-103)
- `router/src/agents/ai_semantic_review.ts` (lines 236-237)
- `router/src/agents/pr_agent.ts` (lines 213-214)

### Infrastructure

- `router/src/context-loader.ts` (add PR metadata extraction)
- `router/tests/unit/prompts/prompt-sync.test.ts` (expand verification)

### Optional (Deterministic Fallback)

- `router/src/report/framework-pattern-filter.ts` (new file)

---

## Determination: Which Patterns Can Be Made Deterministic?

### Pattern B (Framework Conventions): PARTIALLY DETERMINISTIC ✅

**Rules that can be code-validated:**

1. **Express error middleware** (Rule B1): Check function signature has 4 params + registered with `.use()` or middleware array → **80% deterministic**
2. **Query library keys** (Rule B2): Check for `useQuery()`, `useSWR()`, `useQuery()` Apollo with identical key → **70% deterministic**
3. **Promise.allSettled** (Rule B3): Check for `.allSettled()` followed by array iteration → **85% deterministic**
4. **TypeScript \_prefix** (Rule B4): Check parameter/variable starts with `_` → **95% deterministic**
5. **Exhaustive switches** (Rule B5): Check `assertNever()` or `default: throw` in typed switches → **90% deterministic**
6. **Constant externalization** (Rule B6): Check constant is adjacent to only usage site → **60% deterministic**

**Recommendation:** Create `framework-pattern-filter.ts` that applies regexes to recognize B1-B5 and suppress matching LLM findings.

### Pattern C (Project Context): NOT DETERMINISTIC ❌

**Why:** Requires semantic understanding of project intent. Code changes can be wrong without checking CLAUDE.md (requires human judgment). Better to strengthen prompts and rely on LLM context awareness.

### Pattern D (PR Description): SEMI-DETERMINISTIC ⚠️

**Rules that can be code-validated:**

- Don't flag patterns mentioned in PR description → **Extract PR keywords, filter findings** (70% reliable)
- Don't flag "missing" when PR excludes that scope → **Extract scope keywords, filter findings** (60% reliable)

**Recommendation:** Extract PR intent metadata and use as post-LLM filter; still lower confidence than Pattern B.

---

## Risk Assessment

### No Risk

- Adding expanded prompt guidance (B, C, D expansions) — no breaking changes, only clarification

### Low Risk

- Extracting PR metadata from context-loader.ts — pure analysis, no filtering applied immediately

### Medium Risk

- Creating framework-pattern-filter.ts to suppress findings — could suppress legitimate findings if regex is too broad
  - **Mitigation:** Whitelist-based (only suppress known patterns), log all suppressions, start with Pattern B4 (\_prefix) which is 95% deterministic

### Residual Risk

- Pattern F (mixed) may still have 3-5 fixtures that fail due to novel combinations of B/C/D gaps
  - **Mitigation:** Benchmark test suite will catch, can be addressed in follow-up iteration

---

## Prompt File Line References for Quick Implementation

### semantic_review.md

- Lines 3-8: Core Rules (keep as-is, clear)
- **Lines 59-76: Framework & Language Conventions → EXPAND with IDENTIFICATION guidance**
- **NEW (after line 8): Add "## Project Context" section**
- **NEW (after Project Context): Add "## PR Context Verification" section**

### opencode_system.md

- Lines 1-8: Core Rules (keep as-is)
- **Lines 51-68: Framework & Language Conventions → EXPAND**
- **NEW (after line 8): Add "## Project Context" section**
- **NEW: Add "## PR Context Verification" section**

### pr_agent_review.md

- Lines 1-8: Core Rules (keep as-is)
- **Lines 51-68: Framework & Language Conventions → EXPAND**
- **NEW (after line 8): Add "## Project Context" section**
- **NEW: Add "## PR Context Verification" section**

### architecture_review.md

- Lines 14-31: Framework & Language Conventions (keep as-is, already present)
- **NEW: Add "## Project Context" section**
- **NEW: Add "## PR Context Verification" section**

---

## Implementation Timeline

- **Phase 1 (2-3 hours):** Expand all 4 prompt files with new sections + update hardcoded fallbacks
- **Phase 2 (2-3 hours):** Enhance context-loader.ts with PR metadata extraction
- **Phase 3 (2-3 hours):** Create framework-pattern-filter.ts for deterministic Pattern B detection
- **Phase 4 (1 hour):** Update prompt-sync.test.ts to verify new sections present
- **Testing (2-3 hours):** Run benchmark against improved prompts, validate fixture fixes

**Total estimate: 10-15 hours** for full implementation including testing.

---

## Conclusion

The current prompt framework is **architecturally sound** but **lacks explicit directives** for LLM behavior when context is present. The proposed improvements add:

1. **Recognition guides** for framework conventions (not just "don't flag" warnings)
2. **Explicit check directives** for project rules and PR purpose
3. **Deterministic fallback filters** for high-confidence patterns
4. **Test verification** to prevent future drift

These changes are **low-risk** (pure additions, no breaking changes) and should fix **12-18 of the 27 skipped fixtures** with high confidence.
