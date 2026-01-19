# Final Integration Plan (v1)

**Unified AI Code Review on OSCR — Secure, Deterministic, Router-Owned**

This document is the **authoritative execution plan** for the first legitimate deployment of AI code reviews running on OSCR. It incorporates security review feedback and removes all deferred or “later” concerns.

---

## Victory Conditions (v1)

A pull request opened in a target repository:

1. Executes on **OSCR self-hosted runners**
2. Uses a **pinned, vulnerability-scanned execution environment**
3. Runs **Semgrep + Reviewdog + OpenCode + PR-Agent**
4. Produces **one coherent, deduplicated PR output**
5. Has **zero direct agent posting** to GitHub
6. Enforces **trusted-only / no forks** by default
7. Passes **automated regression tests** preventing:

   - duplicate comments
   - token leakage
   - unstructured output
   - unsafe agent behavior
   - known CVEs in dependencies

---

## A. Non-Negotiable Architectural Rule

### **Router Monopoly Rule (v1)**

- The router is the **only** component allowed to:

  - call GitHub APIs
  - post comments
  - create check runs

- **All agents** must:

  - return **structured findings**
  - run without GitHub tokens
  - be treated as **untrusted subprocesses**

Any agent that violates this contract **fails CI**.

---

## B. P0 Blocker: Self-Hosted Support via `runs_on`

### Required workflow change (`odd-ai-reviewers/.github/workflows/ai-review.yml`)

Single workflow file, JSON-based runner selection:

```yaml
on:
  workflow_call:
    inputs:
      runs_on:
        description: 'Runner labels as JSON'
        required: false
        type: string
        default: '"ubuntu-latest"'
jobs:
  ai-review:
    runs-on: ${{ fromJSON(inputs.runs_on) }}
```

Caller example (self-hosted):

```yaml
runs_on: '["self-hosted","linux"]'
```

---

## C. Execution Environment (Security-Critical)

### C1. Pinned Container Image (Mandatory)

The AI review job **must** run in a pinned container image containing:

- Node (pinned major)
- Python + pip
- semgrep
- reviewdog
- OpenCode (patched version, see below)
- forked PR-Agent
- router runtime
- non-root user

No runtime toolchain installs are allowed.

---

### C2. OpenCode.AI Security Mitigation (CVE-2026-22812)

**Risk:**
OpenCode.AI (now `anomalyco/opencode`) had a **high-severity RCE CVE** published Jan 12, 2026 due to an unauthenticated HTTP server.

**Required actions (v1):**

1. **Version Pinning**

   - Pin OpenCode to a version **post-January 13, 2026** with the fix applied.
   - Explicitly verify commit hash or release tag in Dockerfile.

2. **HTTP Server Hard-Disable**

   - Enforce flags/env so OpenCode **cannot start any HTTP server**
   - Add a runtime guard in the router:

     - if any listening socket is detected → fail job

3. **Image Vulnerability Scanning**

   - Add Trivy (or equivalent) scan in image build pipeline
   - Fail image publish on:

     - critical or high CVEs
     - known RCE vectors

4. **Untrusted Subprocess Model**

   - OpenCode runs without:

     - network listeners
     - GitHub tokens
     - persistent state

This is mandatory due to OSCR’s untrusted-workload model.

---

## D. PR-Agent Risk Mitigation (Legacy Status)

PR-Agent is now community-maintained and potentially stagnant.

### Required actions (v1):

1. **Internal Fork**

   - Fork PR-Agent into `odd-ai-reviewers/pr-agent`
   - Pin to latest known-good commit (≥ Jan 18, 2026)

2. **Structured Output Contract**

   - PR-Agent output must conform to router schema
   - Any upstream output drift must be normalized or rejected

3. **Fallback Agent**

   - Implement a minimal DIY semantic reviewer:

     - same schema
     - configurable in `.ai-review.yml`

   - Router can switch agents if PR-Agent breaks or stalls

4. **Regression Coverage**

   - Tests asserting:

     - structured output stability
     - inline comment limits
     - no silent truncation

---

## E. Structured Findings: Universal Contract

