# Local LLM Setup Guide

## Overview

The `local_llm` agent uses Ollama for air-gapped, local AI code review. This guide covers configuration and expected behavior.

## Configuration

### Environment Variables

| Variable             | Required | Default                       | Description                 |
| -------------------- | -------- | ----------------------------- | --------------------------- |
| `OLLAMA_BASE_URL`    | No       | `http://ollama-sidecar:11434` | Ollama API endpoint         |
| `OLLAMA_MODEL`       | No       | `codellama:7b`                | Model to use for review     |
| `LOCAL_LLM_OPTIONAL` | No       | `false`                       | Enable graceful degradation |

### Example Configuration

```yaml
# .github/workflows/ai-review.yml
env:
  OLLAMA_BASE_URL: http://ollama:11434
  OLLAMA_MODEL: codellama:7b
  # LOCAL_LLM_OPTIONAL: true  # Uncomment for graceful degradation
```

### Authoritative OLLAMA_BASE_URL Values

| Environment   | URL                                 | Notes                                                    |
| ------------- | ----------------------------------- | -------------------------------------------------------- |
| **OSCR**      | `http://ollama:11434`               | Service name (also works: `http://ollama-sidecar:11434`) |
| **Local dev** | `http://localhost:11434`            | Default Ollama install                                   |
| **Docker**    | `http://host.docker.internal:11434` | From container to host                                   |

> **Recommendation:** Always set `OLLAMA_BASE_URL` explicitly in CI to avoid ambiguity, even if defaults exist.

> **⚠️ Air-Gapped Environments:** If Ollama is truly air-gapped (no internet access), models **must be provisioned ahead of time** via pre-pull, cache volume, or baked image. Otherwise, the agent will fail-closed when models are unavailable. See [Model Provisioning Guide](./MODEL-PROVISIONING.md).

## Behavior Modes

### Fail-Closed (Default) ✅ Recommended

When Ollama is unavailable, the review **fails** and blocks CI.

**Why use this:**

- Ensures code review is never silently skipped
- Catches configuration issues immediately
- Prevents unreviewed code from merging

**Error message:**

```
[local_llm] Ollama unavailable (fetch failed). Set LOCAL_LLM_OPTIONAL=true to allow graceful degradation.
```

### Graceful Degradation (Opt-In)

Set `LOCAL_LLM_OPTIONAL=true` to continue when Ollama is unavailable.

**Why use this:**

- During migration/testing phases
- Non-critical review environments
- Temporary Ollama outages acceptable

**Behavior:**

- Review continues with empty findings
- Warning logged to console
- CI passes

## Model Requirements

| Model                   | RAM Required | Typical Response Time |
| ----------------------- | ------------ | --------------------- |
| `codellama:7b`          | 4GB          | 30-90s                |
| `deepseek-coder-v2:16b` | 8GB          | 60-120s               |
| `qwen2.5-coder:7b`      | 4GB          | 30-80s                |

## Input Limits

The agent enforces these limits to prevent timeouts:

- **Max files:** 50 (alphabetically sorted)
- **Max diff lines:** 2000
- **Max tokens:** 8192
- **Timeout:** 120 seconds

## Running with OSCR

When running odd-ai-reviewers inside [OSCR](https://github.com/oddessentials/odd-self-hosted-ci-runtime) runner containers, Ollama setup is handled by the OSCR operator.

**For operators:** See the [OSCR Ollama Integration Guide](https://github.com/oddessentials/odd-self-hosted-ci-runtime/blob/main/docs/ollama-integration.md) for:

- Network configuration
- Air-gap model provisioning
- Troubleshooting

See [OSCR Integration Guide](./OSCR-INTEGRATION.md) for conceptual overview.

## Troubleshooting

### "Ollama unavailable" Error

**Problem:** Agent cannot connect to Ollama

**Solutions:**

1. Verify `OLLAMA_BASE_URL` is correct
2. Ensure Ollama service is running and reachable
3. Check network connectivity between router and Ollama
4. Set `LOCAL_LLM_OPTIONAL=true` if temporary outage is acceptable

### "Model not found" Error

**Problem:** Specified model not available in Ollama

**Solutions:**

1. Verify `OLLAMA_MODEL` spelling
2. Ensure model is pre-pulled in Ollama instance
3. Check Ollama logs for model loading errors

### Timeout Errors

**Problem:** Reviews exceed 120s timeout

**Solutions:**

1. Use faster model (e.g., `codellama:7b` vs `16b`)
2. Reduce diff size via path filters
3. Increase CPU allocation to Ollama service
4. Split large PRs into smaller changes

## Security Notes

- **Token Stripping:** `GITHUB_TOKEN` is automatically stripped from agent environment
- **Router Monopoly:** Agent cannot post directly to GitHub
- **Input Sanitization:** Secrets redacted from diff content before sending to Ollama
- **Deterministic:** All requests use `temperature=0`, `seed=42` for reproducibility
