# Prompt Modification Map — Exact Insertion Points

**Date:** 2026-03-12
**Status:** READ-ONLY ANALYSIS
**Task:** Map exact modification points for conventions 7-12, Active Context Directives, binary response rules, and developer tooling rules.

---

## File Inventory

### Prompt Files (4 files)

1. ✅ `config/prompts/semantic_review.md` — 135 lines
2. ✅ `config/prompts/pr_agent_review.md` — 128 lines
3. ✅ `config/prompts/opencode_system.md` — 138 lines
4. ✅ `config/prompts/architecture_review.md` — 58 lines

### Agent TypeScript Files (3 files)

1. ✅ `router/src/agents/ai_semantic_review.ts` — 427 lines
2. ✅ `router/src/agents/pr_agent.ts` — 410 lines
3. ✅ `router/src/agents/opencode.ts` — 486 lines

---

## SECTION 1: Framework & Language Conventions

### Current Status

All **6 conventions are present and identical** across all 4 prompt files:

1. Express error middleware (4-param requirement)
2. Query library key deduplication (React Query, SWR, Apollo)
3. Promise.allSettled order preservation
4. TypeScript `_prefix` convention
5. Exhaustive switch enforcement (assertNever)
6. Constant externalization

### Exact Line Locations

#### semantic_review.md

- **Section header:** Line 59 (`### Framework & Language Conventions`)
- **Convention 1 (Express):** Lines 63-66
- **Convention 2 (Query dedup):** Lines 68-71
- **Convention 3 (Promise.allSettled):** Lines 73-76
- **Convention 4 (\_prefix):** Lines 78-81
- **Convention 5 (assertNever):** Lines 83-86
- **Convention 6 (Constants):** Lines 88-94
- **Insertion point for Conventions 7-12:** After line 94 (blank line, then new convention block)

#### pr_agent_review.md

- **Section header:** Line 51 (`### Framework & Language Conventions`)
- **Convention 1-6:** Lines 55-86
- **Insertion point for Conventions 7-12:** After line 86

#### opencode_system.md

- **Section header:** Line 51 (`### Framework & Language Conventions`)
- **Convention 1-6:** Lines 55-86
- **Insertion point for Conventions 7-12:** After line 86

#### architecture_review.md

- **Section header:** Line 14 (`### Framework & Language Conventions`)
- **Convention 1-6:** Lines 18-49
- **Insertion point for Conventions 7-12:** After line 49

### Structural Consistency

✅ **All 4 files are identical** in:

- Exact wording of all 6 conventions
- Pattern/Recognition/Why structure (3 lines per convention)
- Subsection ordering

**Insertion Block for Conventions 7-12:**

```markdown
7. **[Convention Name 7]**: [Description]
   - **Pattern**: [Pattern description]
   - **Recognition**: [Recognition criteria]
   - **Why not to flag**: [Rationale]

8. **[Convention Name 8]**: [Description]
   ...
```

---

## SECTION 2: Active Context Directives

### Current Status

✅ **Section exists and is IDENTICAL** across all 4 prompt files

### Exact Line Locations

#### semantic_review.md

- **Section header:** Line 96 (`### Active Context Directives`)
- **Before generating findings intro:** Line 98
- **CHECK Project Rules directive:** Lines 100-103 (3 bullet points)
- **CHECK PR Description directive:** Lines 105-108 (3 bullet points)
- **End of section:** Line 108

#### pr_agent_review.md

- **Section header:** Line 88 (`### Active Context Directives`)
- **Content:** Lines 90-100 (identical to semantic_review.md)
- **End of section:** Line 100

#### opencode_system.md

- **Section header:** Line 88 (`### Active Context Directives`)
- **Content:** Lines 90-100 (identical to semantic_review.md)
- **End of section:** Line 100

#### architecture_review.md

- **NOTE:** This file **does NOT have an "Active Context Directives" section**
- File only goes to line 58 with generic Guidelines section
- **Missing entirely** — should be added after Framework & Language Conventions (around line 50)

### Strengthened Version — Modification Strategy

Current text (lines 100-103 in semantic_review.md):

```markdown
1. **CHECK Project Rules** (if the "Project Rules" section is present above):
   - Read ALL project rules before evaluating code organization, constant placement, or architecture
   - Do NOT generate findings that contradict documented project decisions
   - If a project rule explicitly permits a pattern, do NOT flag that pattern
```

