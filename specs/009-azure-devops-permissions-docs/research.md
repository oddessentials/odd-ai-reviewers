# Research: Azure DevOps Build Agent Permissions

**Feature**: 009-azure-devops-permissions-docs
**Date**: 2026-01-29
**Status**: Complete

## Overview

This research consolidates findings on Azure DevOps pipeline identity types, required permissions for PR commenting, error codes, and permission inheritance behavior.

---

## 1. Identity Types for Pipeline Build Agents

Azure DevOps supports **four distinct identity types** that may need permissions configuration:

### 1.1 Project-Scoped Build Service (Recommended)

**Name Format**: `{ProjectName} Build Service ({OrgName})`
**Example**: `SpaceGameWeb Build Service (fabrikam-tailspin)`

- **Scope**: Restricted to single project only
- **Use Case**: Single-project pipelines (recommended for security)
- **When Used**: When "Limit job authorization scope" is enabled at project level
- **Security**: Limits blast radius if token is compromised

### 1.2 Collection-Scoped Build Service

**Name Format**: `Project Collection Build Service ({OrgName})`
**Example**: `Project Collection Build Service (fabrikam-tailspin)`

- **Scope**: Can access all projects in the organization
- **Use Case**: Multi-project pipelines or cross-project resource access
- **When Used**: When "Limit job authorization scope" is disabled at organization level
- **Security**: Higher risk - token can access any project

### 1.3 Self-Hosted Agent Service Account

**Identity Type**: Local user account or managed service account on the agent machine

- **Name Format**: Varies (NT AUTHORITY\NETWORK SERVICE, custom account, or gMSA)
- **Scope**: Depends on permissions explicitly granted
- **Use Case**: On-premises or self-hosted agents
- **Best Practice**: Use a different identity from the one connecting agent to pool

### 1.4 Service Connection or PAT-Authenticated User

**Authentication Methods**:

- **Personal Access Token (PAT)**: Explicit token for local testing or cross-org access
  - Environment variable: `AZURE_DEVOPS_PAT`
- **Service Principal/Managed Identity**: Azure AD-based identity
- **User credentials**: User making API calls with their own identity

---

## 2. Required Permissions

### 2.1 Primary Permissions (Both Required)

| Permission Name                 | API Name                | Required For                                  |
| ------------------------------- | ----------------------- | --------------------------------------------- |
| **Contribute**                  | `GenericContribute`     | Git operations that precede thread operations |
| **Contribute to pull requests** | `PullRequestContribute` | Posting PR thread comments, replying, voting  |

### 2.2 What These Permissions Enable

- Creating and updating pull request threads (comments)
- Replying to existing thread comments
- Voting on pull requests
- Creating commits and pushing code
- Creating and managing branches

### 2.3 What These Permissions Do NOT Enable

These permissions **explicitly do NOT** bypass or override:

- **Branch policies** (required reviewers, minimum approval counts)
- **Merge restrictions** (enforce complete builds before merge)
- **Required work items** (linked work item requirements)
- **Auto-complete restrictions** (queue for auto-complete permissions)
- **Policy exemptions** (PolicyExempt permission required separately)

**Key Documentation Statement**: "These permissions enable PR thread/comment posting; they do NOT bypass branch policies (merge restrictions, required reviewers, linked work items, etc.)"

---

## 3. Error Codes & Troubleshooting Mapping

### 3.1 TF401027 - Permission Required

**Error Messages**:

```
TF401027: You need the Git 'PullRequestContribute' permission to perform this action.
TF401027: You need the Git 'GenericContribute' permission to perform this action.
```

**Root Cause**: Build service identity lacks required permissions

**Resolution**:

1. Project Settings → Repositories → Security
2. Search for exact identity name
3. Set "Contribute" to **Allow**
4. Set "Contribute to pull requests" to **Allow**
5. Check for Inherited Deny blocking access

### 3.2 TF401444 - First Login Required

**Error Message**:

```
TF401444: Please sign-in at least once as [{user}] in a web browser to enable access to the service.
```

**Root Cause**: Identity has never authenticated via browser

**Resolution**:

1. Ensure identity has logged in to Azure DevOps via web browser once
2. For PAT: Verify PAT is created with "Code (Read & Write)" scope
3. Wait 5-7 minutes for directory synchronization

### 3.3 REST API 403 - PullRequestThread

**Error Patterns**:

```
403 Unauthorized when calling POST /_apis/git/repositories/{repo}/pullRequests/{pr}/threads
```

**Root Causes**:

- Token lacks "Contribute to pull requests" scope
- Authentication token missing or malformed
- Token expired (SYSTEM_ACCESSTOKEN is job-scoped)
- Job authorization scope restricted

**Resolution**:

1. Verify both permissions are set to Allow
2. Check PAT has not expired
3. For cross-project: Disable "Limit job authorization scope"

### 3.4 REST API 401 - General Authorization

**Error Patterns**:

```
401 Unauthorized
Invalid credentials
```

