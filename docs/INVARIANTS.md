# INVARIANTS.md — odd-ai-reviewers

This document defines **non-negotiable invariants** governing the design, implementation, and operation of **odd-ai-reviewers** (the AI code review swarm + router + reporters).

Any change that violates an invariant **must not be merged** without explicit architectural review.

---

## 0. Purpose and Scope

odd-ai-reviewers provides **AI-assisted pull request review** that runs inside CI (GitHub / Azure DevOps) and produces consistent, auditable review outputs (checks + comments) while treating all code under review as **untrusted**.

odd-ai-reviewers is designed to run on cloud-hosted runners or **OSCR self-hosted runners** without special casing. It must align with OSCR’s security posture (untrusted workloads, provider-native secrets, non-root, ephemeral workspaces, no fork PRs by default).

---

## 1. Architectural Invariants

1. **Router Owns Posting**
   - The router is the **only** component allowed to call provider APIs (GitHub/ADO) to post:
     - PR comments
     - review threads / annotations
     - check runs
     - status updates
   - Agents MUST NOT post directly under any circumstances.

2. **Agents Return Structured Findings**
   - Every agent MUST return **structured findings** that conform to the canonical finding schema.
   - “Free-form” agent output is not a first-class output and MUST NOT be used for reporting without normalization.

3. **Single Source of Truth for Deduplication and Ordering**
   - Deduplication, sorting, prioritization, and output formatting MUST happen centrally in the router.
   - No agent may independently decide how many comments to post or which ones to suppress.

4. **Provider-Neutral Core**
   - Core review logic (routing, finding schema, dedupe, budgets, policies) MUST remain provider-agnostic.
   - Provider-specific integrations (GitHub reporter, ADO reporter) MUST be isolated behind explicit interfaces/modules.

5. **Deterministic Outputs**
   - For the same inputs (diff + config + model version), outputs MUST be stable as practicable:
     - stable fingerprints
     - stable ordering of findings
     - bounded/consistent truncation behavior
   - Any non-determinism MUST be explicitly mitigated via canonicalization rules.

---

## 2. Security Invariants

6. **Untrusted Input Model**
   - PR code, diffs, repo contents, and filenames MUST be treated as **hostile**.
   - Never execute repo-provided code unless explicitly required and sandboxed.

7. **No Direct Secrets to Agents**
   - Provider tokens (e.g., `GITHUB_TOKEN`), PATs, and any posting credentials MUST NOT be accessible to agent subprocesses.
   - Router MUST strip tokens from subprocess environments and enforce this with tests.

8. **Provider-Native Secret Injection Only**
   - Secrets MUST be provided only through GitHub/ADO secret mechanisms.
   - odd-ai-reviewers MUST NOT invent its own secret distribution or storage mechanism.

9. **No Fork PR Execution by Default**
   - odd-ai-reviewers MUST default to blocking forks / untrusted PR sources.
   - Any allowlisting (e.g., trusted authors) MUST be explicit, documented, and off by default.

10. **No Network Listeners in Agent Execution**

- Agent executions MUST NOT start HTTP servers or open inbound listeners.
- If any agent/tool includes an optional server mode, it MUST be disabled by default and guarded at runtime.

11. **Dependency Vulnerability Hygiene**

- Release artifacts (images, packages) MUST be produced from pinned dependencies and scanned for known vulnerabilities.
- High/critical vulnerabilities in shipped artifacts MUST fail the release pipeline (unless explicitly waived with documented risk acceptance).

12. **Pin and Verify High-Risk Dependencies**

- Dependencies with security history or elevated risk (e.g., tools that can execute commands, accept network input, or spawn services) MUST be pinned to known-good versions and verified during build.

---

## 3. Operational Invariants

13. **Pinned Execution Environment**

- CI execution MUST use a pinned, reproducible environment (preferably a container image) with toolchains preinstalled.
- Runtime “curl | bash” installers and toolchain bootstrapping are forbidden for production usage.

14. **Ephemeral Workspace Assumption**

- The system MUST assume an ephemeral workspace: no reliance on persistent state between runs.
- Any caching MUST be explicitly optional and safe (keyed, bounded, non-sensitive).

15. **Bounded Output**

- All reporting MUST enforce hard caps:
  - max inline comments
  - max annotations
  - max summary size
- Excess findings MUST be summarized deterministically (e.g., “top N + remainder count”).

16. **Budgets Are Enforced**

- Token and cost budgets MUST be enforced centrally and deterministically:
  - max tokens per PR
  - max USD per PR
  - max files / diff lines
