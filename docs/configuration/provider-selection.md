# Provider Selection Guide

This guide explains how LLM providers are selected and how to configure them for your setup.

## Auto-Detection (Single-Key Setups)

For the simplest setup, just set one API key. The model is auto-applied:

| Provider     | API Key               | Default Model            |
| ------------ | --------------------- | ------------------------ |
| Anthropic    | `ANTHROPIC_API_KEY`   | claude-sonnet-4-20250514 |
| OpenAI       | `OPENAI_API_KEY`      | gpt-4o                   |
| Ollama       | `OLLAMA_BASE_URL`     | codellama:7b             |
| Azure OpenAI | (requires all 3 keys) | None (must be explicit)  |

No configuration file is required for single-key setups.

## Explicit Provider Selection

When you have multiple API keys configured, you must specify which provider to use:

```yaml
version: 1
provider: anthropic # or 'openai', 'azure-openai', 'ollama'
```

### Available Providers

- `anthropic` - Claude models via Anthropic API
- `openai` - GPT models via OpenAI API
- `azure-openai` - GPT models via Azure OpenAI Service
- `ollama` - Local models via Ollama

## Azure OpenAI Configuration

Azure OpenAI is different from other providers:

1. **No auto-apply** - Deployment names are user-specific, so we can't guess a default
2. **Three required keys** - All three must be set as a bundle
3. **MODEL is required** - Set to your deployment name

### Required Environment Variables

```bash
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_ENDPOINT=https://<resource-name>.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>
MODEL=<your-deployment-name>
```

### Example Configuration

```yaml
version: 1
provider: azure-openai
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: ai
    agents: [ai_semantic_review, pr_agent]

limits:
  max_usd_per_pr: 1.00
```

### Agent Compatibility

Not all agents support Azure OpenAI:

| Agent              | Azure Support |
| ------------------ | ------------- |
| opencode           | No            |
| pr_agent           | Yes           |
| ai_semantic_review | Yes           |

## Provider Precedence

When multiple API keys are present and no explicit provider is set:

1. **Anthropic** wins if `ANTHROPIC_API_KEY` is set (for Anthropic-capable agents)
2. **Azure OpenAI** wins if all three Azure keys are set (for Azure-capable agents)
3. **OpenAI** is used as fallback

This automatic precedence can cause unexpected behavior. We recommend:

- **Single-key setup** - Just set one provider's key
- **Explicit provider** - If multiple keys exist, set `provider:` in config

## Migration Guide

### From Legacy Keys

If you're upgrading from an older version:

| Old Key                      | New Key             |
| ---------------------------- | ------------------- |
| `OPENAI_MODEL`               | `MODEL`             |
| `OPENCODE_MODEL`             | `MODEL`             |
| `PR_AGENT_API_KEY`           | `OPENAI_API_KEY`    |
| `AI_SEMANTIC_REVIEW_API_KEY` | `ANTHROPIC_API_KEY` |

### From Multi-Key to Explicit Provider

If you have both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` set:

**Before (ambiguous):**

```yaml
version: 1
models:
  default: gpt-4o
```

**After (explicit):**

```yaml
version: 1
provider: openai
models:
  default: gpt-4o
```

## Troubleshooting

### "Multiple API keys detected"

Add `provider: <provider>` to your config.

### "Azure OpenAI requires explicit MODEL"

Set the `MODEL` environment variable to your deployment name.

### "Provider-model mismatch"

Ensure your MODEL matches your provider:

- `anthropic` → claude-\* models
- `openai` → gpt-_, o1-_ models
- `azure-openai` → your deployment name
- `ollama` → model:tag format (e.g., codellama:7b)

## Related Documentation

- [Configuration Schema](./config-schema.md)
- [Troubleshooting Guide](../troubleshooting.md)
- [Quick Start](../getting-started/quick-start.md)
