# Research: Reduce AI Review False Positives

**Branch**: `409-reduce-review-false-positives` | **Date**: 2026-02-06

## R-001: Current Prompt Loading Architecture

**Decision**: Three distinct patterns exist; each agent requires a different modification approach.

| Agent                | Prompt Source            | File Path                                     | Fallback                                           | Action Needed                                  |
| -------------------- | ------------------------ | --------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| `ai_semantic_review` | File-based with fallback | `config/prompts/semantic_review.md` (missing) | 7-line hardcoded (`ai_semantic_review.ts:217-229`) | Create file, update fallback                   |
| `pr_agent`           | File-based with fallback | `config/prompts/pr_agent_review.md` (exists)  | 1-line hardcoded (`pr_agent.ts:205`)               | Update file, update fallback                   |
| `opencode`           | Hardcoded only           | N/A (`opencode_system.md` orphaned)           | `buildReviewPrompt()` (`opencode.ts:73-128`)       | Add file loading, update file, update fallback |

**Key discovery**: `opencode_system.md` and `architecture_review.md` in `config/prompts/` are orphaned files — never loaded by any agent code.

## R-002: Prompt Instruction Hierarchy

**Decision**: Numbered "Core Rules" at the top of each prompt, using ALWAYS/NEVER framing.

**Rationale**: LLM instruction compliance correlates with rule position and framing:

- Top-positioned numbered rules: highest compliance
- ALWAYS/NEVER framing: higher compliance than suggestive language ("consider", "try to")
- Rules after examples or long sections: lower compliance (instruction dilution)

**Alternatives considered**:

- Inline guidance (scatter rules through sections) — Rejected: dilution risk
- Appendix-style rules at end — Rejected: lowest compliance position
- XML-tagged priority sections — Rejected: unnecessary complexity for markdown prompts

## R-003: Fallback Prompt Sync Strategy

**Decision**: Manual sync with automated Vitest enforcement.

**Rationale**: Test catches drift in CI. Prompt changes are infrequent (first update since creation). Alternatives (runtime file reading, build-time codegen) add complexity disproportionate to change frequency.

**Alternatives considered**:

| Approach           | Pros                | Cons                               | Verdict  |
| ------------------ | ------------------- | ---------------------------------- | -------- |
| Runtime extraction | Always in sync      | Adds I/O, defeats fallback purpose | Rejected |
| Build-time codegen | Automated sync      | New build step for 3 strings       | Rejected |
| Manual + test      | Simple, CI-enforced | Requires manual update             | Selected |

## R-004: Token Budget Impact

**Decision**: No limit changes needed.

**Analysis**:

- Current prompts: ~100-250 tokens each
- Additions: ~500-700 tokens per prompt
- New total: ~700-900 tokens per prompt
- Overhead vs `max_tokens_per_pr` (700,000): < 0.13%
- Overhead vs typical PR diff (5,000-50,000 tokens): < 2%
