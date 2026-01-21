# Scope & Boundaries

This document defines what odd-ai-reviewers **is** and **is not**, preventing scope creep and aligning expectations.

---

## What odd-ai-reviewers Does

- ✅ Executes AI-assisted review agents **inside CI jobs**
- ✅ Posts results back to PRs via **provider-native APIs** (GitHub, Azure DevOps)
- ✅ Respects provider security boundaries and permissions
- ✅ Enforces cost/budget limits per PR and per month
- ✅ Deduplicates and consolidates findings from multiple agents
- ✅ Runs on cloud-hosted or self-hosted runners without modification

---

## What odd-ai-reviewers Does NOT Do

- ❌ **Does not replace CI providers** — runs _inside_ GitHub Actions / Azure Pipelines
- ❌ **Does not manage secrets** — uses provider-native secret injection only
- ❌ **Does not run outside CI execution** — no standalone daemon or server mode
- ❌ **Does not bypass fork PR restrictions** — untrusted PRs blocked by default
- ❌ **Does not store state between runs** — ephemeral workspace assumption
- ❌ **Does not orchestrate runners** — that's OSCR's job

---

## Relationship to OSCR

[OSCR (Odd Self-Hosted CI Runtime)](https://github.com/oddessentials/odd-self-hosted-ci-runtime) is a **separate project** that provides self-hosted runner infrastructure.

| Responsibility        | odd-ai-reviewers | OSCR |
| --------------------- | ---------------- | ---- |
| AI review agents      | ✅               | ❌   |
| Finding consolidation | ✅               | ❌   |
| PR commenting         | ✅               | ❌   |
| Runner containers     | ❌               | ✅   |
| Ollama sidecar        | ❌               | ✅   |
| Docker orchestration  | ❌               | ✅   |

**Key insight:** odd-ai-reviewers runs _inside_ OSCR runner containers. It does not manage OSCR.

---

## Relationship to CI Providers

| Provider         | Status      | Reporter           | Pipeline Template                 |
| ---------------- | ----------- | ------------------ | --------------------------------- |
| **GitHub**       | ✅ Complete | `report/github.ts` | `.github/workflows/ai-review.yml` |
| **Azure DevOps** | 🔴 Roadmap  | Not implemented    | Stub only                         |
| **GitLab**       | ⚪ Future   | Not planned        | —                                 |
| **Gitea**        | ⚪ Future   | Not planned        | —                                 |

See [ROADMAP.md](./ROADMAP.md) for Azure DevOps implementation details.

---

## Related Documentation

- [INVARIANTS.md](./INVARIANTS.md) — Non-negotiable design constraints
- [SECURITY.md](./SECURITY.md) — Security model and trust boundaries
- [OSCR-INTEGRATION.md](./OSCR-INTEGRATION.md) — Self-hosted CI integration
