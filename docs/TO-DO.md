# TO-DO: Remaining Phase 3 Features

> Items below are **not critical** for current milestone. Prioritized for future sprints.

---

## Local LLM Agent (Ollama)

**File:** `router/src/agents/local_llm.ts`  
**Current:** Stub only (42 lines)

### Requirements

- Connect to `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- Call `/api/generate` endpoint with model from config
- Parse streaming response into findings
- Support models: `codellama:7b`, `deepseek-coder`

### Implementation Note

```typescript
const response = await fetch(`${ollamaUrl}/api/generate`, {
  method: 'POST',
  body: JSON.stringify({ model, prompt, stream: false }),
});
```

---

## ADO Reporter

**File:** `router/src/report/ado.ts` (missing)

### Requirements

- Use Azure DevOps REST API for PR comments
- Create pipeline status as check
- Handle ADO-specific auth (PAT or managed identity)
- Support service connections for cross-repo checkout

### API Reference

- `POST https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/threads`

---

## GitLab Reporter

**File:** `router/src/report/gitlab.ts` (missing)

### Requirements

- Use GitLab API for MR comments
- Create pipeline jobs for status
- Handle GitLab-specific auth (CI_JOB_TOKEN or PAT)

### API Reference

- `POST /projects/:id/merge_requests/:iid/notes`

---

## Gitea Reporter

**File:** `router/src/report/gitea.ts` (missing)

### Requirements

- Similar to GitHub API (Gitea is GitHub-compatible)
- Handle Gitea-specific auth

---

## ADO Pipeline Template

**File:** `templates/ado/ai-review-template.yml`  
**Current:** Stub only

### Requirements

- Azure Pipeline YAML template
- Variable groups for secrets
- Agent pool compatibility
- Service connection for checkout

---

## Webhook Trigger (repository_dispatch)

**File:** `.github/workflows/ai-review.yml`  
**Current:** Not implemented

### Requirements

- Add `repository_dispatch` event type for on-demand reviews
- Accept `client_payload` with PR number
- Document curl command for triggering

```yaml
on:
  repository_dispatch:
    types: [ai-review]
```

---

## Azure OpenAI API Version

**Files:** `pr_agent.ts`, `ai_semantic_review.ts`  
**Current:** Hardcoded `2024-02-15-preview`

### Requirements

- Make API version configurable via env var
- Update to latest stable version
- Document supported versions

---

## E2E Pilot Deployment

**Status:** Not yet tested on real repository

### Requirements

- Deploy to private test repository
- Open real PR with code changes
- Verify check run appears, summary posted, inline annotations work
- Document pilot checklist in `docs/github-setup.md`

---

## Priority Order

1. 🔴 Local LLM (enables offline/private use)
2. 🔴 E2E Pilot Deployment (validates production readiness)
3. 🟡 ADO Reporter (enterprise customers)
4. 🟡 Azure OpenAI API Version (stability)
5. 🟢 Webhook Trigger (on-demand reviews)
6. 🟢 GitLab Reporter
7. 🟢 Gitea Reporter
8. ⚪ ADO Pipeline Template
