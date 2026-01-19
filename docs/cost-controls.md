# Cost Controls

This document explains how odd-ai-reviewers manages and controls costs.

## Why Cost Controls Matter

AI-powered code review can incur costs from:

- LLM API calls (OpenCode.ai, OpenAI, etc.)
- Token consumption (input + output)
- Compute time

Without controls, a single large PR could cost more than expected.

## Cost Control Layers

### Layer 1: Static Analysis First

Static analysis tools (Semgrep) run before any LLM calls:

- Zero cost
- Catches common issues
- Reduces work for AI agents

### Layer 2: Per-PR Limits

Each PR is checked against limits before LLM calls:

```yaml
limits:
  max_files: 50 # Skip LLM if too many files
  max_diff_lines: 2000 # Truncate large diffs
  max_tokens_per_pr: 12000 # Token budget
  max_usd_per_pr: 1.00 # Cost cap
```

If limits are exceeded:

- Static analysis still runs
- LLM passes are skipped
- A summary explains why

### Layer 3: Monthly Budget

Track spending across all PRs:

```yaml
limits:
  monthly_budget_usd: 100
```

When the monthly budget is exhausted:

- New PRs get static analysis only
- A warning appears in the review summary

## How Costs Are Estimated

### Token Estimation

Tokens are estimated from diff size:

- ~4 characters per token (approximate)
- Both input and output counted

### Cost Calculation

Based on typical GPT-4 pricing:

- Input: $0.01 per 1K tokens
- Output: $0.03 per 1K tokens (estimated at 20% of input)

Example:

```
10,000 input tokens
= $0.10 input cost
+ $0.06 output cost (2,000 tokens)
= $0.16 per PR
```

## Configuration Examples

### Ultra-Low Cost

```yaml
limits:
  max_files: 10
  max_diff_lines: 500
  max_tokens_per_pr: 4000
  max_usd_per_pr: 0.25
  monthly_budget_usd: 25
```

### Standard (Default)

```yaml
limits:
  max_files: 50
  max_diff_lines: 2000
  max_tokens_per_pr: 12000
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
```

### High Volume

```yaml
limits:
  max_files: 100
  max_diff_lines: 5000
  max_tokens_per_pr: 30000
  max_usd_per_pr: 5.00
  monthly_budget_usd: 500
```

## Path Filtering

Reduce costs by excluding generated/vendored code:

```yaml
path_filters:
  include:
    - 'src/**'
    - 'lib/**'
  exclude:
    - '**/generated/**'
    - '**/vendor/**'
    - '**/*.min.js'
```

## Static-Only Mode

Run only free tools (zero AI cost):

```yaml
passes:
  - name: static
    agents: [semgrep]
    enabled: true
  - name: semantic
    agents: [opencode]
    enabled: false # Disabled
```

## Monitoring Costs

### Check Run Summary

Each review includes cost information:

- Estimated tokens used
- Estimated cost
- Budget remaining

### GitHub Actions Usage

Monitor workflow minutes in:
Settings → Actions → Usage

### API Provider Dashboards

Check spending at your LLM provider:

- OpenCode.ai dashboard
- OpenAI usage page

## Cost Optimization Tips

1. **Use static analysis** - Free and catches many issues
2. **Set conservative limits** - Start small, increase as needed
3. **Filter paths** - Skip generated code
4. **Review configuration** - Disable unused agents
5. **Monitor spending** - Check dashboards weekly