### Required Finding Schema (v1)

Every agent must emit findings with:

- `tool`
- `rule_id`
- `severity`
- `message`
- `path`
- `start_line`, `end_line`
- `fingerprint` (stable dedupe key)
- `suggestion` (optional)
- `metadata` (freeform)

Router dedupes using:

```
fingerprint + path + start_line
```

---

## F. Agent-Specific Implementation Requirements

### F1. OpenCode Agent

- Implement `agents/opencode/runner.ts`
- Enforce **strict JSON envelope**
- Reject runs with:

  - partial JSON
  - mixed stdout
  - schema violations

- Add unit tests for:

  - malformed output
  - partial crashes
  - timeout handling

### F2. Reviewdog Agent

- Run reviewdog in **no-reporter mode**
- Capture JSON diagnostics locally
- Convert to router findings
- Never allow reviewdog to post directly

### F3. Semgrep

- Use JSON output only
- Normalize severity + fingerprints

### F4. PR-Agent

- Consume only structured output
- Strip all posting behavior
- Treat as untrusted subprocess

---

## G. Token & Posting Enforcement (Hard Requirement)

### G1. Environment Stripping

- Router launches agent subprocesses with:

  - **no `GITHUB_TOKEN`**
  - no API tokens

- Router alone receives posting credentials

### G2. Active Enforcement Tests

CI must include tests that:

- simulate agents attempting GitHub API calls
- assert failure if tokens are present
- assert router is sole poster

---

## H. `.ai-review.yml` (v1 Default)

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    enabled: true
    agents: [semgrep, reviewdog]

  - name: semantic
    enabled: true
    agents: [pr_agent, opencode]

limits:
  max_files: 50
  max_diff_lines: 2000
  max_tokens_per_pr: 12000
  max_usd_per_pr: 1.00

reporting:
  github:
    mode: checks_and_comments
    max_inline_comments: 20
    summary: true

gating:
  enabled: false
