# False-Positive Taxonomy Analysis

All 42 false positives from issues #158, #159, #160, #161, categorized by failure pattern.

## Pattern Definitions

| Code  | Name                           | Description                                                                 |
| ----- | ------------------------------ | --------------------------------------------------------------------------- |
| **A** | SAST without data-flow         | Flagging RegExp/path.join/innerHTML without tracing user input              |
| **B** | Framework convention ignorance | Express 4-param, React Query dedup, Promise.allSettled order                |
| **C** | Project context blindness      | Ignoring CLAUDE.md rules, documented constants, constitution                |
| **D** | PR intent contradiction        | Flagging the exact change described in the PR purpose                       |
| **E** | Over-engineering suggestions   | Externalize constants, add runtime checks for typed values                  |
| **F** | Factual errors                 | Wrong line numbers, claiming code that doesn't exist, misunderstanding APIs |
| **G** | Self-contradicting findings    | Flagging then immediately dismissing                                        |

## Existing Mitigations

| Mitigation                                                                                                        | Shipped In | Addresses                    |
| ----------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------- |
| Safe-source detection (9 patterns: const literals, \_\_dirname, fs.readdirSync, const array element access)       | v1.8.0     | Pattern A                    |
| Framework pattern filter (3 matchers: Express error MW, TS \_prefix, exhaustive switch)                           | v1.8.0     | Pattern B (partial)          |
| Self-contradiction filter (Unicode-hardened, info + dismissive + no suggestion)                                   | v1.8.0     | Pattern G                    |
| PR intent contradiction logging (diagnostic only, no suppression)                                                 | v1.8.0     | Pattern D (diagnostic only)  |
| Prompt conventions 1-6 (Express MW, React Query, Promise.allSettled, \_prefix, assertNever, constant co-location) | v1.8.0     | Pattern B / E (prompt-level) |
| Active Context Directives (instructions to check project rules and PR description)                                | v1.8.0     | Pattern C / D (prompt-level) |

---

## Issue #158 (odd-fintech PR #53) -- 10 FPs

### FP-158-1: .husky/pre-push -- Shell injection

- **Severity:** warning
- **Claimed:** Shell command injection risk with `docker compose`
- **Actual:** No user-controlled input; developer-side git hook
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** PARTIALLY ADDRESSED -- Safe-source detects const literals and \_\_dirname, but shell scripts in .husky/ are outside TypeScript AST analysis. The safe-source detector only handles TS/JS files.
- **Remaining gap:** Shell/config files not analyzed by safe-source detector. Prompt-level rule needed: "Do not flag shell commands in developer tooling hooks (.husky/, Makefiles) unless arguments come from environment variables or user input."

### FP-158-2: .husky/pre-push -- Conditional Python validation

- **Severity:** info
- **Claimed:** Inconsistent behavior across environments
- **Actual:** Inconsistency is intentional; CI enforces
- **Pattern:** **D** (PR intent contradiction)
- **Mitigation status:** PARTIALLY ADDRESSED -- PR intent logging is diagnostic-only (no suppression). Active Context Directives tell LLM to read PR description, but the model still flagged it.
- **Remaining gap:** PR intent contradiction filter does not suppress. Need stronger prompt rule: "If a PR explicitly describes conditional/environment-dependent behavior, do not flag that behavior as inconsistent."

### FP-158-3: qualityFilter.ts -- ReDoS via RegExp()

- **Severity:** warning
- **Claimed:** RegExp() with function argument poses ReDoS risk
- **Actual:** HEDGE_PHRASES is a hardcoded constant array
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Safe-source pattern `constant-literal-array` (FR-001) marks module-scope const arrays as safe. Taint tracking should recognize `HEDGE_PHRASES` is not user-controlled.
- **Remaining gap:** None if safe-source detector runs before ReDoS analysis. Verify integration ordering.

### FP-158-4: validator.test.ts -- Path traversal via path.join