- When budgets are exceeded, behavior MUST be explicit (skip, downgrade model, or reduce scope).

---

## 4. Compatibility Invariants

17. **OSCR Compatibility**

- odd-ai-reviewers MUST remain compatible with OSCR’s constraints:
  - Linux-only execution
  - non-root runtime
  - ephemeral workspaces
  - provider-native secret injection
  - no fork PRs by default

18. **Minimal Workflow Diff**

- Integrating odd-ai-reviewers into a repo SHOULD require minimal CI YAML changes.
- For reusable workflows, runner selection MUST be configurable (e.g., `runs_on`) without branching workflow logic.

19. **Provider Parity Roadmap Discipline**

- Adding provider support (GitHub, ADO) MUST not compromise core invariants.
- Provider features must be integrated without breaking router monopoly, structured output, or security posture.

---

## 5. Data and Schema Invariants

20. **Canonical Finding Schema**

- The finding schema is a contract. Fields used for dedupe and reporting MUST be stable.
- Each finding MUST include:
  - tool identifier
  - severity
  - message
  - location (path + line range where applicable)
  - stable fingerprint

21. **Stable Fingerprints**

- Fingerprints MUST be reproducible and collision-resistant enough for deduplication.
- Fingerprint generation MUST be centralized or follow a single canonical algorithm.

22. **Normalization Before Reporting**

- No unstructured strings may reach reporter modules.
- If an agent emits unstructured output, it MUST be either:
  - rejected as a failed run, or
  - normalized into the canonical schema with explicit “confidence/quality” flags.

---

## 6. Testing and Governance Invariants

23. **Tests Enforce the Invariants**

- The repo MUST include automated tests that enforce:
  - “router owns posting” (no agent posting)
  - “no tokens in agent env”
  - schema validity and stability
  - dedupe correctness
  - output bounds
  - security guards (no listeners, no unsafe modes)

24. **CI Gates Are Mandatory**

- CI MUST block merges when invariant tests fail.
- Release pipelines MUST block publishing when vulnerability scans fail (unless waived via documented exception process).

25. **Boring Is a Feature**

- Prefer predictable, auditable mechanisms over cleverness:
  - explicit configs
  - pinned versions
  - deterministic formatting
  - clear logs
- Any behavior that surprises operators is a defect.

---

## 7. Explicit Non-Goals

26. **Not a CI Runner**

- odd-ai-reviewers MUST NOT become a CI runner or orchestrator. It runs _within_ CI.

27. **No Secret Management Product**

- odd-ai-reviewers MUST NOT store or manage secrets outside provider mechanisms.

28. **No Background Daemons**

- odd-ai-reviewers MUST NOT require a long-running server for v1 operation.
- If future webhook services exist, they must remain optional and must not violate “no listeners in agent execution” for CI runs.

---

## 8. Change Control

29. **Invariant Changes Require Architectural Review**

- Any modification to these invariants requires an explicit review decision and must include:
  - rationale
  - threat model impact
  - test updates proving the new behavior is safe

---

## Appendix A — Practical Enforcement Hooks (Recommended)

- Router strips posting tokens from subprocess envs and asserts absence.
- Subprocess execution wrapper can enforce:
  - no `--serve`/server flags
  - no open ports
  - deterministic timeouts
- CI includes:
  - schema contract tests per agent
  - “misbehaving agent” simulation tests
  - dedupe regression fixtures
  - image scanning gate (Trivy) prior to publish

## Appendix B — Quality Gates (Zero-Tolerance Enforcement)

> **Flight 2 Addition**: All quality gates are enforced both locally and in CI.

30. **Zero-Tolerance Lint Policy**

- ESLint runs with `--max-warnings 0` in CI and pre-commit hooks.
- Any lint warning (including security rules) fails the pipeline.
- Local enforcement via `lint-staged` matches CI exactly.

31. **Security Linting**

- `eslint-plugin-security` enabled with high-value rules:
  - `detect-child-process`, `detect-eval-with-expression`, `detect-buffer-noassert`
  - `detect-disable-mustache-escape`, `detect-no-csrf-before-method-override`
- Disabled rules that cause excessive false positives: `detect-object-injection`

32. **Dependency Architecture**

- `dependency-cruiser` checks for circular dependencies on every push.
- Circular dependencies in barrel files (index.ts) are allowed as warnings.
- New circular dependencies in non-barrel files MUST be resolved.

33. **Local = CI Parity**

- Pre-commit hook runs: `lint-staged` (format + strict lint) + `typecheck`
- Pre-push hook runs: `depcruise` (circular dependency check)
- Developers cannot push code that would fail CI.

---
