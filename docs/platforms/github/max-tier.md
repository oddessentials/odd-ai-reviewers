# GitHub Max Setup

Full-featured AI code review with all available agents and capabilities. Requires API keys for cloud AI providers.

## Features Included

| Feature                     | Description                                               | Cost                |
| --------------------------- | --------------------------------------------------------- | ------------------- |
| **Semgrep Static Analysis** | Security vulnerability detection (28+ CWE/OWASP patterns) | Free                |
| **OpenCode AI Review**      | Deep semantic code analysis with GPT-4 or Claude          | ~$0.10-0.50/PR      |
| **Local LLM (Ollama)**      | Air-gapped AI review with local models                    | Free (self-hosted)  |
| **GitHub Actions**          | CI/CD execution environment                               | Free tier available |
| **Check Runs**              | Annotations on PR diffs                                   | Free                |
| **PR Comments**             | Inline code review comments                               | Free                |
| **Summary Reports**         | AI-generated overview of findings                         | Free                |
| **Cost Controls**           | Per-PR and monthly budget limits                          | Built-in            |

## What You Get

- Everything from the free tier, plus:
- **AI-powered semantic analysis** - Understands code context and logic
- **Natural language explanations** - Human-readable issue descriptions
- **Intelligent suggestions** - Context-aware fix recommendations
- **Multiple review passes** - Static analysis first, then AI review
- **Provider choice** - OpenAI, Anthropic, Azure OpenAI, or local Ollama
- **Cost protection** - Budget limits prevent runaway spending

## Setup Instructions

### Step 1: Add Repository Secrets

Navigate to your repository's **Settings > Secrets and variables > Actions**.

Add one or more of these secrets:

| Secret              | Required For                | Get It From                                                          |
| ------------------- | --------------------------- | -------------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenCode with GPT models    | [platform.openai.com](https://platform.openai.com/api-keys)          |
| `ANTHROPIC_API_KEY` | OpenCode with Claude models | [console.anthropic.com](https://console.anthropic.com/settings/keys) |

**Provider Priority**: If both keys are set, Anthropic is used by default (higher quality for code review). Override with the `MODEL` secret if needed.

#### Optional: Azure OpenAI

For enterprise Azure OpenAI deployments, add all three:

| Secret                    | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `AZURE_OPENAI_API_KEY`    | Your Azure OpenAI resource key                 |
| `AZURE_OPENAI_ENDPOINT`   | e.g., `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_DEPLOYMENT` | Your deployment name                           |

#### Optional: Local LLM

| Secret            | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `OLLAMA_BASE_URL` | Your Ollama server URL (default: `http://ollama-sidecar:11434`) |

### Step 2: Add the Workflow File

Create `.github/workflows/ai-review.yml` in your repository:

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

jobs:
  ai-review:
    # Only run on PRs from the same repo (not forks) for security
    if: |
      github.event_name == 'push' ||
      github.event.pull_request.head.repo.full_name == github.repository

    uses: oddessentials/odd-ai-reviewers/.github/workflows/ai-review.yml@main
    with:
      target_repo: ${{ github.repository }}
      target_ref: ${{ github.sha }}
      pr_number: ${{ github.event.pull_request.number }}
    secrets: inherit # Pass all repository secrets to the workflow
```

### Step 3: Add the Configuration File

Create `.ai-review.yml` at your repository root:

```yaml
version: 1
trusted_only: true

passes:
  # Pass 1: Static analysis (free, always runs)
  - name: static
    agents: [semgrep]
    enabled: true
    required: true # Fail fast if semgrep fails

  # Pass 2: Cloud AI review (requires API key)
  - name: cloud-ai
    agents: [opencode]
    enabled: true
    required: false # Skip gracefully if no API key

  # Pass 3: Local LLM (optional, requires Ollama)
  - name: local-ai
    agents: [local_llm]
    enabled: true
    required: false # Skip if Ollama unavailable

# Model configuration
models:
  default: gpt-4o-mini # Cost-effective default
  # Alternatives:
  # default: gpt-4o                      # More capable, higher cost
  # default: claude-sonnet-4-20250514    # Anthropic (requires ANTHROPIC_API_KEY)
  # default: claude-opus-4-6             # Anthropic's flagship model
  # default: claude-3-5-haiku-20241022   # Fast, cheaper Anthropic option

limits:
  max_files: 50 # Skip very large PRs
  max_diff_lines: 2000 # Truncate large diffs
  max_tokens_per_pr: 12000 # Bound LLM input
  max_usd_per_pr: 1.00 # Per-PR cost cap
  monthly_budget_usd: 100 # Monthly spending limit

reporting:
  github:
    mode: checks_and_comments
    max_inline_comments: 20
    summary: true

gating:
  enabled: false # Set true to block merge on errors
  fail_on_severity: error
```

### Step 4: Test It

1. Create a new branch
2. Add some code changes
3. Open a Pull Request
4. Watch the "AI Review" check run through multiple passes

## Agent Capabilities

### Semgrep (Static Analysis)

- Runs first, catches obvious issues fast
- Pattern-based security detection
- Zero LLM cost
- Deterministic (same input = same output)

### OpenCode (AI Semantic Review)

- Deep understanding of code logic
- Context-aware vulnerability detection
- Natural language explanations
- Intelligent fix suggestions
- Supports GPT-4, GPT-4o, Claude Sonnet, Claude Haiku

### Local LLM (Ollama)

- Air-gapped operation (no data leaves your network)
- Zero API cost (compute only)
- Uses CodeLlama, Mistral, or other local models
- Good for sensitive codebases

## Provider Configuration

### OpenAI (Default)

```yaml
models:
  default: gpt-4o-mini # Best value
  # default: gpt-4o     # More capable
  # default: o1-mini    # Reasoning model
```

Required secret: `OPENAI_API_KEY`

### Anthropic

```yaml
models:
  default: claude-sonnet-4-20250514 # Best for code
  # default: claude-opus-4-6            # Flagship model
  # default: claude-3-5-haiku-20241022  # Faster, cheaper
```

Required secret: `ANTHROPIC_API_KEY`

### Azure OpenAI

```yaml
models:
  default: gpt-4o # Must match your deployment
```

Required secrets:

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`

### Mixed Providers

You can set multiple API keys. The router selects providers with this priority:

1. **Anthropic** (if `ANTHROPIC_API_KEY` set and agent supports it)
2. **Azure OpenAI** (if all three Azure vars set and agent supports it)
3. **OpenAI** (if `OPENAI_API_KEY` set)

## Cost Management

### Estimated Costs

| Model            | Approx. Cost/PR | Notes               |
| ---------------- | --------------- | ------------------- |
| gpt-4o-mini      | $0.05-0.15      | Best value          |
| gpt-4o           | $0.15-0.50      | More thorough       |
| claude-3-5-haiku | $0.05-0.15      | Fast Anthropic      |
| claude-sonnet-4  | $0.10-0.40      | Best quality        |
| claude-opus-4-6  | $0.15-0.60      | Flagship model      |
| local_llm        | $0.00           | Self-hosted compute |

### Budget Controls

```yaml
limits:
  max_usd_per_pr: 1.00 # Hard cap per PR
  monthly_budget_usd: 100 # Monthly limit (tracking)
  max_tokens_per_pr: 12000 # Bound LLM input size
```

If a PR exceeds budget:

- Static analysis (Semgrep) still runs
- AI agents are skipped with a clear message
- No surprise charges

## Example Output

With all agents enabled, you'll see:

1. **Semgrep findings** - Security patterns detected
2. **OpenCode analysis** - AI-powered insights:

```
## AI Review Summary

### Static Analysis (Semgrep)
- 2 security issues found

### AI Analysis (OpenCode)

**Overall Assessment**: This PR introduces a new API endpoint with potential security concerns.

**Findings (5)**

| Severity | File | Line | Message |
|----------|------|------|---------|
| error | src/api.ts | 42 | SQL injection: User input is concatenated directly into query |
| error | src/api.ts | 58 | Missing authentication check on sensitive endpoint |
| warning | src/utils.ts | 15 | Potential race condition in cache invalidation |
| info | src/api.ts | 30 | Consider using parameterized queries for better security |
| info | src/types.ts | 12 | Type could be narrowed for better type safety |

**Suggestions**
1. Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
2. Add authentication middleware to the `/admin` route
3. Consider using a mutex for cache operations

---
*Reviewed by [odd-ai-reviewers](https://github.com/oddessentials/odd-ai-reviewers)*
```

## Advanced Configuration

### Path Filtering

Only review specific directories:

```yaml
path_filters:
  include:
    - 'src/**'
    - 'lib/**'
  exclude:
    - '**/*.test.ts'
    - '**/node_modules/**'
    - '**/dist/**'
    - '**/*.generated.ts'
```

### Gating (Block Merge)

Prevent merging PRs with security issues:

```yaml
gating:
  enabled: true
  fail_on_severity: error # Only block on errors
  # fail_on_severity: warning  # Stricter
```

### Custom Triggers

```yaml
triggers:
  on: [pull_request, push]
  branches: [main, develop, release/*]
```

## Troubleshooting

### "No API key configured"

Ensure you've added secrets to your repository:

1. Go to Settings > Secrets and variables > Actions
2. Add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
3. Verify `secrets: inherit` is in your workflow

### "Model/provider mismatch"

The model must match the available provider:

- `claude-*` models require `ANTHROPIC_API_KEY`
- `gpt-*` or `o1-*` models require `OPENAI_API_KEY` or Azure

### "Budget exceeded"

Your PR is too large for the configured limits. Options:

1. Increase `max_usd_per_pr` in config
2. Split the PR into smaller changes
3. Static analysis still runs regardless

### AI agent skipped but no error

This is normal if `required: false` (default). The agent skipped because:

- API key not configured
- Ollama server unreachable
- Budget exceeded

Set `required: true` to fail instead of skip.

## Related Documentation

- [Free Tier Setup](./free-tier.md) - No API keys needed
- [Local LLM Setup](../oscr/local-llm-setup.md) - Self-hosted Ollama
- [Configuration Reference](../../configuration/config-schema.md) - All options
- [Cost Controls](../../configuration/cost-controls.md) - Budget management
- [Security Model](../../architecture/security.md) - How secrets are protected