- **Severity:** warning
- **Claimed:** path.join with user input
- **Actual:** path.join(\_\_dirname, filenames from fs.readdirSync)
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Safe-source patterns `builtin-dirname` (FR-002) and `safe-readdir` (FR-003) cover both components of this path.join call.
- **Remaining gap:** None.

### FP-158-5: ai.ts -- Undefined modelId in fingerprint

- **Severity:** info
- **Claimed:** modelId may be undefined, causing cache misses
- **Actual:** Intentional design to prevent cross-tier contamination
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives prompt LLM to check project rules, but the model missed the design intent.
- **Remaining gap:** Prompt-level. Active Context Directives need strengthening: "Before flagging undefined/optional fields in cache keys or fingerprints, check if the design is intentional (e.g., to prevent cross-category contamination)."

### FP-158-6: numericVerifier.ts -- DERIVED_MATCH_CAP documentation

- **Severity:** info
- **Claimed:** Cap of 50 lacks documentation
- **Actual:** Line 640 already has a comment explaining the cap
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- No existing mitigation checks whether documentation already exists at the referenced line.
- **Remaining gap:** Prompt-level rule: "Before suggesting that code lacks documentation, verify that the referenced line and surrounding context do not already contain comments explaining the behavior."

### FP-158-7: numericVerifier.ts -- Externalize TIER_THRESHOLDS

- **Severity:** info
- **Claimed:** Hardcoded thresholds should be in config
- **Actual:** Intentionally hardcoded as single source of truth
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** PARTIALLY ADDRESSED -- Prompt convention 6 (constant co-location) instructs LLM not to suggest externalizing co-located constants. But the model still flagged it.
- **Remaining gap:** Prompt convention may need reinforcement or the model may not be applying it consistently. Verify prompt injection point.

### FP-158-8: numericVerifier.ts -- Externalize FRACTION_PERCENTAGE_FIELDS

- **Severity:** info
- **Claimed:** Field set should be in config
- **Actual:** Tightly coupled to schemas, not configurable
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** PARTIALLY ADDRESSED -- Same as FP-158-7. Prompt convention 6 applies but was not effective.
- **Remaining gap:** Same as FP-158-7.

### FP-158-9: numericVerifier.ts -- Runtime validation for modelTier

- **Severity:** info
- **Claimed:** Add input validation for invalid tier
- **Actual:** TypeScript strict mode already constrains; runtime check redundant
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** UNADDRESSED -- No prompt convention specifically addresses "do not suggest runtime validation for values already constrained by TypeScript's type system."
- **Remaining gap:** New prompt convention needed: "Do not suggest adding runtime type validation (e.g., type guards, assertions) for parameters that are already constrained by TypeScript's type system (union types, enums, branded types)."

### FP-158-10: pf5-aapl fixture -- peer_narrative type

- **Severity:** info
- **Claimed:** Verify peer_narrative aligns with production
- **Actual:** Already confirmed correct in source code
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- No mitigation prevents the model from suggesting verification of values that are demonstrably correct in the source.
- **Remaining gap:** Prompt-level rule: "Do not suggest verifying fixture/test data values unless there is concrete evidence of a mismatch. If the value matches the production source, it is correct."

---

## Issue #159 (chat-ui-overhaul) -- 13 FPs

### FP-159-1: durable-spooler.ts -- Path traversal via path.join

- **Severity:** warning
- **Claimed:** Path traversal risk
- **Actual:** Never called with user input; internal server paths only
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** PARTIALLY ADDRESSED -- Safe-source detects \_\_dirname and const literals but cannot trace that the calling context never passes user input. Cross-function taint analysis needed.
- **Remaining gap:** Need cross-function taint propagation or prompt rule: "When flagging path.join, trace the actual callers. If no call site passes user-controlled input, the finding is a false positive."

### FP-159-2: tts.ts -- XSS via writing to Response

