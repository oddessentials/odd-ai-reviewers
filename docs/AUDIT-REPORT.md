# Audit Report: Code vs Documentation Alignment

> **Audit Date:** 2026-01-20
> **Auditor:** Claude Code
> **Scope:** Full comparison of `/docs`, `/planning` against actual implementation

---

## Executive Summary

This audit compares all documented features against actual implementation. The project is in **strong alignment** with documented Phase 1 and Phase 2 features. Phase 3 items remain as documented stubs/TODO items.

| Phase   | Status                 | Tests         |
| ------- | ---------------------- | ------------- |
| Phase 1 | **Complete**           | -             |
| Phase 2 | **Complete**           | 67/68 passing |
| Phase 3 | **Documented as TODO** | -             |

**Key Findings:**

- All Phase 1 and Phase 2 features are implemented and tested
- 8 test files with 67 passing tests (exceeds documented 47)
- Minor schema inconsistency: `ai_semantic_review` agent not in JSON schema
- Phase 3 items correctly documented as stubs/TODO
- Self-hosted runner support needs workflow input parameter

---

## Detailed Audit

### 1. Core Components

| Component            | Documentation | Implementation         | Status          |
| -------------------- | ------------- | ---------------------- | --------------- |
| Config loading (Zod) | `config.ts`   | `router/src/config.ts` | **Implemented** |
| Trust validation     | `trust.ts`    | `router/src/trust.ts`  | **Implemented** |
| Budget enforcement   | `budget.ts`   | `router/src/budget.ts` | **Implemented** |
| Diff extraction      | `diff.ts`     | `router/src/diff.ts`   | **Implemented** |
| CLI entry point      | `main.ts`     | `router/src/main.ts`   | **Implemented** |

### 2. Agents

| Agent              | Documentation  | Implementation                            | Status          |
| ------------------ | -------------- | ----------------------------------------- | --------------- |
| Semgrep            | Phase 1        | `router/src/agents/semgrep.ts`            | **Implemented** |
| OpenCode.ai        | Phase 1        | `router/src/agents/opencode.ts`           | **Implemented** |
| PR-Agent           | Phase 2        | `router/src/agents/pr_agent.ts`           | **Implemented** |
| Reviewdog          | Phase 2        | `router/src/agents/reviewdog.ts`          | **Implemented** |
| AI Semantic Review | Not documented | `router/src/agents/ai_semantic_review.ts` | **Bonus**       |
| Local LLM          | Phase 3 (TODO) | `router/src/agents/local_llm.ts`          | **Stub only**   |

### 3. Reporting

| Feature               | Documentation  | Implementation                 | Status            |
| --------------------- | -------------- | ------------------------------ | ----------------- |
| GitHub PR comments    | Phase 1        | `router/src/report/github.ts`  | **Implemented**   |
| GitHub check runs     | Phase 1        | `router/src/report/github.ts`  | **Implemented**   |
| Finding deduplication | Phase 2        | `router/src/report/formats.ts` | **Implemented**   |
| Comment throttling    | Phase 2        | `router/src/report/github.ts`  | **Implemented**   |
| ADO Reporter          | Phase 3 (TODO) | Not implemented                | **As documented** |
| GitLab Reporter       | Phase 3 (TODO) | Not implemented                | **As documented** |
| Gitea Reporter        | Phase 3 (TODO) | Not implemented                | **As documented** |

### 4. Caching

| Feature              | Documentation | Implementation              | Status          |
| -------------------- | ------------- | --------------------------- | --------------- |
| Cache key generation | Phase 2       | `router/src/cache/key.ts`   | **Implemented** |
| File-based cache     | Phase 2       | `router/src/cache/store.ts` | **Implemented** |
| GitHub Actions cache | Phase 2       | `router/src/cache/store.ts` | **Implemented** |
| TTL expiration       | Phase 2       | `router/src/cache/store.ts` | **Implemented** |

### 5. Workflows

