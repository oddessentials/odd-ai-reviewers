# Configuration

Configure odd-ai-reviewers to match your team's needs. This section covers the configuration schema, cost controls, and best practices.

## In This Section

| Document                                   | Description                                       |
| ------------------------------------------ | ------------------------------------------------- |
| [Configuration Schema](./config-schema.md) | Complete reference for `.ai-review.yml` options   |
| [Cost Controls](./cost-controls.md)        | Budget limits, per-PR caps, and cost optimization |

## Configuration File

odd-ai-reviewers is configured via `.ai-review.yml` at your repository root:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: semantic
    agents: [opencode]

models:
  default: claude-sonnet-4-20250514 # Or claude-opus-4-6

limits:
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
```

## Quick Links

- [All YAML Options →](./config-schema.md)
- [Budget Management →](./cost-controls.md)
- [Agent Capabilities →](./config-schema.md#agent-capability-matrix)