- **Severity:** warning
- **Claimed:** XSS risk writing to HTTP response
- **Actual:** Binary audio buffer with Zod-validated parameter; not HTML
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** UNADDRESSED -- Safe-source does not track Zod-validated inputs as safe. Binary response bodies are not recognized as non-XSS vectors.
- **Remaining gap:** Prompt-level rule: "Binary response bodies (audio, images, buffers) are not XSS vectors. Do not flag writes to res/response when the content-type is binary or the data is a Buffer/ArrayBuffer."

### FP-159-3: server/index.ts -- Duplicate error handler

- **Severity:** warning
- **Claimed:** Duplicate error handling middleware
- **Actual:** Already fixed in a prior commit
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- The model analyzed stale state or didn't account for other commits in the PR.
- **Remaining gap:** Prompt-level rule: "When reviewing a PR with multiple commits, ensure findings reflect the final state of the code, not intermediate commits."

### FP-159-4: server/index.ts -- \_next parameter unused

- **Severity:** warning
- **Claimed:** Unused parameter `_next`
- **Actual:** Express error middleware requires 4 parameters
- **Pattern:** **B** (Framework convention ignorance)
- **Mitigation status:** ADDRESSED -- Framework pattern filter matcher `express-error-mw` (T019) catches this: detects 4-param function + Express indicators. TS unused prefix matcher `ts-unused-prefix` (T020) also applies to `_next`.
- **Remaining gap:** None (double-covered by two matchers).

### FP-159-5: SuggestChips.tsx -- Numeric shortcut contenteditable

- **Severity:** info
- **Claimed:** Contenteditable elements pose security risk
- **Actual:** No contenteditable elements exist in the component
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- No mitigation verifies that claimed code constructs actually exist at the referenced location.
- **Remaining gap:** This is an LLM hallucination. Prompt-level rule: "Only flag code constructs that demonstrably exist in the diff. Do not flag hypothetical constructs."

### FP-159-6: EntryAnimation.tsx:73 -- Non-null assertion unsafe

- **Severity:** info
- **Claimed:** `ctx!` non-null assertion is unsafe at line 73
- **Actual:** No `ctx!` at line 73; assertions in code follow null checks
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- Wrong line number / hallucinated code.
- **Remaining gap:** Same as FP-159-5.

### FP-159-7: EntryAnimation.tsx:135 -- ImageBitmap resource leak

- **Severity:** info
- **Claimed:** ImageBitmap not cleaned up, resource leak
- **Actual:** cleanup() is properly called in all exit paths
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- Model failed to trace cleanup paths.
- **Remaining gap:** Prompt rule: "Before flagging resource leaks, verify that cleanup/dispose/close is not already called in finally blocks, return paths, or effect cleanup functions."

### FP-159-8: EntryAnimation.tsx:243 -- Early return bypasses cleanup

- **Severity:** info
- **Claimed:** Early return skips cleanup logic
- **Actual:** Return occurs before any resources are allocated
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- Model did not verify resource allocation order.
- **Remaining gap:** Same as FP-159-7.

### FP-159-9: MessageList.tsx:34 -- Array index as React key

- **Severity:** info
- **Claimed:** Using array index as key in React list
- **Actual:** All keys use `msg.id` (crypto.randomUUID)
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- Hallucinated: model claimed array index keys that don't exist.
- **Remaining gap:** Same as FP-159-5.

### FP-159-10: .ai-review.yml:35 -- $50/month budget insufficient

- **Severity:** info
- **Claimed:** Budget may be insufficient
- **Actual:** Business decision, not a code quality issue
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** UNADDRESSED -- No rule prevents the model from opining on business/budget decisions.
- **Remaining gap:** Prompt rule: "Do not flag budget, pricing, or resource allocation values as code quality issues. These are business decisions."

### FP-159-11: ChatShell.tsx:338 -- Complex component

- **Severity:** info
- **Claimed:** Component too complex, needs splitting
- **Actual:** Root orchestrator; extractable logic already delegated
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** UNADDRESSED -- No rule addresses complexity suggestions for orchestrator/root components.
- **Remaining gap:** Prompt rule: "Do not suggest splitting components that serve as root orchestrators unless specific extractable logic is identified and the PR is about refactoring."

