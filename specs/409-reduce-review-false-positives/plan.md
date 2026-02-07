# Implementation Plan: Reduce AI Review False Positives

**Branch**: `409-reduce-review-false-positives` | **Date**: 2026-02-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/409-reduce-review-false-positives/spec.md`

## Summary

AI review agents (ai_semantic_review, pr_agent, opencode) produce false positive findings because their system prompts lack guidance on data-flow verification, CSS cascade behavior, type-system awareness, and code-context accuracy. This plan creates the missing `semantic_review.md` prompt file, adds false-positive prevention guidance to all three agent prompts and their hardcoded fallbacks, and establishes a convention to keep fallbacks in sync with file-based prompts.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Anthropic SDK 0.71.2, OpenAI SDK 6.17.0, Zod 4.3.6, Commander 14.x
**Storage**: N/A (prompt files are static markdown on disk at `config/prompts/`)
**Testing**: Vitest 4.x
**Target Platform**: Node.js >=22.0.0, Linux CI (GitHub Actions, Azure Pipelines)
**Project Type**: Single (monorepo with `router/src/` as main source)
**Performance Goals**: N/A (prompt content changes only; no runtime performance impact)
**Constraints**: Prompt token budget — prompts feed into LLM context windows with existing `max_tokens_per_pr` limits. Prompt additions must stay within reasonable token overhead (< 800 tokens added per prompt).
**Scale/Scope**: 4 prompt files (3 file-based + 1 new), 3 agent source files (hardcoded fallbacks)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                                                                                                               |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | No changes to posting logic. Agents still return structured findings only.                                                          |
| II. Structured Findings Contract | PASS   | No changes to finding schema. Prompt changes guide what agents report, not how findings are structured.                             |
| III. Provider-Neutral Core       | PASS   | Same prompt content is used across OpenAI, Anthropic, and Azure providers. No provider-specific prompt logic.                       |
| IV. Security-First Design        | PASS   | Prompt changes improve security analysis accuracy (reduce false positives while preserving true positives). No new secret handling. |
| V. Deterministic Outputs         | PASS   | Improved prompts should produce more consistent outputs by reducing model hallucination of non-existent code patterns.              |
| VI. Bounded Resources            | PASS   | Prompt additions stay within token budget (< 800 tokens added). Existing `max_tokens_per_pr` limits enforced unchanged.             |
| VII. Environment Discipline      | PASS   | No new toolchain or runtime dependencies. Only markdown files and string literal changes.                                           |
| VIII. Explicit Non-Goals         | PASS   | Feature stays within AI review scope — improving review quality, not adding new capabilities.                                       |

**Gate result**: All principles pass. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/409-reduce-review-false-positives/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
config/prompts/
├── semantic_review.md       # NEW — FR-001: created for ai_semantic_review agent
├── pr_agent_review.md       # MODIFIED — FR-002..FR-006, FR-010: add false-positive prevention
└── opencode_system.md       # MODIFIED — FR-002..FR-006, FR-010: add false-positive prevention

router/src/agents/
├── ai_semantic_review.ts    # MODIFIED — FR-007, FR-012: update hardcoded fallback
├── pr_agent.ts              # MODIFIED — FR-007, FR-012: update hardcoded fallback
└── opencode.ts              # MODIFIED — FR-007, FR-010, FR-012: add prompt file loading + update hardcoded fallback

tests/
└── prompts/
    └── fallback-sync.test.ts  # NEW — FR-012: verify fallback prompt contains top-level obligation rules
```

**Structure Decision**: All changes are within existing directories. One new test file validates fallback prompt sync (FR-012). No new directories needed beyond `tests/prompts/`.

## Complexity Tracking

No constitution violations. Table intentionally empty.

---

## Phase 0: Research

### Research Findings

#### R-001: Current prompt loading architecture

**Decision**: Three distinct prompt loading patterns exist and must each be addressed differently.

**Findings**:

| Agent                | Prompt Source            | File Path                                                      | Fallback                                                  |
| -------------------- | ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| `ai_semantic_review` | File-based with fallback | `config/prompts/semantic_review.md`                            | 7-line hardcoded string (`ai_semantic_review.ts:217-229`) |
| `pr_agent`           | File-based with fallback | `config/prompts/pr_agent_review.md`                            | 1-line hardcoded string (`pr_agent.ts:205`)               |
| `opencode`           | Hardcoded only           | N/A (orphaned `opencode_system.md` exists but is never loaded) | `buildReviewPrompt()` function (`opencode.ts:73-128`)     |