**Root Causes**:

- Missing Authorization header
- Token not in correct format
- Token type mismatch (Basic vs Bearer)

**Correct Format**:

```
Authorization: Bearer {token}
```

### 3.5 Git Repositories Authorization Errors

**Error Patterns**:

```
401 Unauthorized: You are not authorized to access this Git repository
403 Forbidden: Access denied to repository
```

**Root Causes**:

- Build service not added to repository security
- Repository inheritance disabled
- Inherited Deny blocking access

---

## 4. Permission Inheritance Behavior

### 4.1 Hierarchy Model

```
Organization Level
    ↓ (inherits to)
Project Level
    ↓ (inherits to)
Git Repositories (top level)
    ↓ (inherits to)
Individual Repositories
```

### 4.2 Key Rules

1. **Most specific rule wins** (repository > project > organization)
2. **Explicit Deny always wins** over Allow at same or higher level
3. **Inheritance toggle** can be disabled per repository
4. If inheritance OFF and permission "Not set" → No access

### 4.3 Common Conflict Scenarios

| Scenario                             | Result        | Fix                                      |
| ------------------------------------ | ------------- | ---------------------------------------- |
| Project-level Deny, Repo-level Allow | **Deny wins** | Remove project Deny                      |
| Inheritance OFF, Project has Allow   | **No access** | Enable inheritance OR add explicit Allow |
| User in Allow + Deny groups          | **Deny wins** | Remove from Deny group                   |

---

## 5. Scope Decision Rules

### Use Project-Level When:

- Pipeline runs against multiple repositories in same project
- Easier maintenance (one place to manage)
- Service account shared across many pipelines

### Use Repository-Level When:

- Pipeline accesses only one repository (least privilege)
- Repository requires different security posture
- Need to isolate permissions for sensitive repos

### Decision Rule for Documentation:

> "If pipeline runs across multiple repos in the same project, grant at project-level; otherwise repo-level is least-privilege"

---

## 6. Verification Checklist

```
□ Step 1: Identify exact identity name
  └─ Project-scoped: "{ProjectName} Build Service ({OrgName})"
  └─ Collection-scoped: "Project Collection Build Service ({OrgName})"

□ Step 2: Navigate to Project Settings → Repositories → Security

□ Step 3: Search for identity (Add if not present)

□ Step 4: Verify "Contribute" permission
  ✅ "Allow" = Correct
  ⚠️ "Not set" = Set to Allow
  ❌ "Inherited Deny" = Fix project-level or override
  ❌ "Deny" = Remove explicit deny

□ Step 5: Verify "Contribute to pull requests" permission
  (Same checks as Step 4)

□ Step 6: Check inheritance if Deny or "Not set"
  └─ Inheritance ON + Inherited Deny → Check project level
  └─ Inheritance OFF + Not set → Add explicit Allow

□ Step 7: For multi-repo pipelines, consider project-level grant

□ Step 8: Re-run pipeline to verify
```

---

## 7. Identity Decision Tree

```
START: Which identity type is my pipeline using?
│
├─ Q1: Is this a Microsoft-hosted agent?
│   ├─ YES → Q2: Is "Limit job authorization scope" enabled?
│   │   ├─ YES → Use: "{ProjectName} Build Service ({OrgName})"
│   │   └─ NO  → Use: "Project Collection Build Service ({OrgName})"
│   │
│   └─ NO (Self-hosted) → Q3: How does the agent authenticate?
│       ├─ Default service account → Check agent's Windows service identity
│       ├─ Custom service account → Use that account name
│       └─ PAT/Service Connection → Use the PAT owner's identity
│
└─ Finding the identity name:
    └─ Project Settings → Agent Pools → [Your Pool] → Security
    └─ Or check pipeline logs for "Job authorization"
```

---

## 8. Sources

- [Job access tokens - Azure Pipelines | Microsoft Learn](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/access-tokens)
- [Set Git repository permissions - Azure Repos | Microsoft Learn](https://learn.microsoft.com/en-us/azure/devops/repos/git/set-git-repository-permissions)
- [Troubleshoot permissions - Azure DevOps | Microsoft Learn](https://learn.microsoft.com/en-us/azure/devops/organizations/security/troubleshoot-permissions)
- [Pull Request Threads REST API | Microsoft Learn](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads)

---

## Decisions Summary

| Topic             | Decision                                    | Rationale                                  |
| ----------------- | ------------------------------------------- | ------------------------------------------ |
| Identity coverage | Document all 4 types with decision tree     | Users have diverse pipeline configurations |
| Scope guidance    | Include decision rule + inheritance warning | Prevents common misconfiguration           |
| Error mapping     | Map 5 specific error codes to fixes         | Enables self-service troubleshooting       |
| Branch policies   | Explicit "does NOT enable" statement        | Prevents expectation mismatch              |
| Verification      | Step-by-step checklist with status meanings | Removes guesswork                          |

All research items resolved. Ready for Phase 1 design.
