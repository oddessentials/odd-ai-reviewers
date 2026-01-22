# Roadmap: Azure DevOps Support

> Items below are **future work** focused on Azure DevOps integration. For completed features, see individual documentation files.

> **Implementation Plan Available:** See [ADO-IMPLEMENTATION-PLAN.md](./ADO-IMPLEMENTATION-PLAN.md) for the comprehensive, enterprise-grade implementation plan with full GitHub feature parity.

---

## Current Platform Support

| Feature                    | GitHub      | Azure DevOps |
| -------------------------- | ----------- | ------------ |
| PR Commenting              | ✅ Complete | 🔴 Planned   |
| Check Runs / Build Status  | ✅ Complete | 🔴 Planned   |
| Inline Annotations         | ✅ Complete | 🔴 Planned   |
| Comment Deduplication      | ✅ Complete | 🔴 Planned   |
| Draft PR Detection         | ✅ Complete | 🔴 Planned   |
| Fork PR Blocking           | ✅ Complete | 🔴 Planned   |
| Trust Validation           | ✅ Complete | 🔴 Planned   |
| Rate Limiting              | ✅ Complete | 🔴 Planned   |
| Reusable Pipeline/Workflow | ✅ Complete | ⚠️ Stub only |

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

- [ ] Create `ado.ts` reporter module
- [ ] Use Azure DevOps REST API for PR threads
- [ ] Support inline comments (position-based)
- [ ] Create pipeline status as check
- [ ] Handle ADO-specific auth:
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

- [ ] Extend Azure Pipeline YAML template
- [ ] Variable groups for secrets (`OPENAI_API_KEY`, etc.)
- [ ] Agent pool compatibility (`ubuntu-latest`, self-hosted)
- [ ] Service connection for cross-repo checkout
- [ ] Semgrep installation step

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