### FP-159-12: InputBar.tsx:158 -- Type assertion on useRef

- **Severity:** info
- **Claimed:** Type assertion on useRef is unsafe
- **Actual:** Standard React 18 TypeScript pattern (`useRef<T>(null)` with `as`)
- **Pattern:** **B** (Framework convention ignorance)
- **Mitigation status:** UNADDRESSED -- Framework filter has no matcher for React useRef patterns.
- **Remaining gap:** Prompt convention needed: "useRef<T>(null) with type assertions is a standard React 18+ TypeScript pattern. Do not flag it as unsafe."

### FP-159-13: styles.css:1122 -- Large CSS file modularization

- **Severity:** info
- **Claimed:** CSS file too large, should be modularized
- **Actual:** CLAUDE.md mandates a single CSS file
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives tell the LLM to check CLAUDE.md, but the model ignored the rule.
- **Remaining gap:** Prompt strengthening: "ALWAYS check the project's CLAUDE.md / .ai-review.yml for explicit architectural mandates before suggesting structural changes. If a rule mandates a specific structure, do not suggest alternatives."

---

## Issue #160 (oddessentials-splash PR #31) -- 9 FPs

### FP-160-1: keyboard.js -- innerHTML XSS

- **Severity:** critical
- **Claimed:** innerHTML assignment is an XSS vector
- **Actual:** Fed from hardcoded LEGEND_CUBE / LEGEND_NAV arrays (constant literals)
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Safe-source pattern `constant-literal-array` (FR-001) marks these as safe, and `constant-element-access` (FR-004) covers indexed access on const arrays.
- **Remaining gap:** None if safe-source detector is integrated before innerHTML taint analysis.

### FP-160-2: keyboard.js:146 -- Enter key negated focus checks

- **Severity:** info
- **Claimed:** Negated focus check logic may be incorrect
- **Actual:** This is the exact intentional change described in the PR
- **Pattern:** **D** (PR intent contradiction)
- **Mitigation status:** PARTIALLY ADDRESSED -- PR intent logging is diagnostic-only (no suppression).
- **Remaining gap:** Need PR intent contradiction to suppress or at least downgrade, not just log.

### FP-160-3: keyboard.js:147 -- Complex boolean / modifier guard helper

- **Severity:** info
- **Claimed:** Complex boolean expression, extract to helper
- **Actual:** Consistent pattern used throughout the file; extraction would break consistency
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** UNADDRESSED -- No rule for "do not suggest extracting expressions that match an established file-level pattern."
- **Remaining gap:** Prompt rule: "If a coding pattern is used consistently throughout a file, do not suggest refactoring individual instances unless the PR is specifically about refactoring."

### FP-160-4: glitch.js:18 -- Magic number 0x0DD

- **Severity:** warning
- **Claimed:** Magic number should be named constant
- **Actual:** Documented in project constitution as the brand hex value
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives instruct checking project rules, but the model missed the constitution reference.
- **Remaining gap:** Prompt strengthening: "Check project constitution, CLAUDE.md, and brand guidelines before flagging hardcoded values as magic numbers."

### FP-160-5: glitch.js:44 -- Noise texture loop optimization

- **Severity:** info
- **Claimed:** Loop could be optimized
- **Actual:** One-time initialization, sub-millisecond; optimization has no benefit
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** UNADDRESSED -- No rule about not optimizing one-time initialization code.
- **Remaining gap:** Prompt rule: "Do not suggest performance optimizations for code that runs once during initialization unless profiling data shows it's a bottleneck."

### FP-160-6: glitch.js:67 -- Extract block order generation

- **Severity:** info
- **Claimed:** Extract to testable function
- **Actual:** No test framework exists for this project
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives apply but model didn't check project structure.
- **Remaining gap:** Prompt rule: "Do not suggest 'extract for testability' when the project has no test framework or test infrastructure. Check for test directories/configs first."

