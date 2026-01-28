# Local LLM Setup Guide

## Overview

The `local_llm` agent uses Ollama for air-gapped, local AI code review. This guide covers configuration and expected behavior.

## Configuration

### Environment Variables

| Variable                | Required | Default                       | Description                         |
| ----------------------- | -------- | ----------------------------- | ----------------------------------- |
| `OLLAMA_BASE_URL`       | No       | `http://ollama-sidecar:11434` | Ollama API endpoint                 |
| `OLLAMA_MODEL`          | No       | `codellama:7b`                | Model to use for review             |
| `LOCAL_LLM_OPTIONAL`    | No       | `false`                       | Enable graceful degradation         |
| `LOCAL_LLM_NUM_CTX`     | No       | `8192`                        | Context window size (tokens)        |
| `LOCAL_LLM_NUM_PREDICT` | No       | `8192`                        | Max output tokens (circuit breaker) |
| `LOCAL_LLM_TIMEOUT`     | No       | `600000`                      | Request timeout (ms) - 10 min       |

### Example Configuration

```yaml
# .github/workflows/ai-review.yml
env:
  OLLAMA_BASE_URL: http://ollama:11434
  OLLAMA_MODEL: codellama:7b
  LOCAL_LLM_NUM_CTX: 8192 # Context window (default; increase for larger diffs if VRAM allows)
  LOCAL_LLM_TIMEOUT: 180000 # 3 minutes (for slower models)
  # LOCAL_LLM_OPTIONAL: true     # Uncomment for graceful degradation
```

### Authoritative OLLAMA_BASE_URL Values

| Environment   | URL                                 | Notes                                                    |
| ------------- | ----------------------------------- | -------------------------------------------------------- |
| **OSCR**      | `http://ollama:11434`               | Service name (also works: `http://ollama-sidecar:11434`) |
| **Local dev** | `http://localhost:11434`            | Default Ollama install                                   |
| **Docker**    | `http://host.docker.internal:11434` | From container to host                                   |

> **Recommendation:** Always set `OLLAMA_BASE_URL` explicitly in CI to avoid ambiguity, even if defaults exist.

> **⚠️ Air-Gapped Environments:** If Ollama is truly air-gapped (no internet access), models **must be provisioned ahead of time** via pre-pull, cache volume, or baked image. Otherwise, the agent will fail-closed when models are unavailable. See [Model Provisioning Guide](./model-provisioning.md).

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
- **Max tokens:** 8192 (pre-flight check)
- **Context window:** 8192 (configurable via `LOCAL_LLM_NUM_CTX`)
- **Timeout:** 300 seconds (configurable via `LOCAL_LLM_TIMEOUT`)

## Running with OSCR

When running odd-ai-reviewers inside [OSCR](https://github.com/oddessentials/odd-self-hosted-ci-runtime) runner containers, Ollama setup is handled by the OSCR operator.

**For operators:** See the [OSCR Ollama Integration Guide](https://github.com/oddessentials/odd-self-hosted-ci-runtime/blob/main/docs/ollama-integration.md) for:

- Network configuration
- Air-gap model provisioning
- Troubleshooting

See [OSCR Integration Guide](./integration.md) for conceptual overview.

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

**Problem:** Reviews exceed timeout (default 300s)

**Solutions:**

1. Increase timeout: `LOCAL_LLM_TIMEOUT=180000` (3 minutes)
2. Use faster model (e.g., `codellama:7b` vs `16b`)
3. Reduce diff size via path filters
4. Increase CPU allocation to Ollama service
5. Split large PRs into smaller changes

### Context Truncation Errors

**Problem:** Ollama logs show `truncating input prompt` and returns HTTP 500

**Cause:** Prompt exceeds `num_ctx` (context window). Router's token estimate may differ from Ollama's tokenizer.

**Solutions:**

1. Increase context window: `LOCAL_LLM_NUM_CTX=16384` (if VRAM allows; default is 8192)
2. Reduce diff size via path filters in config
3. Check Ollama logs for exact token counts: `docker logs <ollama-container>`

## Security Notes

- **Token Stripping:** `GITHUB_TOKEN` is automatically stripped from agent environment
- **Router Monopoly:** Agent cannot post directly to GitHub
- **Input Sanitization:** Secrets redacted from diff content before sending to Ollama
- **Deterministic:** All requests use `temperature=0`, `seed=42` for reproducibility

---

## Related Documentation

- [OSCR Integration](./integration.md) — Self-hosted CI overview
- [Model Provisioning](./model-provisioning.md) — Air-gap deployment
- [Configuration Schema](../../configuration/config-schema.md) — All YAML options
- [Security Model](../../architecture/security.md) — Trust boundaries
