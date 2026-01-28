# Platforms

odd-ai-reviewers supports multiple CI/CD platforms. Choose your platform below for specific setup instructions and configuration guides.

## Supported Platforms

| Platform                        | Status      | Best For                            |
| ------------------------------- | ----------- | ----------------------------------- |
| [GitHub Actions](./github/)     | ✅ Complete | Public/private GitHub repos         |
| [Azure DevOps](./azure-devops/) | ✅ Complete | Enterprise Azure environments       |
| [OSCR](./oscr/)                 | ✅ Complete | Self-hosted, air-gapped, local LLMs |

## Platform Comparison

| Feature             | GitHub | Azure DevOps | OSCR |
| ------------------- | ------ | ------------ | ---- |
| Cloud-hosted        | ✅     | ✅           | ❌   |
| Self-hosted runners | ✅     | ✅           | ✅   |
| Local LLM support   | ✅     | ✅           | ✅   |
| Air-gap capable     | ❌     | ❌           | ✅   |
| Free tier           | ✅     | ✅           | ✅   |

## Quick Links

### GitHub

- [Setup Guide →](./github/setup.md)
- [Free Tier Config →](./github/free-tier.md)
- [Max Tier Config →](./github/max-tier.md)

### Azure DevOps

- [Setup Guide →](./azure-devops/setup.md)
- [Implementation Details →](./azure-devops/implementation.md)

### OSCR (Self-Hosted)

- [Integration Guide →](./oscr/integration.md)
- [Local LLM Setup →](./oscr/local-llm-setup.md)
- [Model Provisioning →](./oscr/model-provisioning.md)