**Key discovery**: The `opencode` agent has **no prompt file loading** at all. The `opencode_system.md` file in `config/prompts/` is orphaned — never referenced by any code. The `architecture_review.md` file is also orphaned.

**Implication**: The `opencode` agent needs prompt file loading added (similar to `ai_semantic_review` and `pr_agent` patterns). The existing `opencode_system.md` file becomes the file-based prompt after being updated with false-positive prevention content.

#### R-002: Prompt instruction hierarchy best practices

**Decision**: Use numbered "Core Rules" section at prompt top, followed by domain-specific guidance sections.

**Rationale**: LLM instruction following degrades when critical rules are buried in long prompts. Research on system prompt design consistently shows that:

- Numbered rules at the top of the prompt have highest compliance
- Rules positioned after examples or detailed sections have lower compliance
- Explicit "ALWAYS" / "NEVER" framing increases rule adherence vs. suggestive language

**Structure adopted**:

```
## Core Rules (ALWAYS follow these)
1. ALWAYS verify data flow...
2. ALWAYS quote the exact code...
3. NEVER flag a pattern without...

## Review Focus Areas
[Domain-specific guidance sections]

## False Positive Prevention
[Detailed examples and anti-patterns]

## Output Format
[JSON schema and line numbering — preserved from existing prompts]
```

#### R-003: Fallback prompt sync strategy (FR-012)

**Decision**: Use a mechanical extraction convention with an automated test.

**Alternatives considered**:

1. **Runtime extraction** (read file, truncate) — Rejected: adds I/O in fallback path, defeats purpose of having fallback
2. **Build-time codegen** (script generates fallback from file) — Rejected: adds build step complexity for 3 string literals
3. **Manual sync with test enforcement** — **Selected**: Fallback strings contain the same Core Rules section as file-based prompts. A Vitest test reads both the file-based prompts and the hardcoded strings, extracts the Core Rules section from each, and asserts they match.

**Rationale**: The test catches drift automatically in CI. Manual sync is acceptable because prompt changes are infrequent (this is the first update since the prompts were created). Build-time codegen would be over-engineering for the current change frequency.

#### R-004: Token budget impact

**Decision**: Additions fit within existing limits.

**Analysis**: Current prompt sizes (estimated):

