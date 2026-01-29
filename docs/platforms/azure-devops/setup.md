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

#### Required Permissions

The pipeline identity needs **both** of these permissions to post PR comments:

| Permission                      | Purpose                                 |
| ------------------------------- | --------------------------------------- |
| **Contribute**                  | Required for Git operations             |
| **Contribute to pull requests** | Required for posting PR thread comments |

#### Identify Your Pipeline Identity

Before granting permissions, identify which identity your pipeline uses. Azure DevOps supports four identity types:

**1. Project-Scoped Build Service (Recommended)**

- **Format**: `{ProjectName} Build Service ({OrgName})`
- **Example**: `MyProject Build Service (myorg)`
- **When used**: When "Limit job authorization scope to current project" is **enabled** (default for new projects)
- **Security**: Recommended - limits access to current project only

**2. Collection-Scoped Build Service**

- **Format**: `Project Collection Build Service ({OrgName})`
- **Example**: `Project Collection Build Service (myorg)`
- **When used**: When "Limit job authorization scope" is **disabled** at organization level
- **Security**: Higher risk - can access all projects in the organization

**3. Self-Hosted Agent Service Account**

- **Format**: Varies (e.g., `NT AUTHORITY\NETWORK SERVICE`, custom account, or gMSA)
- **When used**: On-premises or self-hosted agents
- **Finding it**: Check the Windows service identity running the agent

**4. Service Connection or PAT User**

- **Format**: The user account that owns the PAT or service connection
- **When used**: When using `AZURE_DEVOPS_PAT` instead of `SYSTEM_ACCESSTOKEN`
- **Finding it**: Check who created the PAT or service principal

**Decision Tree: Which identity is my pipeline using?**

```
Is this a Microsoft-hosted agent?
├─ YES → Is "Limit job authorization scope" enabled?
│   ├─ YES → Use: "{ProjectName} Build Service ({OrgName})"
│   └─ NO  → Use: "Project Collection Build Service ({OrgName})"
│
└─ NO (Self-hosted) → How does the agent authenticate?
    ├─ Default service account → Check agent's Windows service identity
    ├─ Custom service account → Use that account name
    └─ PAT/Service Connection → Use the PAT owner's identity

To find your identity: Check pipeline logs for "Job authorization" or go to
Project Settings → Agent Pools → [Your Pool] → Security
```

#### Granting Permissions

1. Go to **Project Settings** → **Repositories** → **Security**
   - For project-level: Stay at top-level "Git Repositories"
   - For repository-level: Select your specific repository first
2. Search for your pipeline identity (see above)
3. If not found, click **"+ Add"** and search for "Build Service"
4. Set **"Contribute"** to **Allow**
5. Set **"Contribute to pull requests"** to **Allow**
6. Verify neither shows "Inherited Deny" (see troubleshooting if so)

#### Verification Checklist

After granting permissions, verify the configuration:

- [ ] **Step 1**: Identify exact identity name using decision tree above
- [ ] **Step 2**: Navigate to Project Settings → Repositories → Security
- [ ] **Step 3**: Search for identity (Add if not present)
- [ ] **Step 4**: Verify "Contribute" permission shows:
  - ✅ "Allow" = Correct
  - ⚠️ "Not set" = Set to Allow
  - ❌ "Inherited Deny" = Fix at project level or override
  - ❌ "Deny" = Remove explicit deny
- [ ] **Step 5**: Verify "Contribute to pull requests" shows "Allow" (same checks as Step 4)
- [ ] **Step 6**: If inheritance issues exist, check project-level permissions
- [ ] **Step 7**: Re-run pipeline to verify

#### Scope Decision Guide

**When to use project-level permissions:**

- Pipeline runs against multiple repositories in the same project
- Easier maintenance (one place to manage)
- Service account shared across many pipelines

**When to use repository-level permissions:**

- Pipeline accesses only one repository (least privilege)
- Repository requires different security posture
- Need to isolate permissions for sensitive repos

**Decision rule**: If pipeline runs across multiple repos in the same project, grant at project-level; otherwise repo-level is least-privilege.

> [!WARNING]
> Repository-level permissions can be overridden by inherited project-level **Deny** policies. If you set "Allow" at repo level but still get errors, check project-level settings.
>
> Organization-level security policies may also override project/repo settings. Contact your Azure DevOps admin if permissions appear correct but errors persist.

#### What These Permissions Do NOT Enable

> [!NOTE]
> These permissions enable PR thread/comment posting. They do **NOT** bypass branch policies, including:
>
> - Required reviewers and minimum approval counts
> - Merge restrictions (enforce complete builds before merge)
> - Required work items (linked work item requirements)
> - Path filters and merge type restrictions
>
> If you need to bypass policies, you need the separate "Bypass policies" permission.

#### Search Terms