**Proposed Strengthening:**

```markdown
1. **CHECK Project Rules** (if the "Project Rules" section is present above):
   - Read ALL project rules before evaluating code organization, constant placement, or architecture
   - Do NOT generate findings that contradict documented project decisions
   - If a project rule explicitly permits a pattern, do NOT flag that pattern
   - Anchor severity assessment to project context — what is "anti-pattern" in isolation may be acceptable under project constraints
```

### Insertion Point for Binary Response Rules

After line 108 (after PR Description directive), add new subsection:

```markdown
3. **BINARY RESPONSE REQUIREMENTS**:
   - [Rule about binary response format]
   - [Rule about no disambiguation]
   - [Rule about deterministic output]
```

---

## SECTION 3: Data-Flow Verification & Security Sinks

### Current Status

✅ **Section exists and is IDENTICAL** across all 4 prompt files

### Exact Line Locations

#### semantic_review.md

- **Section header:** Line 22 (`### Security sinks require data-flow verification`)
- **Content:** Lines 24-27 (4 data-flow rules)
- **Scope:** Lines 24-26 (innerHTML, eval, dangerouslySetInnerHTML patterns)
- **Browser console.log rule:** Line 27

#### pr_agent_review.md

- **Section header:** Line 21 (`### Security sinks require data-flow verification`)
- **Content:** Lines 23-26 (identical to semantic_review.md)

#### opencode_system.md

- **Section header:** Line 21 (`### Security sinks require data-flow verification`)
- **Content:** Lines 23-26 (identical to semantic_review.md)

#### architecture_review.md

- **NOTE:** This file **does NOT have a data-flow verification section**
- Missing entirely — should be added after "Review Focus" section (around line 18)

### Strengthened Version — Modification Strategy

Current text (lines 24-26 in semantic_review.md):

```markdown
- Safe patterns (do NOT flag): `element.innerHTML = '<p>Loading...</p>'`, `container.innerHTML = errorMessage` where `errorMessage` is a caught Error object, template literals with internal constants
- Unsafe patterns (DO flag): `element.innerHTML = userInput`, `element.innerHTML = queryParams.get('content')`, any DOM sink receiving data from URL parameters, form fields, or external APIs
```

**Proposed Strengthening:**

```markdown
- Safe patterns (do NOT flag): `element.innerHTML = '<p>Loading...</p>'`, `container.innerHTML = errorMessage` where `errorMessage` is a caught Error object, template literals with internal constants, any value that cannot be influenced by user input (verified by scope/type)
- Unsafe patterns (DO flag): `element.innerHTML = userInput`, `element.innerHTML = queryParams.get('content')`, any DOM sink receiving data from URL parameters, form fields, external APIs, or any variable whose origin chain includes user input
- Taint propagation (CRITICAL): Track taint across assignment, destructuring, and property access — do NOT assume destructuring breaks taint flow (e.g., `[a, b] = userInput;` means both `a` and `b` are tainted)
```

### Insertion Point for Developer Tooling Rules

After line 27 (after Browser console.log rule), add new subsection:

```markdown
### Developer Tooling Integration

- Do NOT flag standard debugging patterns (console.log, console.error, debugger statements) as production issues unless they exist in non-debug code paths
- Do NOT flag test-only imports or mocks as missing in production code
- Do NOT flag local development-only environment variables as security vulnerabilities
```

---

## SECTION 4: Inline Prompt Defaults in Agent TypeScript Files

### ai_semantic_review.ts

**Fallback prompt location:** Lines 216-242 (inline string, 26 lines)

**Current fallback prompt (lines 216-242):**

- Shorter than file versions
- Includes Core Rules 1-4 (summarized)
- Includes Framework & Language Conventions (all 6, lines 236-237, one-liner format)
- Includes Active Context Directives (lines 239-240, one-liner format)
- **Missing:** Detailed data-flow verification section
- **Missing:** Developer tooling rules section

**Modification strategy:**

```typescript
// Line 216-217: Start fallback
let systemPrompt = `You are a senior code reviewer focused on semantic analysis.

## Core Rules (ALWAYS follow these)

1. ALWAYS verify data flow before flagging a security sink. Only flag innerHTML, eval, dangerouslySetInnerHTML, or similar when user-controlled data actually flows into them. Hardcoded strings, template literals with internal variables, and caught Error objects are NOT security vulnerabilities.
[... keep existing lines 220-223 ...]

