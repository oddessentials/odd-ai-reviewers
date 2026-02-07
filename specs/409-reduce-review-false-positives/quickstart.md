# Quickstart: Reduce AI Review False Positives

**Branch**: `409-reduce-review-false-positives`

## What This Feature Changes

This feature improves the system prompts used by three AI review agents (`ai_semantic_review`, `pr_agent`, `opencode`) to reduce false positive findings on consumer pull requests. Changes are limited to:

1. **Prompt files** in `config/prompts/` (markdown)
2. **Hardcoded fallback prompts** in agent source files (TypeScript string literals)
3. **One new test** to prevent fallback drift

## Files to Modify

| File                                      | Change Type | Purpose                                             |
| ----------------------------------------- | ----------- | --------------------------------------------------- |
| `config/prompts/semantic_review.md`       | Create      | New prompt file for ai_semantic_review agent        |
| `config/prompts/pr_agent_review.md`       | Edit        | Add Core Rules + False Positive Prevention sections |
| `config/prompts/opencode_system.md`       | Edit        | Rewrite as opencode agent's file-based prompt       |
| `router/src/agents/opencode.ts`           | Edit        | Add prompt file loading + update fallback           |
| `router/src/agents/ai_semantic_review.ts` | Edit        | Update hardcoded fallback                           |
| `router/src/agents/pr_agent.ts`           | Edit        | Update hardcoded fallback                           |
| `tests/prompts/fallback-sync.test.ts`     | Create      | Test that fallbacks match file-based Core Rules     |

## How to Verify

```bash
# Run the fallback sync test
pnpm vitest run tests/prompts/fallback-sync.test.ts

# Run full test suite to verify no regressions
pnpm test
```

## Key Constraint

The 4 Core Rules in each file-based prompt must exactly match the Core Rules in the corresponding hardcoded fallback. The sync test enforces this. If you update a Core Rule in a prompt file, update the matching fallback string in the agent source file.
