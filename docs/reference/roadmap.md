# Roadmap: Azure DevOps Support

> Azure DevOps support has been implemented. For setup instructions, see [ADO-SETUP.md](./ADO-SETUP.md).

> **Implementation Plan:** See [ADO-IMPLEMENTATION-PLAN.md](./ADO-IMPLEMENTATION-PLAN.md) for the comprehensive implementation details.

---

## Current Platform Support

| Feature                    | GitHub      | Azure DevOps |
| -------------------------- | ----------- | ------------ |
| PR Commenting              | ✅ Complete | ✅ Complete  |
| Check Runs / Build Status  | ✅ Complete | ✅ Complete  |
| Inline Annotations         | ✅ Complete | ✅ Complete  |
| Comment Deduplication      | ✅ Complete | ✅ Complete  |
| Draft PR Detection         | ✅ Complete | ✅ Complete  |
| Fork PR Blocking           | ✅ Complete | ✅ Complete  |
| Trust Validation           | ✅ Complete | ✅ Complete  |
| Rate Limiting              | ✅ Complete | ✅ Complete  |
| Reusable Pipeline/Workflow | ✅ Complete | ✅ Complete  |

---

## Phase 1: ADO Reporter

**Priority:** 🔴 High (enterprise customers)

### Deliverable

`router/src/report/ado.ts` — Azure DevOps PR commenting and status updates

### API Reference

```
POST https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/threads
```

### Requirements

- [x] Create `ado.ts` reporter module
- [x] Use Azure DevOps REST API for PR threads
- [x] Support inline comments (position-based)
- [x] Create pipeline status as check
- [x] Handle ADO-specific auth:
  - Personal Access Token (PAT)
  - Managed Identity (Azure Pipelines)
  - System.AccessToken

### Environment Variables

| Variable                           | Required | Description               |
| ---------------------------------- | -------- | ------------------------- |
| `SYSTEM_ACCESSTOKEN`               | Yes      | Azure Pipelines job token |
| `AZURE_DEVOPS_PAT`                 | Alt      | Personal access token     |
| `BUILD_REPOSITORY_URI`             | Auto     | Set by Azure Pipelines    |
| `SYSTEM_PULLREQUEST_PULLREQUESTID` | Auto     | PR number                 |

---

## Phase 2: ADO Pipeline Template

**Priority:** 🟡 Medium

### Deliverable

Complete `templates/ado/ai-review-template.yml` (currently stub)

### Requirements

- [x] Extend Azure Pipeline YAML template
- [x] Variable groups for secrets (`OPENAI_API_KEY`, etc.)
- [x] Agent pool compatibility (`ubuntu-latest`, self-hosted)
- [x] Service connection for cross-repo checkout
- [x] Semgrep installation step

### Example Usage

```yaml
# azure-pipelines.yml in target repository
trigger:
  - main

extends:
  template: templates/ado/ai-review-template.yml@odd-ai-reviewers
  parameters:
    targetRepo: $(Build.Repository.Name)
    targetRef: $(Build.SourceVersion)
    prNumber: $(System.PullRequest.PullRequestId)
```

---

## Phase 3: Additional Platform Support

**Priority:** 🟢 Low

### GitLab

`router/src/report/gitlab.ts`

- GitLab MR notes API: `POST /projects/:id/merge_requests/:iid/notes`
- `CI_JOB_TOKEN` or PAT authentication

### Gitea

`router/src/report/gitea.ts`

- GitHub-compatible API subset
- PAT authentication

---

## Out of Scope

The following are explicitly **not planned** for odd-ai-reviewers:

- ❌ Bitbucket support (insufficient demand)
- ❌ CI orchestration (that's OSCR's job)
- ❌ Secret management (use provider-native)
- ❌ Webhook-triggered standalone mode

---

## Implementation Plan

A comprehensive implementation plan has been created to ensure enterprise-grade Azure DevOps support with full GitHub feature parity:

**[ADO-IMPLEMENTATION-PLAN.md](./ADO-IMPLEMENTATION-PLAN.md)** covers:

- Phase 1: ADO Reporter Module (`ado.ts`) with thread comments, inline annotations, build status
- Phase 2: Trust & Environment Detection for ADO-specific context
- Phase 3: Configuration Schema Extensions for ADO reporting modes
- Phase 4: Security Module Updates (token stripping already partially implemented)
- Phase 5: Complete Pipeline Template with variable groups and secret handling
- Phase 6: Comprehensive Testing Strategy matching GitHub test coverage
- Phase 7: Documentation Updates

The plan ensures compliance with all invariants defined in [INVARIANTS.md](./INVARIANTS.md), particularly:

- Router Monopoly Rule (only router posts to ADO)
- No Direct Secrets to Agents (ADO tokens stripped)
- Provider-Neutral Core (isolated `ado.ts` module)
- Provider Parity Roadmap Discipline

---

## Related Documentation

- [ADO-IMPLEMENTATION-PLAN.md](./ADO-IMPLEMENTATION-PLAN.md) — Comprehensive Azure DevOps implementation plan
- [SCOPE.md](./SCOPE.md) — What odd-ai-reviewers does and doesn't do
- [config-schema.md](./config-schema.md) — Configuration reference
- [INVARIANTS.md](./INVARIANTS.md) — Design constraints