### Framework & Language Conventions
Do NOT flag: (1) Express 4-param error middleware unused _next, (2) identical query keys as double-fetching (React Query dedup), (3) Promise.allSettled iteration as "wrong order", (4) TypeScript _prefix unused params, (5) assertNever/exhaustive switch as missing error handling, (6) constants adjacent to their only usage as needing externalization, (7-12) [NEW CONVENTIONS].

### Active Context Directives
Before generating findings: (1) CHECK any Project Rules provided — do not contradict documented decisions, (2) CHECK any PR Description provided — understand stated intent before flagging changes, (3) [NEW BINARY RESPONSE RULES].

Return a JSON object with findings. Do NOT include any text before or after the JSON.`;
```

**Lines affected:** 216-242 (mostly compression to one-liners, then line 244+ file-load fallback intact)

---

### pr_agent.ts

**Fallback prompt location:** Lines 204-217 (inline string, fallback before file load at 218-224)

**Current fallback prompt (lines 204-217):**

- Includes Core Rules 1-4 (summarized)
- Includes Framework & Language Conventions (one-liner, line 214)
- Includes Active Context Directives (one-liner, line 216-217)
- **Missing:** Detailed data-flow verification section
- **Missing:** Developer tooling rules section

**Modification strategy:** Same as ai_semantic_review.ts — expand conventions 7-12 in the one-liner or add brief explanations.

**Lines affected:** 204-217

---

### opencode.ts

**Fallback prompt location:** Lines 86-107 (inline string in `buildReviewPrompt` function)

**Current fallback prompt (lines 86-107):**

- Includes Core Rules 1-4 (lines 88-93)
- Includes Framework & Language Conventions (one-liner, line 102)
- Includes Active Context Directives (one-liner, lines 104-105)
- **Missing:** Detailed data-flow verification section
- **Missing:** Developer tooling rules section
- **Note:** Uses `Current date (UTC)` prepended at line 118

**Modification strategy:** Same pattern — expand conventions 7-12 and add binary response rules.

**Lines affected:** 86-107

---

## SECTION 5: Architecture Review Prompt (GAPS)

### architecture_review.md — MISSING SECTIONS

**File only has 58 lines total — missing TWO key sections:**

1. **Data-flow Verification Section** (lines 22-27 in other files)
   - Should be added after "Review Focus" (after line 5)
   - Content: Security sinks, safe/unsafe patterns, taint propagation

2. **Active Context Directives Section** (lines 96-108 in other files)
   - Should be added after Framework & Language Conventions (after line 49)
   - Content: Project Rules, PR Description checks

### Insertion Points for architecture_review.md

**After line 5 (Review Focus):**

```markdown
## False Positive Prevention

### Security sinks require data-flow verification

- `innerHTML`, `eval`, `dangerouslySetInnerHTML` are only vulnerabilities when **user-controlled data** flows into them
- Safe patterns (do NOT flag): `element.innerHTML = '<p>Loading...</p>'`, `container.innerHTML = errorMessage` where `errorMessage` is a caught Error object, template literals with internal constants, any value that cannot be influenced by user input (verified by scope/type)
- Unsafe patterns (DO flag): `element.innerHTML = userInput`, `element.innerHTML = queryParams.get('content')`, any DOM sink receiving data from URL parameters, form fields, external APIs, or any variable whose origin chain includes user input
- Taint propagation (CRITICAL): Track taint across assignment, destructuring, and property access — do NOT assume destructuring breaks taint flow (e.g., `[a, b] = userInput;` means both `a` and `b` are tainted)
- Browser `console.log` does NOT process printf-style format specifiers — do not flag `console.log('Value:', variable)` as format specifier injection

### Developer Tooling Integration

- Do NOT flag standard debugging patterns (console.log, console.error, debugger statements) as production issues unless they exist in non-debug code paths
- Do NOT flag test-only imports or mocks as missing in production code
- Do NOT flag local development-only environment variables as security vulnerabilities
```

**After line 49 (Framework & Language Conventions):**

```markdown
### Active Context Directives

Before generating findings:

1. **CHECK Project Rules** (if the "Project Rules" section is present above):
   - Read ALL project rules before evaluating code organization, constant placement, or architecture
   - Do NOT generate findings that contradict documented project decisions
   - If a project rule explicitly permits a pattern, do NOT flag that pattern
   - Anchor severity assessment to project context — what is "anti-pattern" in isolation may be acceptable under project constraints

2. **CHECK PR Description** (if the "PR Description" section is present above):
   - Read the PR title and description to understand the author's stated intent
   - Re-evaluate any finding that flags the exact change described in the PR purpose
   - If the PR description explains WHY a change was made, factor that into severity assessment
```

