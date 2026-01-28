# Examples

Complete, working configuration examples for common use cases. Copy these configurations and adapt them to your needs.

## In This Section

| Example                                                 | Platform | Tier | Description                             |
| ------------------------------------------------------- | -------- | ---- | --------------------------------------- |
| [GitHub Basic](./github-basic.md)                       | GitHub   | Free | Minimal setup with static analysis only |
| [GitHub Enterprise](./github-enterprise.md)             | GitHub   | Paid | Full AI review with cost controls       |
| [Azure DevOps Free](./azure-devops-free.md)             | ADO      | Free | OSCR integration with local LLMs        |
| [Azure DevOps Enterprise](./azure-devops-enterprise.md) | ADO      | Paid | Full enterprise configuration           |

## By Platform

### GitHub Examples

- **[Basic](./github-basic.md)** - Static analysis only (Semgrep), no API keys needed
- **[Enterprise](./github-enterprise.md)** - Multi-pass review with Claude, cost controls, and custom agents

### Azure DevOps Examples

- **[Free Tier](./azure-devops-free.md)** - Local LLM with Ollama, no cloud API costs
- **[Enterprise](./azure-devops-enterprise.md)** - Full configuration with Azure OpenAI integration

## Quick Start

1. Choose an example matching your platform and budget
2. Copy the configuration to `.ai-review.yml`
3. Add required secrets to your CI environment
4. Open a PR and watch the magic happen

## Quick Links

- [Configuration Reference →](../configuration/config-schema.md)
- [Cost Controls →](../configuration/cost-controls.md)
- [Platform Guides →](../platforms/)
