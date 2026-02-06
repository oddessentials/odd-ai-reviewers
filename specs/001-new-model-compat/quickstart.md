# Quickstart: New Model Compatibility (Opus 4.6 & GPT-5.3-Codex)

**Feature**: 001-new-model-compat
**Date**: 2026-02-06

## Using Claude Opus 4.6

Opus 4.6 works with odd-ai-reviewers today. No code changes or SDK upgrades are needed.

### Option 1: Environment variable

```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
export MODEL=claude-opus-4-6
ai-review review --repo . --base main --head feature-branch
```

### Option 2: Configuration file

```yaml
# .ai-review.yml
version: 1
provider: anthropic
models:
  default: claude-opus-4-6
passes:
  - name: cloud-ai
    agents: [opencode]
    enabled: true
```

### Option 3: Zero-config (auto-detection)

If you only have `ANTHROPIC_API_KEY` set, the system auto-applies `claude-sonnet-4-20250514` as the default. To use Opus 4.6 instead, set `MODEL=claude-opus-4-6` explicitly.

## GPT-5.3-Codex: Not Supported

GPT-5.3-Codex uses a specialized Codex API that is not compatible with the Chat Completions API used by odd-ai-reviewers. Setting `MODEL=gpt-5.3-codex` will produce a preflight error with guidance to use an alternative model.

**Recommended alternatives**:

- `gpt-4o` — OpenAI flagship chat model
- `gpt-4o-mini` — OpenAI cost-effective chat model

## Development Setup

### Prerequisites

- Node.js >=22.0.0
- pnpm (package manager)

### Build and test

```bash
cd router
pnpm install
pnpm run build
pnpm run test
```

### Files to modify

1. `router/src/config/providers.ts` — Add `isCodexFamilyModel()` function
2. `router/src/preflight.ts` — Update error messages (5 locations) and chat model validation
3. `router/src/cli/config-wizard.ts` — Update provider descriptions
4. `router/src/config/zero-config.ts` — Add comment about Opus 4.6 availability
5. `router/src/__tests__/preflight.test.ts` — Update and add test assertions
6. Documentation files — Add Opus 4.6 references

### Verification

```bash
# Run all tests
pnpm run test

# Run only preflight tests
pnpm run test -- --grep "preflight"

# Type check
pnpm run typecheck
```
