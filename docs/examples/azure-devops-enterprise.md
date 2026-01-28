# Azure DevOps Enterprise Example

A comprehensive configuration for enterprise Azure DevOps environments with full AI analysis and Azure OpenAI integration.

## Use Case

- Enterprise Azure DevOps
- Azure OpenAI Service integration
- Multi-pass review (static + AI)
- Budget controls

## Pipeline File

Create `azure-pipelines.yml`:

```yaml
trigger: none

pr:
  branches:
    include:
      - main
      - develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  - group: ai-review-secrets

stages:
  - stage: AIReview
    displayName: 'AI Code Review'
    jobs:
      - job: Review
        displayName: 'Run AI Review'
        steps:
          - checkout: self
            fetchDepth: 0

          - task: NodeTool@0
            inputs:
              versionSpec: '22.x'
            displayName: 'Install Node.js'

          - script: |
              npx odd-ai-reviewers review \
                --platform ado \
                --pr $(System.PullRequest.PullRequestId) \
                --repo $(Build.Repository.Name)
            displayName: 'Run AI Review'
            env:
              AZURE_OPENAI_API_KEY: $(AZURE_OPENAI_API_KEY)
              AZURE_OPENAI_ENDPOINT: $(AZURE_OPENAI_ENDPOINT)
              AZURE_OPENAI_DEPLOYMENT: $(AZURE_OPENAI_DEPLOYMENT)
              SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

## Configuration File

Create `.ai-review.yml`:

```yaml
version: 1
trusted_only: true

passes:
  # Pass 1: Free static analysis
  - name: static
    agents: [semgrep]

  # Pass 2: AI semantic review with Azure OpenAI
  - name: semantic
    agents: [opencode]

models:
  # Azure OpenAI deployment name
  default: gpt-4o

limits:
  # Per-PR limits
  max_usd_per_pr: 5.00
  max_files: 50
  max_diff_lines: 2000

  # Monthly budget
  monthly_budget_usd: 500

  # Output limits
  max_inline_comments: 25

# Exclude paths from review
path_filters:
  exclude:
    - '**/*.lock'
    - '**/node_modules/**'
    - '**/bin/**'
    - '**/obj/**'
```

## Required Secrets

Create a variable group `ai-review-secrets` with:

| Variable                  | Description                      |
| ------------------------- | -------------------------------- |
| `AZURE_OPENAI_API_KEY`    | Azure OpenAI API key             |
| `AZURE_OPENAI_ENDPOINT`   | Azure OpenAI endpoint URL        |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (e.g., `gpt-4o`) |

## Service Connection

1. Go to Project Settings → Service connections
2. Create a new Azure Resource Manager connection
3. Grant the pipeline access to the connection

## What You Get

- **Azure OpenAI integration** — Use your enterprise AI service
- **ADO native reporting** — Comments appear in PR threads
- **Cost protection** — Per-PR and monthly limits
- **Enterprise security** — No data leaves your Azure tenant

## Cost Estimation

Azure OpenAI pricing varies by region and model. Typical costs:

| PR Size                | Estimated Cost |
| ---------------------- | -------------- |
| Small (< 100 lines)    | $0.05 - $0.25  |
| Medium (100-500 lines) | $0.25 - $1.00  |
| Large (500+ lines)     | $1.00 - $3.00  |

## Alternative: Standard OpenAI

If not using Azure OpenAI, use standard OpenAI:

```yaml
# Pipeline env section
env:
  OPENAI_API_KEY: $(OPENAI_API_KEY)
```

```yaml
# .ai-review.yml
models:
  default: gpt-4o-mini
```

## See Also

- [Azure DevOps Free Example](./azure-devops-free.md) — Free tier with local LLM
- [Azure DevOps Setup](../platforms/azure-devops/setup.md) — Complete setup guide
- [Configuration Schema](../configuration/config-schema.md) — All options
