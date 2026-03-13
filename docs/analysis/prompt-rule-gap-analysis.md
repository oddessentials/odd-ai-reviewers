# Prompt & Rule Gap Analysis

Analysis of remaining false positives NOT addressed by existing mitigations, with specific fix proposals.

## Current Pipeline Architecture

```
LLM agents (semantic_review, opencode, pr_agent, architecture_review)
  -> Stage 1: validateFindingsSemantics() [self-contradiction filter]
  -> Framework pattern filter (3 matchers: express-error-mw, ts-unused-prefix, exhaustive-switch)
  -> Stage 2: validateNormalizedFindings() [line validation + self-contradiction]
  -> Platform reporters (GitHub/ADO)
```

Existing prompt conventions (1-6) are duplicated across all 4 prompt files.
PR intent contradiction is diagnostic-only (logged, never suppresses).

---

## Gap 1: Factual Errors / LLM Hallucinations (Pattern F)

**FPs affected:** 9 (FP-158-6, 158-10, 159-3, 159-5, 159-6, 159-7, 159-8, 159-9, 161-3, 161-5) = 21.4%
**Severity mix:** 1 critical, 2 warning, 6 info

### Root Cause

The prompts say "verify the exact element you reference actually exists" (Misattribution prevention) but this instruction is not strong enough. The LLM still:

- Claims code constructs that don't exist in the diff (FP-159-5, 159-6, 159-9)
- Gets line numbers wrong (FP-159-6)
- Misunderstands API semantics (FP-161-3: confused two rate-limiting mechanisms; FP-161-5: didn't trace singleflight key)
- Claims code lacks documentation when it has it (FP-158-6)
- Suggests verifying values already confirmed correct (FP-158-10)

### Fix: Prompt Convention 7 — Existence Verification (all 4 prompts)

**Location:** `config/prompts/semantic_review.md` line 53-57 (Misattribution prevention section), replicated in all prompts

**Proposed addition (new convention 7):**

```markdown
7. **Existence verification before reporting**: Before reporting ANY finding:
   - Verify the specific code construct (function call, variable, element, assertion) you reference EXISTS in the diff at the line you cite
   - Do NOT claim code "lacks documentation" without checking surrounding context lines for existing comments
   - Do NOT claim values are incorrect without evidence of a mismatch in the source
   - Do NOT flag ordering issues (check-before-action) unless the check and action are part of the SAME subsystem
   - When analyzing caching/deduplication patterns (singleflight, memoization), examine the FULL cache key before claiming shared-state issues
   - If you cannot find the exact construct in the diff, OMIT the finding entirely — do not guess
```

**Blast radius:** Low. This is a reinforcement of existing Misattribution prevention rules with specific anti-patterns. No deterministic filter changes.
**FPs addressed:** Up to 9 (all Pattern F)
**TP risk:** None — this only prevents the LLM from fabricating findings

---

## Gap 2: Over-Engineering Suggestions (Pattern E)

**FPs affected:** 5 unaddressed (FP-158-9, 159-10, 159-11, 160-5, 160-9) + 2 partially addressed = 16.7%
**Severity:** All info

### Root Cause

Convention 6 (constant externalization) addresses one sub-pattern but not:

- Runtime validation for TypeScript-typed values (FP-158-9)
- Business/budget decisions flagged as code issues (FP-159-10)
- Root orchestrator "too complex" suggestions (FP-159-11)
- Init-time performance "optimization" suggestions (FP-160-5)
- Comments on self-documenting code (FP-160-9)
- Refactoring consistent file patterns (FP-160-3)

### Fix: Prompt Conventions 8-10 (all 4 prompts)

**Location:** After convention 6 in Framework & Language Conventions section

```markdown
7. **TypeScript type-system trust**: Do NOT suggest adding runtime type validation (type guards, assertions, instanceof checks) for values already constrained by TypeScript's type system (union types, enums, branded types, `as const`). The compiler enforces these constraints at build time.
   - DO NOT flag: Missing runtime check for a parameter typed as `'low' | 'medium' | 'high'`
   - DO NOT flag: Missing assertion for a value returned from a Zod `.parse()` call
   - DO flag: Unvalidated `string` from user input used as an enum key

8. **No business-decision findings**: Do NOT flag budget amounts, pricing values, resource limits, timeout durations, or retry counts as code quality issues unless they cause a functional bug. These are intentional business or operational decisions.

9. **No cosmetic refactoring suggestions**: Do NOT suggest:
   - Splitting components/functions that serve as root orchestrators unless specific extractable logic is identified AND the PR is about refactoring
   - Optimizing code that runs once during initialization unless profiling shows a bottleneck
   - Adding comments to code where variable names and logic make intent clear
   - Extracting expressions that match a consistent pattern used throughout the file
   - Expanding/reformatting minified code (GLSL, inlined SQL, bundled assets) unless the PR is about readability
```

**Blast radius:** Low. These prevent low-value suggestions. No deterministic changes.
**FPs addressed:** 5 unaddressed + may improve 2 partially addressed (conventions 6-related)
**TP risk:** Minimal — these are info-severity cosmetic suggestions, not security findings

---

## Gap 3: Project Context Blindness (Pattern C)

**FPs affected:** 7 partially addressed (FP-158-5, 159-13, 160-4, 160-6, 160-7, 160-8, 161-1)
**Severity:** 1 critical, 1 warning, 5 info

### Root Cause

Active Context Directives exist but are too passive. They say "CHECK Project Rules" but don't enforce hard constraints. The LLM reads the rules but still generates findings that contradict them. Issues:

- Model ignores CLAUDE.md mandates (FP-159-13: single CSS file mandate)
- Model misses design intent (FP-158-5: cache key undefined by design; FP-161-1: quota consumption by design)
- Model misses project constraints (FP-160-6: no test framework; FP-160-7: bundle budget)
- Model misses brand/constitution values (FP-160-4: 0x0DD brand hex)

### Fix: Strengthen Active Context Directives (all 4 prompts)

**Location:** `config/prompts/semantic_review.md` lines 96-109 (Active Context Directives section)

**Replace with:**

```markdown
### Active Context Directives

Before generating any findings:

1. **MANDATORY: Check Project Rules** (if the "Project Rules" section is present above):
   - Read ALL project rules FIRST, before any code analysis
   - HARD CONSTRAINT: Do NOT generate ANY finding that contradicts a documented project decision
   - If a project rule mandates a specific structure (e.g., "single CSS file", "no test framework"), do NOT suggest alternatives
   - Check project constitution, CLAUDE.md, and brand guidelines before flagging hardcoded values as magic numbers
   - Do NOT suggest "extract for testability" when no test framework/infrastructure exists in the project

2. **MANDATORY: Check PR Description** (if the "PR Description" section is present above):
   - Read the PR title and description to understand the author's stated intent
   - Do NOT flag the exact behavior or change described in the PR purpose
   - If a PR explicitly describes conditional/environment-dependent behavior, do NOT flag that behavior as inconsistent
   - If the PR description explains WHY a change was made, do NOT generate findings that question that reasoning

3. **Design intent awareness**:
   - Before flagging resource leaks (rate limit slots, semaphores, locks), verify whether intentional consumption without release is part of the design (e.g., quota systems, token buckets)
   - Before flagging undefined/optional fields in cache keys or fingerprints, check if the design intentionally uses absence as a discriminator
   - Before flagging instanceof checks, consider whether the architecture guarantees single instances
```

**Blast radius:** Medium. Strengthens from "CHECK" to "MANDATORY" and adds specific patterns. Could cause the LLM to under-report in edge cases where project rules are ambiguous.
**FPs addressed:** Up to 7 (all Pattern C partially addressed)
**TP risk:** Low-medium — the hard constraint only applies when project rules are documented. Security findings with clear user-input data flow should still pass.

---

## Gap 4: Framework Conventions Not in Filter (Pattern B residuals)

**FPs affected:** 3 (FP-159-12 React useRef, FP-161-7 Promise.allSettled, FP-161-10 React Query)
**Severity:** 1 warning, 2 info

### Root Cause

The framework-pattern-filter.ts has only 3 matchers (express-error-mw, ts-unused-prefix, exhaustive-switch). The prompt conventions cover React Query (2), Promise.allSettled (3), and React patterns, but the LLM still ignores them in some cases. The deterministic filter doesn't catch these because there are no matchers for them.

Two sub-issues:

1. **Prompt conventions 2 and 3 are not effective** — the LLM still flags React Query dedup and Promise.allSettled order despite explicit instructions
2. **React useRef(null) with type assertion** has no prompt convention at all

### Fix: Dual approach

#### 4a. Add prompt convention for React useRef (all prompts)

```markdown
10. **React useRef pattern**: `useRef<T>(null)` with type assertions or non-null assertions on `.current` is a standard React 18+ TypeScript pattern. Do NOT flag `ref.current!` or `as T` on ref values as unsafe when the ref is initialized via `useRef<T>(null)`.
```

#### 4b. Add 2 new framework filter matchers (framework-pattern-filter.ts)

**File:** `router/src/report/framework-pattern-filter.ts` — expand from 3 to 5 matchers

**New matcher T022: React Query dedup**

```typescript
{
  id: 'react-query-dedup',
  name: 'React Query Dedup',
  messagePattern: /duplicate|double.?fetch|redundant.*query|multiple.*useQuery/i,
  evidenceValidator(finding, diffContent) {
    const section = extractFileDiffSection(finding, diffContent);
    if (!section) return false;
    // Must have React Query / SWR / Apollo import
    return /from\s+['"]@tanstack\/react-query['"]/.test(section) ||
           /from\s+['"]swr['"]/.test(section) ||
           /from\s+['"]@apollo\/client['"]/.test(section);
  },
  suppressionReason: 'Query library deduplicates by cache key — not double-fetching',
}
```

**New matcher T023: Promise.allSettled order**

```typescript
{
  id: 'promise-allsettled-order',
  name: 'Promise.allSettled Order',
  messagePattern: /allSettled.*order|order.*allSettled|results.*not.*match/i,
  evidenceValidator(finding, diffContent) {
    const section = extractFileDiffSection(finding, diffContent);
    if (!section) return false;
    return /Promise\.allSettled\s*\(/.test(section);
  },
  suppressionReason: 'Promise.allSettled preserves input order per ECMAScript spec',
}
```

**Blast radius:** Low. Adding matchers to a closed table requires spec amendment, but the matchers are narrow and evidence-validated.
**FPs addressed:** 3 (all Pattern B residuals)
**TP risk:** None — these matchers require specific evidence (import statements, API calls)

---

## Gap 5: PR Intent Contradiction Suppression (Pattern D)

**FPs affected:** 2 (FP-158-2, FP-160-2)
**Severity:** All info

### Root Cause

`logPRIntentContradictions()` in finding-validator.ts is diagnostic-only — it logs warnings but never suppresses findings. The function has a simple verb-contradiction heuristic that could be upgraded to filter.

### Fix: Upgrade to suppression (finding-validator.ts)

**File:** `router/src/report/finding-validator.ts` lines 123-159

**Change:** Rename `logPRIntentContradictions` to `filterPRIntentContradictions`, return a list of suppressed finding indices. Integrate into `validateFindingsSemantics()` as a fourth filter pass.

**Constraints to prevent TP regression:**

- Only suppress info-severity findings (never warning/error/critical)
- Only suppress when the PR verb+subject match AND the finding verb is a contradiction
- Log all suppressions for auditability

**Blast radius:** Medium. Converting diagnostic to suppression is a behavioral change. Needs careful testing.
**FPs addressed:** 2 (Pattern D)
**TP risk:** Low if restricted to info severity. Warning+ findings about the PR's own changes may still be valid (e.g., security issue in a feature the PR is adding).

---

## Gap 6: Shell/Config Files Outside AST Analysis (Pattern A residuals)

**FPs affected:** 2 (FP-158-1 .husky/pre-push, FP-159-1 cross-function taint)
**Severity:** Both warning

### Root Cause

Safe-source detector only handles TypeScript/JavaScript files via the compiler API. Shell scripts, Makefiles, and other non-TS files fall outside its scope. Additionally, cross-function taint analysis is not implemented — the detector can only trace within a single function body.

### Fix: Prompt convention for developer tooling (all prompts)

```markdown
11. **Developer tooling files**: Do NOT flag shell commands in developer tooling hooks (.husky/, Makefiles, scripts/) or CI configuration (.github/workflows/) as injection risks unless the command arguments demonstrably come from user-controlled environment variables or external input. git hooks and CI steps run in controlled environments.
```

Cross-function taint analysis is architectural and beyond the scope of prompt/filter fixes. For FP-159-1, the prompt rule above partially addresses it.

**Blast radius:** Low. Only affects non-source files.
**FPs addressed:** 2 (Pattern A residuals)
**TP risk:** Minimal — real shell injection in hooks would involve `$USER_INPUT` or similar, which the rule still allows flagging.

---

## Gap 7: Binary Response Bodies Flagged as XSS (Pattern A)

**FPs affected:** 1 (FP-159-2)
**Severity:** Warning

### Root Cause

No prompt rule distinguishes binary response bodies (audio, images, Buffers) from HTML responses. The LLM sees a `res.send()` or `res.write()` and assumes XSS potential.

### Fix: Add to Data-flow verification section (all prompts)

Add to the "Security sinks require data-flow verification" section:

```markdown
- Binary response bodies (audio, images, ArrayBuffer, Buffer) sent via res.send/res.write with non-HTML content-type headers are NOT XSS vectors — do not flag
- Zod-validated inputs that pass .parse() are type-safe — do not flag as "potentially unsafe" unless the Zod schema itself is permissive (e.g., z.string() with no constraints on user-facing HTML output)
```

**Blast radius:** Very low. Specific to binary responses.
**FPs addressed:** 1
**TP risk:** None — binary data cannot cause XSS

---

## Priority Matrix

| Priority | Gap                                          | FPs Fixed | Complexity               | TP Risk | Fix Type        |
| -------- | -------------------------------------------- | --------- | ------------------------ | ------- | --------------- |
| **P1**   | Gap 1: Existence verification (convention 7) | 9         | Low (prompt)             | None    | Prompt          |
| **P2**   | Gap 2: Over-engineering (conventions 8-10)   | 5-7       | Low (prompt)             | None    | Prompt          |
| **P3**   | Gap 3: Active Context strengthening          | 7         | Medium (prompt)          | Low-med | Prompt          |
| **P4**   | Gap 4: Framework filter + React useRef       | 3         | Medium (filter + prompt) | None    | Filter + prompt |
| **P5**   | Gap 5: PR intent suppression                 | 2         | Medium (code)            | Low     | Code            |
| **P6**   | Gap 6: Developer tooling (convention 11)     | 2         | Low (prompt)             | Minimal | Prompt          |
| **P7**   | Gap 7: Binary responses                      | 1         | Low (prompt)             | None    | Prompt          |

**Total addressable FPs:** 29-31 out of 33 remaining (after 9 already fully addressed)
**Implementation estimate:** Prompts only = ~2-3 hours. Prompts + filter matchers + PR intent suppression = ~5-7 hours.

---

## Files Modified

### Prompt files (conventions 7-11, ACDs, data-flow additions):

- `config/prompts/semantic_review.md`
- `config/prompts/opencode_system.md`
- `config/prompts/pr_agent_review.md`
- `config/prompts/architecture_review.md`

### Filter code:

- `router/src/report/framework-pattern-filter.ts` — add matchers T022 (React Query dedup), T023 (Promise.allSettled order)

### Validation code:

- `router/src/report/finding-validator.ts` — upgrade `logPRIntentContradictions()` to suppress info-severity contradictions

### Test files (new/updated):

- `router/tests/unit/report/framework-pattern-filter.test.ts` — tests for T022, T023
- `router/src/__tests__/report/finding-validator.test.ts` — tests for PR intent suppression
- `router/tests/integration/false-positive-benchmark.test.ts` — new benchmark scenarios for Gaps 1-7

---

## What Cannot Be Fixed by Prompts/Filters

1. **Cross-function taint analysis** (FP-159-1 partial) — requires architectural change to safe-source-detector.ts to trace callers
2. **LLM hallucination elimination** (Gap 1) — prompts can reduce but not eliminate; these are inherent LLM limitations. The existence verification convention makes it harder for the LLM to hallucinate, but some will still occur.
3. **Prompt convention enforcement** — prompts tell the LLM what not to do, but enforcement is probabilistic. The framework-pattern-filter provides deterministic backup for the highest-value patterns.