- `semantic_review.md`: 0 tokens (doesn't exist, fallback is ~100 tokens)
- `pr_agent_review.md`: ~200 tokens
- `opencode` hardcoded: ~250 tokens

Planned additions per prompt: ~500-700 tokens for Core Rules + False Positive Prevention sections.

New prompt sizes: ~700-900 tokens per prompt. With typical PR diff content (~5,000-50,000 tokens), prompt overhead remains under 2% of the `max_tokens_per_pr` budget (700,000 tokens). No limit changes needed.

---

## Phase 1: Design

### Prompt Architecture

All three prompts share a common structure. The false-positive prevention content is consistent across agents but framed differently for each agent's focus area.

#### Common Prompt Structure (all agents)

```markdown
# [Agent Name] Review Prompt

## Core Rules (ALWAYS follow these)

1. ALWAYS verify data flow before flagging a security sink. Only flag innerHTML,
   eval, dangerouslySetInnerHTML, or similar when user-controlled data actually
   flows into them. Hardcoded strings, template literals with internal variables,
   and caught Error objects are NOT security vulnerabilities.
2. ALWAYS quote the exact code construct you are flagging (the specific selector,
   function call, variable assignment, etc.). If you cannot point to a specific
   line in the diff, do not report the finding.
3. NEVER flag a pattern based on generic rules without verifying it applies to
   the specific context. Read the surrounding code, types, and comments before
   concluding something is an issue.
4. When uncertain about data flow or context (e.g., a function's return value is
   not visible in the diff), report at "info" severity with an explicit
   uncertainty qualifier: "Potential issue — verify that [specific concern]."

## [Agent-specific review focus sections]

## False Positive Prevention

[Detailed guidance with examples for each false-positive category]

## Output Format

[Preserved from existing prompts — JSON schema + line numbering rules]
```

#### Hardcoded Fallback Structure (all agents)

The fallback prompt is a condensed version containing:

1. The 4 Core Rules (identical text to file-based prompt)
2. A minimal review focus list
3. The output format / JSON schema

The False Positive Prevention examples section is omitted from fallbacks to keep them concise. The Core Rules alone address the most critical false positive patterns.

### File-by-File Design

#### 1. `config/prompts/semantic_review.md` (NEW)

- Full prompt with Core Rules, review focus (logic errors, security, performance, API misuse, error handling), False Positive Prevention section, and output format
- Output format matches existing JSON schema in `ai_semantic_review.ts:252-264`
- Line numbering rules preserved from existing hardcoded fallback

#### 2. `config/prompts/pr_agent_review.md` (MODIFIED)

- Add Core Rules section at top (before existing Tasks section)
- Add False Positive Prevention section between review guidance and output format
- Preserve existing Format/Line Numbering sections unchanged (FR-008)

#### 3. `config/prompts/opencode_system.md` (MODIFIED)

- Rewrite orphaned file as the opencode agent's file-based prompt
- Core Rules + review focus (OWASP, CWE, logic, performance, quality) + False Positive Prevention + output format
- Output format matches existing JSON schema in `opencode.ts:109-124`

#### 4. `router/src/agents/opencode.ts` (MODIFIED)

- Add prompt file loading in `buildReviewPrompt()` (same pattern as `ai_semantic_review.ts:231-237`)
- Load from `config/prompts/opencode_system.md` with fallback to condensed hardcoded prompt
- Update hardcoded fallback in `buildReviewPrompt()` to include Core Rules

#### 5. `router/src/agents/ai_semantic_review.ts` (MODIFIED)

- Update hardcoded fallback (lines 217-229) to include Core Rules
- No other changes needed — file loading already works, just needs the file to exist

#### 6. `router/src/agents/pr_agent.ts` (MODIFIED)

- Update hardcoded fallback (line 205) to include Core Rules
- No other changes needed — file loading already works

#### 7. `tests/prompts/fallback-sync.test.ts` (NEW)

- Reads each file-based prompt and extracts the "Core Rules" section
- Reads each agent source file and extracts the hardcoded fallback string
- Asserts that Core Rules content appears in both (substring match or parsed comparison)
- Covers: semantic_review ↔ ai_semantic_review.ts, pr_agent_review ↔ pr_agent.ts, opencode_system ↔ opencode.ts

### False Positive Prevention Section Content

The following guidance categories are included in each prompt's False Positive Prevention section:

1. **Security sinks require data-flow verification**: innerHTML, eval, dangerouslySetInnerHTML are only vulnerabilities when user-controlled data reaches them. Hardcoded strings, string literals, caught Error objects, and internal variables are safe. Browser console.log does not process printf-style format specifiers.

2. **CSS cascade behavior is well-defined**: Changing `display` to a different value completely overrides the previous display mode's properties. `overflow-y: auto` is safe when the container has no nested scroll containers. A CSS selector scoped to a specific class is not "overly broad."

3. **Type constraints enforce completeness**: When a switch/if-else operates over a typed enum or discriminated union, the type system guarantees which cases exist. Intentional no-ops for specific cases are deliberate design choices, not missing fallbacks.

4. **Code comments document deliberate trade-offs**: If a comment explains why a pattern was chosen (test isolation, performance, compatibility), do not flag the pattern as an issue. If the comment acknowledges a limitation, do not repeat the limitation as a finding.

5. **Configuration and tooling choices are intentional**: .prettierignore, .eslintrc, tsconfig.json, and similar files reflect deliberate project decisions. Do not flag standard configuration patterns unless they introduce concrete problems.

### Contracts

No API contracts needed — this feature modifies prompt content and agent source files only. The existing Finding schema (`router/src/agents/types.ts`) is unchanged.

---

## Post-Design Constitution Re-Check

| Principle                        | Status | Notes                                                                                                        |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | PASS   | Unchanged.                                                                                                   |
| II. Structured Findings Contract | PASS   | Finding schema unchanged. Prompt changes only affect what content agents produce within the existing schema. |
| III. Provider-Neutral Core       | PASS   | Same prompts used across all providers.                                                                      |
| IV. Security-First Design        | PASS   | Improved security analysis accuracy. No new secret handling.                                                 |
| V. Deterministic Outputs         | PASS   | More consistent outputs expected from improved prompts.                                                      |
| VI. Bounded Resources            | PASS   | Token overhead < 800 tokens per prompt, well within existing limits.                                         |
| VII. Environment Discipline      | PASS   | No new dependencies. Only markdown and string literal changes.                                               |
| VIII. Explicit Non-Goals         | PASS   | Within scope.                                                                                                |

**Gate result**: All principles pass post-design.
