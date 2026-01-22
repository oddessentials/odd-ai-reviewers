# Azure DevOps Setup Guide

This guide covers how to set up odd-ai-reviewers for Azure DevOps pipelines.

## Prerequisites

- Azure DevOps organization with Git repositories
- Access to configure Azure Pipelines
- API keys for AI providers (OpenAI, Anthropic, or local Ollama)

## Quick Start

### 1. Create Variable Group for Secrets

In your Azure DevOps project:

1. Go to **Pipelines** → **Library** → **+ Variable group**
2. Name it `ai-review-secrets`
3. Add variables:
   - `OPENAI_API_KEY` (if using OpenAI)
   - `ANTHROPIC_API_KEY` (if using Anthropic)
4. Mark both as **secret** (lock icon)

### 2. Enable System.AccessToken

The pipeline needs `System.AccessToken` to post PR comments:

1. Go to **Project Settings** → **Pipelines** → **Settings**
2. Ensure "Limit job authorization scope" is configured appropriately
3. In your pipeline YAML, the token is automatically available

### 3. Add Pipeline to Your Repository

Create `azure-pipelines.yml` in your repository:

```yaml
trigger:
  - main

pr:
  branches:
    include:
      - main

resources:
  repositories:
    - repository: odd-ai-reviewers
      type: git
      name: YourOrg/odd-ai-reviewers
      ref: main

extends:
  template: templates/ado/ai-review-template.yml@odd-ai-reviewers
  parameters:
    targetRepo: $(Build.Repository.Name)
    targetRef: $(Build.SourceVersion)
    prNumber: $(System.PullRequest.PullRequestId)
```

### 4. Configure Repository Permissions

> [!IMPORTANT]
> This step is **required** for PR commenting. Unlike GitHub Actions where `GITHUB_TOKEN` automatically has PR write access, Azure DevOps requires explicit permission grants.

For the pipeline to post PR comments:

1. Go to **Project Settings** → **Repositories** → **[Your Repository Name]**
2. Click the **Security** tab
3. Find the **Build Service** account:
   - Format: `[Project Name] Build Service ([Organization Name])`
   - Example: `MyProject Build Service (myorg)`
4. Set **"Contribute to pull requests"** to **Allow**

![ADO Permission Setting](https://learn.microsoft.com/azure/devops/repos/git/media/pull-requests/pr-policies.png?view=azure-devops)

> [!TIP]
> If you can't find the Build Service, click **"Add"** and search for "Build Service". There may be two entries - grant permission to the project-scoped one.

## Configuration Options

Create `.ai-review.yml` in your repository root:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
    enabled: true
    required: true
  - name: ai
    agents: [ai_semantic_review]
    enabled: true
    required: false

reporting:
  ado:
    mode: threads_and_status # or: threads_only, status_only
    max_inline_comments: 20
    summary: true
    thread_status: active # or: pending

gating:
  enabled: false
  fail_on_severity: error
```

## Reporting Modes

| Mode                 | PR Threads | Commit Status |
| -------------------- | ---------- | ------------- |
| `threads_and_status` | ✅         | ✅            |
| `threads_only`       | ✅         | ❌            |
| `status_only`        | ❌         | ✅            |

## Environment Variables

The router uses these ADO environment variables (automatically set by Azure Pipelines):

| Variable                                 | Purpose                              |
| ---------------------------------------- | ------------------------------------ |
| `SYSTEM_ACCESSTOKEN`                     | Pipeline auth token for PR comments  |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`     | ADO organization URL                 |
| `SYSTEM_TEAMPROJECT`                     | Project name                         |
| `BUILD_REPOSITORY_NAME`                  | Repository name                      |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`       | PR number                            |
| `SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI` | Fork source URL (for fork detection) |
| `TF_BUILD`                               | Platform detection flag              |

## Security Considerations

1. **Token Isolation**: ADO tokens (`SYSTEM_ACCESSTOKEN`, `AZURE_DEVOPS_PAT`) are never passed to AI agents
2. **Fork PRs**: Blocked by default when `trusted_only: true`
3. **Draft PRs**: Skipped automatically (requires API check)

## Troubleshooting

### Comments not appearing

1. Verify `System.AccessToken` is available in the pipeline
2. Check Build Service has **Contribute to pull requests** permission (see [Configure Repository Permissions](#4-configure-repository-permissions))
3. Review pipeline logs for `[ado]` entries

### 403 PullRequestContribute Error

```
Failed to create summary thread: 403 TF401027: You need the Git 'PullRequestContribute' permission
```

This means the Build Service identity doesn't have permission to comment on PRs:

1. Go to **Project Settings** → **Repositories** → **[Your Repo]** → **Security**
2. Find `[Project] Build Service ([Org])`
3. Set **"Contribute to pull requests"** to **Allow**
4. Re-run the pipeline

> [!NOTE]
> Commit status updates may still work even when PR comments fail, because they require different permissions.

### Authentication errors

```
Failed to start build status: 401 Unauthorized
```

- Verify the pipeline has access to the target repository
- Check if cross-organization access is needed (use `AZURE_DEVOPS_PAT`)

### Missing PR context

```
[router] Not running in ADO PR context - skipping review
```

- This is expected for push builds (not PRs)
- Ensure the build is triggered by a pull request

## Local Testing

For local ADO testing, set environment variables:

```bash
export AZURE_DEVOPS_PAT="your-pat-here"
export SYSTEM_TEAMFOUNDATIONCOLLECTIONURI="https://dev.azure.com/yourorg/"
export SYSTEM_TEAMPROJECT="yourproject"
export BUILD_REPOSITORY_NAME="yourrepo"
export SYSTEM_PULLREQUEST_PULLREQUESTID="123"
export TF_BUILD="True"

npm run build
node dist/main.js review --repo . --base main --head HEAD
```

## Related Documentation

- [Configuration Schema](./config-schema.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Security Model](./security.md)
- [GitHub Setup](./github-setup.md)
