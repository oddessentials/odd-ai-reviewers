# Phase 3 Implementation Plan

> **Created:** 2026-01-20
> **Status:** Planning
> **Priority Order:** Based on business value and technical dependencies

---

## Overview

This document provides detailed implementation specifications for remaining Phase 3 features. All Phase 1 and Phase 2 features are complete with 67+ passing tests.

---

## 1. Local LLM Agent (Ollama) — Priority: HIGH

**Impact:** Enables offline/private use, zero API costs, air-gapped environments
**Estimated Complexity:** Medium
**Dependencies:** None

### Current State

File: `router/src/agents/local_llm.ts`

- Stub implementation (42 lines)
- Returns empty findings
- Has `OLLAMA_BASE_URL` env var support (unused)

### Implementation Specification

```typescript
// router/src/agents/local_llm.ts

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}
```

### Tasks

1. **Implement Ollama HTTP client**

   - POST to `${OLLAMA_BASE_URL}/api/generate`
   - Handle connection errors gracefully
   - Support streaming and non-streaming modes

2. **Add model configuration**

   - Environment variable: `OLLAMA_MODEL` (default: `codellama:7b`)
   - Support models: `codellama:7b`, `codellama:13b`, `deepseek-coder:6.7b`

3. **Adapt prompts for local models**

   - Create `config/prompts/local_llm_review.md`
   - Shorter context windows (4K-8K tokens)
   - Simpler JSON output format

4. **Add health check**

   - Verify Ollama server is running before review
   - Clear error message if unavailable

5. **Add tests**
   - Mock Ollama API responses
   - Test error handling
   - Test token estimation

### Acceptance Criteria

- [ ] Agent connects to Ollama at `OLLAMA_BASE_URL`
- [ ] Supports `codellama:7b` and `deepseek-coder` models
- [ ] Returns structured findings in standard format
- [ ] Graceful degradation when Ollama unavailable
- [ ] 5+ unit tests passing

---

## 2. E2E Pilot Deployment — Priority: HIGH

**Impact:** Validates production readiness, builds confidence
**Estimated Complexity:** Low
**Dependencies:** GitHub repository with write access

### Implementation Specification

1. **Create test repository**

   - `oddessentials/ai-review-pilot` (private)
   - Add sample code with known issues

2. **Deploy workflow**

   - Add `templates/github/use-ai-review.yml` as `.github/workflows/ai-review.yml`
   - Configure secrets: `OPENAI_API_KEY`

3. **Test scenarios**

   - PR with security issue (Semgrep should catch)
   - PR with logic error (AI should catch)
   - Large PR (budget limits should trigger)
   - Fork PR (should be blocked)

4. **Document results**
   - Screenshots of check runs
   - Example PR comments
   - Cost breakdown

### Acceptance Criteria

- [ ] Real PR triggers AI review workflow
- [ ] Check run appears in GitHub UI
- [ ] Summary comment posted to PR
- [ ] Inline annotations on changed lines
- [ ] Documented in `docs/github-setup.md`

---

## 3. Webhook Trigger (repository_dispatch) — Priority: MEDIUM

**Impact:** Enables on-demand reviews, CI/CD integration
**Estimated Complexity:** Low
**Dependencies:** None

### Current State

File: `.github/workflows/ai-review.yml`

- Only supports `workflow_call`
- No `repository_dispatch` event

### Implementation Specification

```yaml
# Add to ai-review.yml
on:
  workflow_call:
    # ... existing inputs
  repository_dispatch:
    types: [ai-review]
```

### Tasks

1. **Add repository_dispatch trigger**

   - Event type: `ai-review`
   - Parse `client_payload` for PR number

2. **Update workflow logic**

   - Detect trigger source (workflow_call vs dispatch)
   - Extract inputs from appropriate source

3. **Document usage**
   - curl command example
   - GitHub Actions workflow trigger example

### Example Usage

```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{
    "event_type": "ai-review",
    "client_payload": {
      "pr_number": 123,
      "base_ref": "main"
    }
  }'
```

### Acceptance Criteria

- [ ] Workflow triggers on `repository_dispatch`
- [ ] PR number extracted from payload
- [ ] Review runs and posts results
- [ ] Documented with curl example

---

## 4. ADO Reporter — Priority: MEDIUM

**Impact:** Enterprise Azure DevOps customers
**Estimated Complexity:** High
**Dependencies:** Azure DevOps test environment

### Implementation Specification

File: `router/src/report/ado.ts`

```typescript
interface ADOReporter {
  postPRComment(
    org: string,
    project: string,
    repoId: string,
    prId: number,
    content: string
  ): Promise<void>;

  createPipelineStatus(
    org: string,
    project: string,
    buildId: number,
    status: 'succeeded' | 'failed' | 'warning'
  ): Promise<void>;
}
```

### Azure DevOps API Endpoints

```
POST https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/threads
  ?api-version=7.1-preview.1

POST https://dev.azure.com/{org}/{project}/_apis/build/builds/{buildId}/timeline
  ?api-version=7.1-preview.2
```

### Tasks

1. **Implement ADO HTTP client**

   - PAT-based authentication
   - Handle ADO-specific error codes

2. **Implement PR comment posting**

   - Create thread with findings
   - Support inline comments on files