### FP-160-7: glitch.js:290 -- GLSL shader readability

- **Severity:** info
- **Claimed:** Shader code should be more readable
- **Actual:** Intentionally minified for bundle budget
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives apply but model missed bundle budget constraints.
- **Remaining gap:** Prompt rule: "Do not suggest expanding/reformatting minified code (GLSL, inlined SQL, bundled assets) unless the PR is specifically about code readability."

### FP-160-8: main.js:81 -- findIndex with instanceof

- **Severity:** info
- **Claimed:** findIndex with instanceof may fail with multiple instances
- **Actual:** Architecture guarantees single instance per class
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives apply, but the model didn't consider architectural guarantees.
- **Remaining gap:** Prompt rule: "When flagging instanceof checks, consider whether the architecture guarantees a single module instance (e.g., no duplicate packages, singleton patterns)."

### FP-160-9: keyboard.js:146 -- Comment suggestion for Enter key

- **Severity:** suggestion
- **Claimed:** Add a comment explaining the Enter key behavior
- **Actual:** The condition is self-documenting
- **Pattern:** **E** (Over-engineering suggestion)
- **Mitigation status:** UNADDRESSED -- No rule about not suggesting comments for self-documenting code.
- **Remaining gap:** Prompt rule: "Do not suggest adding comments to code where the variable names and logic make the intent clear. Only suggest comments for non-obvious algorithms or business rules."

---

## Issue #161 (odd-fintech PR #55) -- 10 FPs

### FP-161-1: chat.ts L504 -- Rate limit slot never released

- **Severity:** critical
- **Claimed:** Rate limit slot is acquired but never released
- **Actual:** Intentional: successful invocations count against the quota (slot consumption is the design)
- **Pattern:** **C** (Project context blindness)
- **Mitigation status:** PARTIALLY ADDRESSED -- Active Context Directives apply but model missed design intent.
- **Remaining gap:** Prompt rule: "Before flagging resource leaks (rate limit slots, semaphores, locks), verify whether intentional consumption without release is part of the design (e.g., quota-based systems, token buckets)."

### FP-161-2: chat.ts L214 -- ReDoS via RegExp() with agentEmails

- **Severity:** warning
- **Claimed:** Dynamic RegExp from agentEmails poses ReDoS risk
- **Actual:** agentEmails comes from hardcoded PERSONAS registry, not user input
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Safe-source pattern `constant-literal-array` and constant object property tracking should identify PERSONAS as a hardcoded registry.
- **Remaining gap:** Verify that safe-source detector traces through object property access chains (e.g., `PERSONAS[key].email`). May need deeper property tracking.

### FP-161-3: chat.ts L358 -- System note before rate checks

- **Severity:** warning
- **Claimed:** System note sent before rate limit check, could bypass rate limiting
- **Actual:** System note is about 2-agent cap (different concern), not rate limiting
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- Model confused two different rate-limiting mechanisms.
- **Remaining gap:** Prompt rule: "When flagging ordering issues (e.g., check before action), verify that the check and the action are actually related to the same concern. Different subsystems may have independent ordering."

### FP-161-4: chat.ts L348 -- Cap message persona fallback

- **Severity:** info
- **Claimed:** Persona fallback may not work correctly
- **Actual:** 'general' persona is hardcoded with a hardcoded fallback
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Safe-source pattern `constant-literal-string` covers hardcoded string literals.
- **Remaining gap:** None.

### FP-161-5: agentInvoker.ts L231 -- Singleflight double-counts tokens

- **Severity:** critical
- **Claimed:** Singleflight pattern causes double-counting of tokens
- **Actual:** Singleflight key includes userEmail, so each user gets independent counting
- **Pattern:** **F** (Factual error)
- **Mitigation status:** UNADDRESSED -- Model failed to trace the singleflight key composition.
- **Remaining gap:** Prompt rule: "When analyzing caching or deduplication patterns (singleflight, memoization), examine the full cache key. If the key includes a discriminator (userId, email), the concern about shared state is unfounded."

