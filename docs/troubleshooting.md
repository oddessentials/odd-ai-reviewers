# Troubleshooting Guide

Quick links to common issues by platform and configuration.

## Configuration Errors

### Multi-Key Ambiguity

**Error:** `Multiple API keys detected with MODEL set but no explicit provider`

**Cause:** You have both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` set, with a `MODEL` configured, but no explicit `provider` field in your config.

**Fix:** Add the `provider` field to your `.ai-review.yml`:

```yaml
version: 1
provider: openai # or 'anthropic'
```

### Azure OpenAI Missing Keys

**Error:** `Provider 'azure-openai' requires all three Azure keys`

**Cause:** Azure OpenAI requires three environment variables as a complete bundle.

**Fix:** Set all three Azure keys:

```
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=<deployment-name>
MODEL=<deployment-name>
```

### Legacy Key Detected

**Error:** `Legacy environment variable 'OPENAI_MODEL' detected`

**Cause:** You're using a deprecated key name from an older version.

**Fix:** Migrate to the canonical key:

| Old Key                      | New Key             |
| ---------------------------- | ------------------- |
| `OPENAI_MODEL`               | `MODEL`             |
| `OPENCODE_MODEL`             | `MODEL`             |
| `PR_AGENT_API_KEY`           | `OPENAI_API_KEY`    |
| `AI_SEMANTIC_REVIEW_API_KEY` | `ANTHROPIC_API_KEY` |

### Provider-Model Mismatch

**Error:** `Provider-model mismatch for agent 'opencode'`

**Cause:** The resolved provider doesn't match the model name. For example, `ANTHROPIC_API_KEY` is set (Anthropic wins) but `MODEL=gpt-4o` (an OpenAI model).

**Fix options:**

1. Use a matching model: `MODEL=claude-sonnet-4-20250514` or `claude-opus-4-6`
2. Remove the unwanted key to use the other provider
3. Set explicit `provider: openai` in config (and ensure `OPENAI_API_KEY` is set)

### No Model Configured

**Error:** `No model configured and no API keys found`

**Cause:** No API key is set and no MODEL is configured.

**Fix:** Set at least one API key. For single-key setups, the default model is auto-applied:

- `OPENAI_API_KEY` → auto-applies `gpt-4o`
- `ANTHROPIC_API_KEY` → auto-applies `claude-sonnet-4-20250514` (or `claude-opus-4-6`)
- `OLLAMA_BASE_URL` → auto-applies `codellama:7b`

### Azure Requires Explicit MODEL

**Error:** `Azure OpenAI requires an explicit MODEL`

**Cause:** Azure deployments have user-defined names, so we can't auto-apply a default.

**Fix:** Set the `MODEL` environment variable to your deployment name:

```
MODEL=my-gpt4-deployment
```

## Azure DevOps

### Permission Errors

| Error            | Description                           | Link                                                                                   |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| TF401027         | Permission required for PR commenting | [Resolution](platforms/azure-devops/setup.md#tf401027---permission-required)           |
| TF401444         | First login required for identity     | [Resolution](platforms/azure-devops/setup.md#tf401444---first-login-required)          |
| 403 Unauthorized | PullRequestThread API failure         | [Resolution](platforms/azure-devops/setup.md#403-unauthorized---pullrequestthread)     |
| 401 Unauthorized | General authentication failure        | [Resolution](platforms/azure-devops/setup.md#401-unauthorized---general-authorization) |

### Quick Fix Checklist

1. Verify both **"Contribute"** and **"Contribute to pull requests"** are set to **Allow**
2. Check identity type matches your pipeline configuration (see [Identity Decision Tree](platforms/azure-devops/setup.md#identify-your-pipeline-identity))
3. Verify no **Inherited Deny** blocks access at project level

### Full Troubleshooting Guide

See [Azure DevOps Setup - Troubleshooting](platforms/azure-devops/setup.md#troubleshooting) for detailed error resolution steps.

## GitHub

### Permission Errors

| Error                   | Description                    | Link                                                    |
| ----------------------- | ------------------------------ | ------------------------------------------------------- |
| 403 Forbidden           | GITHUB_TOKEN lacks permissions | [Resolution](platforms/github/setup.md#troubleshooting) |
| Resource not accessible | Workflow permissions issue     | [Resolution](platforms/github/setup.md#troubleshooting) |

### Quick Fix Checklist

1. Verify workflow has `pull-requests: write` permission
2. Check repository Settings → Actions → General → Workflow permissions
3. For fork PRs, verify `pull_request_target` trigger is used appropriately

### Full Troubleshooting Guide

See [GitHub Setup - Troubleshooting](platforms/github/setup.md#troubleshooting) for detailed error resolution steps.

## Search Terms

For quick navigation across this documentation, search for:

- Azure DevOps: `Contribute to pull requests`, `Build Service`, `Project Collection Build Service`, `TF401027`, `TF401444`
- GitHub: `GITHUB_TOKEN`, `pull-requests: write`, `workflow permissions`, `fork PR`

## Related Documentation

- [Azure DevOps Setup Guide](platforms/azure-devops/setup.md)
- [GitHub Setup Guide](platforms/github/setup.md)
- [Configuration Schema](configuration/config-schema.md)
- [Security Model](architecture/security.md)
