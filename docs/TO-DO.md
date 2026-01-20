# THESE FEATURES WILL COME IN A LATER PHASE

> Items below are **not critical** for current milestone. Prioritized for future sprints.

---

## Completed Features

### ✅ Local LLM Agent (Ollama) — Phase 3

**File:** `router/src/agents/local_llm.ts`  
**Status:** ✅ Complete (458 lines, 19 comprehensive tests)

**Implementation Details:**

- Full Ollama HTTP API integration (`POST /api/generate`)
- Input sanitization: secret redaction, 50 file limit, 2000 line limit, 8192 token limit
- Strict JSON parsing with fail-fast on invalid responses
- 120-second timeout using `AbortController`
- Deterministic settings: `temperature=0`, `seed=42`, alphabetical file ordering
- Graceful degradation: connection refused → empty findings (doesn't block CI)
- Default endpoint: `http://ollama-sidecar:11434` (OSCR sidecar networking)
- Supported models: `codellama:7b` (default), `deepseek-coder`, `llama3`

**Test Coverage:** 19 tests in `router/src/__tests__/local_llm.test.ts`

- Security: GitHub token redaction verification
- Input bounding: file/line/token limits
- JSON parsing: strict schema validation, mixed stdout rejection
- Error handling: timeout, connection refused, invalid responses
- All tests use mocked HTTP responses (no Docker required for CI)

**Optional Integration Testing (Manual):**

If you want to verify with real Ollama (not required for CI):

```powershell
# 1. Start Ollama container
docker run -d --name ollama-test -p 11434:11434 ollama/ollama

# 2. Pull a model
docker exec ollama-test ollama pull codellama:7b

# 3. Set environment variable
$env:OLLAMA_BASE_URL = "http://localhost:11434"
$env:OLLAMA_MODEL = "codellama:7b"

# 4. Run tests or create a test PR
# The agent will connect to your local Ollama instance
```

**Configuration:**

```yaml
# .ai-review.yml
passes:
  - name: local-ai
    enabled: true
    agents: [local_llm]

# Environment variables
OLLAMA_BASE_URL=http://ollama-sidecar:11434  # Default for OSCR
OLLAMA_MODEL=codellama:7b                     # Default model
```

---

## Future Features

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

1. ✅ **Local LLM** (completed in Phase 3 - enables offline/private use)
2. 🔴 E2E Pilot Deployment (validates production readiness)
3. 🟡 ADO Reporter (enterprise customers)
4. 🟡 Azure OpenAI API Version (stability)
5. 🟢 Webhook Trigger (on-demand reviews)
6. 🟢 GitLab Reporter
7. 🟢 Gitea Reporter
8. ⚪ ADO Pipeline Template