### FP-161-6: qualityFilter.ts -- ReDoS via RegExp() with phrase

- **Severity:** warning
- **Claimed:** ReDoS risk from RegExp constructed with phrase variable
- **Actual:** HEDGE_PHRASES is a hardcoded const array (same as FP-158-3)
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Same as FP-158-3. Safe-source `constant-literal-array` applies.
- **Remaining gap:** None.

### FP-161-7: tickerValidator.ts L163 -- Promise.allSettled order

- **Severity:** warning
- **Claimed:** Promise.allSettled results may not preserve input order
- **Actual:** Promise.allSettled preserves input order per ECMAScript spec
- **Pattern:** **B** (Framework convention ignorance)
- **Mitigation status:** PARTIALLY ADDRESSED -- Prompt convention 3 (Promise.allSettled preserves order) exists but model still flagged it.
- **Remaining gap:** Prompt convention may not be reaching the model effectively. Verify it's included in the active review prompt.

### FP-161-8: validator.test.ts -- Path traversal via path.join

- **Severity:** warning
- **Claimed:** path.join with potentially unsafe paths
- **Actual:** Paths come from fs.readdirSync of hardcoded fixtures directory (same pattern as FP-158-4)
- **Pattern:** **A** (SAST without data-flow)
- **Mitigation status:** ADDRESSED -- Same as FP-158-4. Safe-source patterns FR-002 + FR-003 cover this.
- **Remaining gap:** None.

### FP-161-9: AgentMessageBubble.tsx L98 -- renderInline while loop rescan

- **Severity:** info
- **Claimed:** While loop may rescan unnecessarily
- **Actual:** Finding self-dismisses with "no action required"
- **Pattern:** **G** (Self-contradicting finding)
- **Mitigation status:** ADDRESSED -- Self-contradiction filter catches info + dismissive ("no action required") + no actionable suggestion.
- **Remaining gap:** None.

### FP-161-10: ChatPage.tsx L838 -- Double-fetching with useQuery

- **Severity:** warning
- **Claimed:** Multiple useQuery calls cause duplicate fetching
- **Actual:** React Query deduplicates by cache key
- **Pattern:** **B** (Framework convention ignorance)
- **Mitigation status:** PARTIALLY ADDRESSED -- Prompt convention 2 (React Query dedup) exists, but model still flagged it.
- **Remaining gap:** Same as FP-161-7. Prompt conventions may not be consistently applied by the model.

---

## Summary Statistics

### By Pattern Class

| Pattern | Name                           | Count  | % of Total |
| ------- | ------------------------------ | ------ | ---------- |
| **A**   | SAST without data-flow         | 12     | 28.6%      |
| **B**   | Framework convention ignorance | 4      | 9.5%       |
| **C**   | Project context blindness      | 7      | 16.7%      |
| **D**   | PR intent contradiction        | 2      | 4.8%       |
| **E**   | Over-engineering suggestions   | 7      | 16.7%      |
| **F**   | Factual errors                 | 9      | 21.4%      |
| **G**   | Self-contradicting findings    | 1      | 2.4%       |
|         | **Total**                      | **42** | **100%**   |

### Mitigation Status by Pattern

| Pattern   | Addressed | Partially Addressed | Unaddressed | Total                                       |
| --------- | --------- | ------------------- | ----------- | ------------------------------------------- |
| **A**     | 7         | 2                   | 1           | 12 (28.6%)                                  |
| **B**     | 1         | 2                   | 1           | 4 (9.5%)                                    |
| **C**     | 0         | 6                   | 0           | 7 (16.7%) (all partial = prompt-level only) |
| **D**     | 0         | 2                   | 0           | 2 (4.8%) (diagnostic logging only)          |
| **E**     | 0         | 2                   | 5           | 7 (16.7%)                                   |
| **F**     | 0         | 0                   | 9           | 9 (21.4%)                                   |
| **G**     | 1         | 0                   | 0           | 1 (2.4%)                                    |
| **Total** | **9**     | **14**              | **16**      | **42**                                      |