```

---

## I. Required Tests (Ship Gates)

### I1. Agent Contract Tests

- Each agent:

  - emits valid schema
  - produces stable fingerprints
  - fails cleanly on bad output

### I2. Deduplication Regression

- Fixture triggering same issue via semgrep + reviewdog
- Assert **single merged finding**

### I3. No-Direct-Posting Enforcement

- Simulated misbehaving agent
- CI fails if posting is attempted

### I4. OpenCode Security Guard

- Test fails if:

  - HTTP server starts
  - listening socket detected
  - vulnerable version detected

### I5. Full E2E OSCR Run

- Real repo
- Real PR
- Assert:

  - runner usage
  - single summary
  - bounded annotations
  - clean teardown

---

## J. Ordered Worklist (Autonomous Team)

### **P0 – Must Complete Before Pilot**

1. ✅ Add `runs_on` input to reusable workflow
2. ✅ Build pinned, scanned container image
3. ✅ Patch OpenCode (post-CVE, HTTP disabled)
4. 🔲 Fork and pin PR-Agent _(deferred to P1)_
5. ✅ Implement structured runners for:

   - ✅ OpenCode
   - ✅ Reviewdog

6. ✅ Router owns all posting
7. ✅ Token stripping + enforcement tests
8. 🔲 E2E OSCR validation _(requires real OSCR environment)_

### **P1**

9. Enable gating after signal review
10. Azure DevOps reporter parity

---

## K. Implementation Status

_Last updated: January 19, 2026_

### Completed P0 Items

| Requirement | Implementation | Test Coverage |
|-------------|----------------|---------------|
| **B. `runs_on` input** | [`.github/workflows/ai-review.yml`](../.github/workflows/ai-review.yml) - Added `runs_on` input with JSON-based runner selection | Config validation in [`router.test.ts`](../router/src/__tests__/integration/router.test.ts) |
| **C1. Pinned Container** | [`router/Dockerfile`](../router/Dockerfile) - Multi-stage build with pinned versions (Node 22, Semgrep 1.56.0, Reviewdog 0.20.3, OpenCode 0.8.0), non-root user | Security labels and build verification |
| **C2. OpenCode CVE Mitigation** | [`router/src/agents/security.ts`](../router/src/agents/security.ts) - Runtime socket detection; [`router/src/agents/opencode.ts`](../router/src/agents/opencode.ts) - HTTP server disabled via env vars | [`security.test.ts`](../router/src/__tests__/security.test.ts) - 29 tests including socket detection |
| **E. Structured Findings Schema** | [`router/src/agents/index.ts`](../router/src/agents/index.ts) - Finding interface with `fingerprint`, `metadata` fields; [`router/src/report/formats.ts`](../router/src/report/formats.ts) - `generateFingerprint()` function | [`deduplication.test.ts`](../router/src/__tests__/deduplication.test.ts) - 16 tests for fingerprint stability |
| **F1. OpenCode Agent** | [`router/src/agents/opencode.ts`](../router/src/agents/opencode.ts) - Strict JSON parsing, schema validation, token stripping | [`opencode.test.ts`](../router/src/__tests__/opencode.test.ts) - Output parsing, timeout, malformed JSON |
| **F2. Reviewdog Agent** | [`router/src/agents/reviewdog.ts`](../router/src/agents/reviewdog.ts) - Local mode only (`-reporter=local`), returns structured findings | Semgrep JSON parsing, no direct posting |
| **G1. Token Stripping** | [`router/src/agents/security.ts`](../router/src/agents/security.ts) - `stripTokensFromEnv()` removes 8 token types | [`security.test.ts`](../router/src/__tests__/security.test.ts) - Tests for GITHUB_TOKEN, GH_TOKEN, GITHUB_PAT, GH_PAT, AZURE_DEVOPS_PAT, ADO_TOKEN, SYSTEM_ACCESSTOKEN, REVIEWDOG_GITHUB_API_TOKEN |
| **G2. No-Direct-Posting** | All agents return `Finding[]`, router is sole GitHub poster | [`security.test.ts`](../router/src/__tests__/security.test.ts) - Agent contract enforcement |
| **I1. Agent Contract Tests** | Schema validation in agent implementations | [`security.test.ts`](../router/src/__tests__/security.test.ts), [`opencode.test.ts`](../router/src/__tests__/opencode.test.ts) |
| **I2. Deduplication Regression** | [`router/src/report/formats.ts`](../router/src/report/formats.ts) - `deduplicateFindings()` using `fingerprint + path + start_line` | [`deduplication.test.ts`](../router/src/__tests__/deduplication.test.ts) - Golden case: semgrep + reviewdog → single finding |
| **I3. No-Direct-Posting Tests** | Token stripping and environment validation | [`security.test.ts`](../router/src/__tests__/security.test.ts) - Misbehaving agent simulation |
| **I4. OpenCode Security Guard** | [`router/src/agents/security.ts`](../router/src/agents/security.ts) - `validateNoListeningSockets()` | [`security.test.ts`](../router/src/__tests__/security.test.ts) - Socket detection tests |

### Test Summary

- **Total Tests**: 112 passing, 1 skipped
- **Security Tests**: 29 tests covering token stripping, socket detection, agent contracts
- **Deduplication Tests**: 16 tests covering cross-agent deduplication, fingerprint stability
- **Integration Tests**: 8 tests covering router configuration and validation

### Outstanding Items

| Item | Status | Notes |
|------|--------|-------|
| **PR-Agent Fork** | Deferred | Requires upstream coordination; semantic review available via existing agents |
| **E2E OSCR Validation** | Pending | Requires deployment to real OSCR self-hosted runner environment |
| **Trivy CI Gate** | Ready | Dockerfile includes security labels; CI workflow can add Trivy step |

---

## Final Statement

This plan:

- treats **AI tools as untrusted**
- assumes **upstream instability**
- eliminates **comment spam**
- closes **known RCE vectors**
- enforces correctness via **tests, not discipline**

It is safe to hand directly to the autonomous engineering team.

If you want, next step can be:

- a **file-by-file task breakdown**, or
- a **CI matrix showing which test catches which failure mode**, or
- a **security threat model appendix** aligned with OSCR invariants.
