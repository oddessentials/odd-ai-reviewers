# Roadmap: Azure DevOps Support

> Items below are **future work** focused on Azure DevOps integration. For completed features, see individual documentation files.

---

## Current Platform Support

| Feature            | GitHub      | Azure DevOps |
| ------------------ | ----------- | ------------ |
| PR Commenting      | ✅ Complete | 🔴 Planned   |
| Check Runs         | ✅ Complete | 🔴 Planned   |
| Inline Annotations | ✅ Complete | 🔴 Planned   |
| Reusable Pipeline  | ✅ Complete | ⚠️ Stub only |

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

## Related Documentation

- [SCOPE.md](./SCOPE.md) — What odd-ai-reviewers does and doesn't do
- [config-schema.md](./config-schema.md) — Configuration reference
- [INVARIANTS.md](./INVARIANTS.md) — Design constraints