### Overall Mitigation Coverage

- **Fully addressed:** 9/42 (21.4%) -- deterministic filters catch these
- **Partially addressed:** 14/42 (33.3%) -- prompt-level mitigations exist but are insufficient
- **Unaddressed:** 16/42 (38.1%) -- need either new prompt rules or new deterministic filters (3 overlap: prompt rules exist but ineffective)

### Remaining Gaps Requiring New Mitigations

Unaddressed FPs that need new rules/filters, ranked by severity and frequency:

| Priority | Gap                                                                                                                                                     | FPs Affected                                                                     | Severity Impact               | Suggested Fix Type                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| **1**    | Factual errors / hallucinations (claiming code that doesn't exist, wrong line numbers, misunderstanding APIs)                                           | 9 FPs (FP-158-6, 158-10, 159-3, 159-5, 159-6, 159-7, 159-8, 159-9, 161-3, 161-5) | 2 warning, 7 info, 1 critical | Prompt rule + possible post-processing          |
| **2**    | Over-engineering suggestions (runtime validation for typed values, comments on clear code, optimize init code, split orchestrators, business decisions) | 5 unaddressed FPs (FP-158-9, 159-10, 159-11, 160-5, 160-9)                       | All info                      | Prompt conventions 7-11                         |
| **3**    | Project context blindness (prompt strengthening needed)                                                                                                 | 7 partially addressed FPs (FP-158-5, 159-13, 160-4, 160-6, 160-7, 160-8, 161-1)  | 1 critical, 1 warning, 5 info | Stronger Active Context Directives              |
| **4**    | Framework conventions not in filter (React useRef pattern, React Query dedup, Promise.allSettled)                                                       | 3 FPs (FP-159-12, 161-7, 161-10)                                                 | 1 warning, 2 info             | Framework filter matchers or prompt enforcement |
| **5**    | PR intent contradiction suppression (currently diagnostic-only)                                                                                         | 2 FPs (FP-158-2, 160-2)                                                          | All info                      | Upgrade from diagnostic to suppression          |
| **6**    | Cross-function taint analysis for Pattern A residuals                                                                                                   | 2 partially addressed FPs (FP-158-1, 159-1)                                      | Both warning                  | Enhanced safe-source analysis or prompt rule    |
| **7**    | Binary/non-HTML response bodies flagged as XSS                                                                                                          | 1 FP (FP-159-2)                                                                  | Warning                       | Prompt rule                                     |

### Key Findings

1. **Pattern F (factual errors) is the largest unaddressed category at 9 FPs (21.4%).** These are pure LLM hallucinations -- claiming code constructs that don't exist, wrong line numbers, misunderstanding API semantics. These cannot be caught by deterministic filters and require prompt-level improvements or a verification step.

2. **Pattern A (SAST without data-flow) is the most common at 12 FPs (28.6%), but 7 are already addressed** by safe-source detection. The remaining 5 need cross-function taint analysis or specific prompt rules for shell scripts and binary responses.

3. **Pattern C and E together account for 14 FPs (33.3%)** and are entirely prompt-level problems. The Active Context Directives and prompt conventions exist but are not consistently effective.

4. **Pattern G (self-contradicting) is nearly solved** -- only 1 FP remained and it's caught by the existing filter.

5. **The shipped v1.8.0 mitigations fully address only 21.4% of FPs.** Another 33.3% are partially addressed. The biggest ROI for the next iteration is:
   - Adding prompt rules to reduce factual errors (Pattern F)
   - Strengthening existing prompt conventions for over-engineering (Pattern E) and context blindness (Pattern C)
   - Upgrading PR intent contradiction from diagnostic to suppressive (Pattern D)