3. **Implement pipeline status**

   - Update build timeline with review results
   - Map severity to ADO status

4. **Add provider detection**

   - Auto-detect ADO vs GitHub from environment
   - `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI` for ADO

5. **Update main.ts**
   - Add `--provider` flag
   - Route to appropriate reporter

### Acceptance Criteria

- [ ] Posts PR comments via ADO API
- [ ] Creates pipeline status
- [ ] Supports PAT authentication
- [ ] Auto-detects ADO environment
- [ ] 5+ unit tests passing

---

## 5. GitLab Reporter — Priority: LOW

**Impact:** GitLab users
**Estimated Complexity:** Medium
**Dependencies:** GitLab test environment

### Implementation Specification

File: `router/src/report/gitlab.ts`

### GitLab API Endpoints

```
POST /projects/:id/merge_requests/:iid/notes
POST /projects/:id/merge_requests/:iid/discussions
POST /projects/:id/statuses/:sha
```

### Tasks

1. **Implement GitLab HTTP client**

   - CI_JOB_TOKEN or PAT authentication
   - Handle GitLab API pagination

2. **Implement MR comment posting**

   - Create notes with findings
   - Support inline discussions

3. **Implement commit status**

   - Post status to pipeline

4. **Add provider detection**
   - Check for `GITLAB_CI` environment variable

### Acceptance Criteria

- [ ] Posts MR comments via GitLab API
- [ ] Creates commit status
- [ ] Supports CI_JOB_TOKEN auth
- [ ] Auto-detects GitLab CI environment
- [ ] 3+ unit tests passing

---

## 6. Gitea Reporter — Priority: LOW

**Impact:** Self-hosted Git users
**Estimated Complexity:** Low (GitHub-compatible API)
**Dependencies:** Gitea test environment

### Implementation Specification

File: `router/src/report/gitea.ts`

Gitea uses a GitHub-compatible API, so implementation can largely reuse GitHub reporter logic.

### Tasks

1. **Fork GitHub reporter**

   - Copy `report/github.ts` to `report/gitea.ts`
   - Update base URL handling

2. **Handle Gitea-specific differences**

   - Token format differences
   - API version differences

3. **Add provider detection**
   - Environment variable: `GITEA_TOKEN`

### Acceptance Criteria

- [ ] Posts PR comments via Gitea API
- [ ] Creates commit status
- [ ] Handles Gitea auth
- [ ] 2+ unit tests passing

---

## 7. ADO Pipeline Template — Priority: LOW

**Impact:** ADO users, enterprise adoption
**Estimated Complexity:** Medium
**Dependencies:** ADO Reporter (#4)

### Current State

File: `templates/ado/ai-review-template.yml`

- Stub only (54 lines)
- Placeholder steps

### Tasks

1. **Implement full template**

   - Checkout target repository
   - Install Node.js and dependencies
   - Run router with ADO reporter

2. **Add variable group support**

   - `AI_REVIEW_SECRETS` variable group
   - Map to environment variables

3. **Add agent pool options**

   - Support hosted and self-hosted agents
   - Pool parameter

4. **Document usage**
   - How to extend template
   - Secret configuration

### Acceptance Criteria

- [ ] Template runs on ADO
- [ ] Supports variable groups
- [ ] Supports multiple agent pools
- [ ] Documented in `docs/ado-setup.md`

---

## Implementation Order

```
Sprint 1: Local LLM + E2E Pilot
├── local_llm.ts implementation
├── E2E test deployment
└── Documentation updates

Sprint 2: Webhook + ADO Foundation
├── repository_dispatch trigger
├── ADO reporter foundation
└── Provider abstraction

Sprint 3: ADO + GitLab
├── ADO reporter completion
├── ADO pipeline template
├── GitLab reporter

Sprint 4: Gitea + Polish
├── Gitea reporter
├── Documentation polish
└── Performance optimization
```

---

## Testing Strategy

### Unit Tests (per feature)

| Feature         | Min Tests | Focus Areas                        |
| --------------- | --------- | ---------------------------------- |
| Local LLM       | 5         | API calls, error handling, parsing |
| Webhook         | 3         | Payload parsing, trigger detection |
| ADO Reporter    | 5         | API calls, auth, error handling    |
| GitLab Reporter | 3         | API calls, auth                    |
| Gitea Reporter  | 2         | API compatibility                  |

### Integration Tests

- Mock provider APIs
- Full flow from config to reporting
- Multi-provider scenarios

### E2E Tests

- Real PRs on test repositories
- Cost tracking verification
- Error recovery scenarios

---

## Risk Mitigation

| Risk                        | Impact | Mitigation                                 |
| --------------------------- | ------ | ------------------------------------------ |
| Ollama API changes          | Medium | Pin to stable version, abstract client     |
| ADO API breaking changes    | Medium | Use stable API versions, integration tests |
| Provider detection failures | Low    | Explicit `--provider` flag fallback        |
| Rate limiting               | Medium | Exponential backoff, caching               |

---

## Success Metrics

- [ ] All 7 Phase 3 features implemented
- [ ] 85%+ test coverage for new code
- [ ] Zero regressions in existing tests
- [ ] Documentation updated for all features
- [ ] E2E pilot successful on 2+ real repositories