| Workflow                 | Documentation   | Implementation                             | Status            |
| ------------------------ | --------------- | ------------------------------------------ | ----------------- |
| Reusable workflow        | Phase 1         | `.github/workflows/ai-review.yml`          | **Implemented**   |
| Manual dispatch          | Phase 1         | `.github/workflows/ai-review-dispatch.yml` | **Implemented**   |
| Self-hosted runner input | CONSOLIDATED.md | Missing `runs_on` input                    | **Gap**           |
| Webhook trigger          | Phase 3 (TODO)  | Not implemented                            | **As documented** |
| ADO Pipeline template    | Phase 3 (TODO)  | `templates/ado/ai-review-template.yml`     | **Stub only**     |

### 6. Configuration & Schema

| Feature          | Documentation | Implementation                  | Status          |
| ---------------- | ------------- | ------------------------------- | --------------- |
| JSON Schema      | Phase 1       | `config/ai-review.schema.json`  | **Implemented** |
| Default config   | Phase 1       | `config/defaults.ai-review.yml` | **Implemented** |
| Prompt templates | Phase 1       | `config/prompts/*.md`           | **Implemented** |

### 7. Testing

| Test File                    | Tests         | Status                    |
| ---------------------------- | ------------- | ------------------------- |
| `config.test.ts`             | 8             | Passing                   |
| `trust.test.ts`              | 7             | Passing                   |
| `budget.test.ts`             | 12            | Passing                   |
| `diff.test.ts`               | 8             | Passing                   |
| `cache.test.ts`              | 12            | Passing                   |
| `reviewdog.test.ts`          | 3 (1 skipped) | Passing                   |
| `pr_agent_retry.test.ts`     | 10            | Passing                   |
| `integration/router.test.ts` | 8             | Passing                   |
| **Total**                    | **68**        | **67 passing, 1 skipped** |

> **Note:** Documentation claims 47 tests for Phase 2. Actual: 67 passing tests (exceeds target).

---

## Gaps Identified

### Critical Gaps (None)

No critical gaps found. All claimed Phase 1 and Phase 2 features are implemented.

### Minor Gaps

| Gap                                 | Impact                                                     | Resolution          |
| ----------------------------------- | ---------------------------------------------------------- | ------------------- |
| Schema missing `ai_semantic_review` | Agent works but schema validation won't allow it in config | Add to schema       |
| Azure OpenAI API version hardcoded  | Works with `2024-02-15-preview` but not configurable       | Make configurable   |
| No `runs_on` workflow input         | Self-hosted runners require forked workflow                | Add input parameter |

### Phase 3 Items (As Documented)

These are correctly documented as TODO and not yet implemented:

1. **Local LLM Agent** (Ollama integration)
2. **ADO Reporter** (Azure DevOps PR comments)
3. **GitLab Reporter**
4. **Gitea Reporter**
5. **Webhook Trigger** (repository_dispatch)
6. **E2E Pilot Deployment** (production testing)
7. **ADO Pipeline Template** (full implementation)

---

## Test Coverage Analysis

```
Tests by Module:
├── config.ts      → 8 tests (validation, defaults, merging)
├── trust.ts       → 7 tests (fork detection, draft PRs, trusted authors)
├── budget.ts      → 12 tests (all limit types, cost estimation)
├── diff.ts        → 8 tests (parsing, filtering, truncation)
├── cache/         → 12 tests (store, retrieve, expire, invalidate)
├── pr_agent.ts    → 10 tests (retry logic, rate limits, backoff)
├── reviewdog.ts   → 3 tests (semgrep piping, error handling)
└── integration/   → 8 tests (full flow, mocked APIs)
```

---

## Recommendations

### Immediate Actions (Minor Fixes)

1. **Add `ai_semantic_review` to JSON schema** - Aligns schema with actual agents
2. **Make Azure OpenAI API version configurable** - Add `AZURE_OPENAI_API_VERSION` env var

### Short-term (Next Sprint)

3. **Add `runs_on` input to reusable workflow** - Enables self-hosted runners without forking
4. **Update spec.md test count** - Document actual 67+ tests

### Phase 3 Implementation (As Planned)

Proceed with Phase 3 items in documented priority order:

1. Local LLM (Ollama)
2. E2E Pilot Deployment
3. ADO Reporter
4. Webhook Trigger
5. GitLab/Gitea Reporters

---

## Conclusion

The codebase is **well-aligned** with documentation. All Phase 1 and Phase 2 features are implemented and tested. The few minor gaps identified are easily addressable. Phase 3 items are correctly documented as future work.

**Overall Assessment: PASS**