---

## Summary of Modification Points

### Files Requiring Conventions 7-12 Insertion

| File                   | Section Header | Current Line | Insertion After | Block Size                  |
| ---------------------- | -------------- | ------------ | --------------- | --------------------------- |
| semantic_review.md     | Line 59        | Line 94      | 1 blank line    | ~12-15 lines per convention |
| pr_agent_review.md     | Line 51        | Line 86      | 1 blank line    | ~12-15 lines per convention |
| opencode_system.md     | Line 51        | Line 86      | 1 blank line    | ~12-15 lines per convention |
| architecture_review.md | Line 14        | Line 49      | 1 blank line    | ~12-15 lines per convention |

### Files Requiring Active Context Directives Strengthening

| File                   | Section                   | Current Lines | Modification Type                        |
| ---------------------- | ------------------------- | ------------- | ---------------------------------------- |
| semantic_review.md     | Active Context Directives | Lines 96-108  | Strengthen directive 1 + add directive 3 |
| pr_agent_review.md     | Active Context Directives | Lines 88-100  | Strengthen directive 1 + add directive 3 |
| opencode_system.md     | Active Context Directives | Lines 88-100  | Strengthen directive 1 + add directive 3 |
| architecture_review.md | **MISSING**               | N/A           | Add entire section after line 49         |

### Files Requiring Data-Flow Verification Strengthening

| File                   | Section        | Current Lines | Modification Type                                            |
| ---------------------- | -------------- | ------------- | ------------------------------------------------------------ |
| semantic_review.md     | Security sinks | Lines 22-27   | Strengthen safe/unsafe patterns + add taint propagation rule |
| pr_agent_review.md     | Security sinks | Lines 21-26   | Strengthen safe/unsafe patterns + add taint propagation rule |
| opencode_system.md     | Security sinks | Lines 21-26   | Strengthen safe/unsafe patterns + add taint propagation rule |
| architecture_review.md | **MISSING**    | N/A           | Add entire section after line 5                              |

### Files Requiring Developer Tooling Rules Insertion

| File                   | Section        | Current Lines | Insertion After         | Block Size |
| ---------------------- | -------------- | ------------- | ----------------------- | ---------- |
| semantic_review.md     | Security sinks | Line 27       | 1 blank line            | ~6 lines   |
| pr_agent_review.md     | Security sinks | Line 26       | 1 blank line            | ~6 lines   |
| opencode_system.md     | Security sinks | Line 26       | 1 blank line            | ~6 lines   |
| architecture_review.md | **NEW**        | N/A           | After data-flow section | ~6 lines   |

### Agent TypeScript Files Requiring Inline Prompt Updates

| File                  | Fallback Prompt Location | Modification                                                                           |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| ai_semantic_review.ts | Lines 216-242            | Update one-liner conventions 6 → include 7-12; add binary response rules to directives |
| pr_agent.ts           | Lines 204-217            | Same as above                                                                          |
| opencode.ts           | Lines 86-107             | Same as above (in buildReviewPrompt function)                                          |

---

## Key Structural Notes

1. **Consistency Pattern:** All prompt files follow identical structure for Framework & Language Conventions:
   - Numbered convention (1-6)
   - Bold convention title
   - 3-line sub-structure: Pattern, Recognition, Why not to flag

2. **Inline Prompts Use Compression:** Agent .ts files use one-liner bullet format for conventions due to inline string length constraints. When updating, preserve compression strategy or expand cautiously.

3. **File Load Fallback Chain:** All agents follow this pattern:
   - Build inline fallback prompt
   - If file exists, load and replace (lines 244-250 for ai_semantic_review.ts, etc.)
   - Use file version if available, fallback if I/O fails

4. **architecture_review.md Asymmetry:** This file is significantly shorter and missing **2 entire sections** that exist in the other 3 prompt files. Requires targeted additions, not just conventions 7-12.

5. **Active Context Directives Strengthening:** Directive 1 should be enhanced to emphasize project context sensitivity. New Directive 3 (Binary Response Rules) should anchor response format guarantees.

---

**END OF ANALYSIS**