For quick navigation, search for: `Contribute to pull requests`, `Build Service`, `Project Collection Build Service`, `TF401027`, `TF401444`

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

### Permission Error Reference

| Error Code | Message Pattern                                        | Resolution                          |
| ---------- | ------------------------------------------------------ | ----------------------------------- |
| TF401027   | "You need the Git 'PullRequestContribute' permission"  | Grant both Contribute permissions   |
| TF401027   | "You need the Git 'GenericContribute' permission"      | Grant "Contribute" permission       |
| TF401444   | "Please sign-in at least once as [user]"               | Identity needs first web login      |
| 403        | "Unauthorized" when calling `pullRequests/.../threads` | Check token scope and permissions   |
| 401        | "Unauthorized" or "Invalid credentials"                | Verify Authorization header format  |
| 401/403    | "You are not authorized to access this Git repository" | Add identity to repository security |

### TF401027 - Permission Required

```
TF401027: You need the Git 'PullRequestContribute' permission to perform this action.
TF401027: You need the Git 'GenericContribute' permission to perform this action.
```

**Root Cause**: Build service identity lacks required permissions for PR commenting.

**Resolution**:

1. Go to **Project Settings** → **Repositories** → **Security**
2. Search for your pipeline identity (see [Identify Your Pipeline Identity](#identify-your-pipeline-identity))
3. Set **"Contribute"** to **Allow**
4. Set **"Contribute to pull requests"** to **Allow**
5. Check for "Inherited Deny" blocking access - if present, fix at project level
6. Re-run the pipeline

> [!TIP]
> Use the [Verification Checklist](#verification-checklist) to confirm permissions are correctly configured.

### TF401444 - First Login Required

```
TF401444: Please sign-in at least once as [{user}] in a web browser to enable access to the service.
```

**Root Cause**: The identity has never authenticated via browser, which is required for initial account activation.

**Resolution**:

1. Sign in to Azure DevOps via web browser at least once with the identity
2. For PAT-based auth: Verify PAT is created with "Code (Read & Write)" scope
3. Wait 5-7 minutes for directory synchronization to complete
4. Re-run the pipeline

**Common with**:

- Newly created service accounts
- Service principals that have never interacted with Azure DevOps
- PATs created for accounts that haven't logged in recently

### 403 Unauthorized - PullRequestThread

```
403 Unauthorized when calling POST /_apis/git/repositories/{repo}/pullRequests/{pr}/threads
```

**Root Causes**:

- Token lacks "Contribute to pull requests" permission
- Token expired (`SYSTEM_ACCESSTOKEN` is job-scoped with ~60 minute lifetime)
- Job authorization scope restricted to current project but accessing cross-project repo

**Resolution**:

1. Verify both permissions are set to **Allow** (see [Verification Checklist](#verification-checklist))
2. Check PAT has not expired (if using `AZURE_DEVOPS_PAT`)
3. For cross-project access: Disable "Limit job authorization scope to current project" in Project Settings → Pipelines → Settings

### 401 Unauthorized - General Authorization

```
401 Unauthorized
Invalid credentials
```

**Root Causes**:

- Missing Authorization header in API calls
- Token not in correct format (Basic vs Bearer)
- Token has expired or been revoked

**Resolution**:

1. Verify `SYSTEM_ACCESSTOKEN` is available in the pipeline context
2. For PAT-based auth: Ensure Authorization header format is `Bearer {token}`
3. Check if PAT has been revoked or expired
4. Verify the pipeline has access to the target repository

### Git Repositories Authorization Errors

```
401 Unauthorized: You are not authorized to access this Git repository
403 Forbidden: Access denied to repository
```

**Root Causes**:

- Build service not added to repository security
- Repository inheritance is disabled and no explicit permission granted
- Inherited Deny policy blocking access

**Resolution**:

1. Go to **Project Settings** → **Repositories** → **Security**
2. Search for your pipeline identity
3. If not found: Click **"+ Add"** and search for "Build Service"
4. Grant required permissions at the appropriate level
5. Check if inheritance is disabled - if so, add explicit Allow

### Comments Not Appearing

1. Verify `System.AccessToken` is available in the pipeline
2. Check Build Service has **both** "Contribute" and "Contribute to pull requests" permissions
3. Review pipeline logs for `[ado]` entries
4. Verify the PR is not a draft (drafts may be skipped)

### Missing PR Context

```
[router] Not running in ADO PR context - skipping review
```

- This is expected for push builds (not PRs)
- Ensure the build is triggered by a pull request
- Check `SYSTEM_PULLREQUEST_PULLREQUESTID` is set

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

- [Configuration Schema](../../configuration/config-schema.md)
- [Architecture Overview](../../architecture/overview.md)
- [Security Model](../../architecture/security.md)
- [GitHub Setup](../github/setup.md)
