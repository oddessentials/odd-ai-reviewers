<!--
SYNC IMPACT REPORT
==================
Version change: 0.0.0 → 1.0.0 (initial ratification)

Added sections:
- 8 Core Principles derived from INVARIANTS.md (33 invariants consolidated)
- Quality Gates section (mapped from INVARIANTS.md Appendix B)
- Verification Requirements section (victory gates for PR/release readiness)
- Governance section with amendment procedures

Templates requiring updates:
- ✅ .specify/templates/plan-template.md - Constitution Check section compatible
- ✅ .specify/templates/spec-template.md - No constitution-specific changes needed
- ✅ .specify/templates/tasks-template.md - Compatible with principle-driven tasks

Follow-up TODOs:
- None - all placeholders resolved

Source documents:
- docs/INVARIANTS.md (33 invariants → 8 principles)
- docs/ARCHITECTURE.md (execution flow)
- docs/security.md (trust model)
- docs/SCOPE.md (boundaries)
- NEXT_STEPS.md (documentation optimizations considered)
==================
-->

# odd-ai-reviewers Constitution

## Core Principles

### I. Router Owns All Posting (Architectural Monopoly)

The router is the sole component authorized to interact with provider APIs (GitHub/ADO) for posting PR comments, review threads, annotations, check runs, and status updates. Agents MUST NOT post directly under any circumstances. This ensures:

- Single point of control for all external communications
- Consistent rate limiting and error handling
- Audit trail for all posted content
- Prevention of agent-level secret exposure

**Rationale**: Centralized posting prevents credential leakage to agents, enables deduplication, and maintains deterministic output ordering.

### II. Structured Findings Contract

Every agent MUST return structured findings conforming to the canonical finding schema. Required fields:

- Tool identifier (agent name)
- Severity level
- Message content
- Location (path + line range where applicable)
- Stable fingerprint for deduplication

Free-form agent output is not first-class and MUST be normalized or rejected. Deduplication, sorting, prioritization, and output formatting MUST happen centrally in the router.

**Rationale**: Structured output enables reliable deduplication, consistent reporting, and cross-agent finding comparison.

### III. Provider-Neutral Core

Core review logic (routing, finding schema, dedupe, budgets, policies) MUST remain provider-agnostic. Provider-specific integrations (GitHub reporter, ADO reporter) MUST be isolated behind explicit interfaces/modules. Adding provider support MUST NOT compromise core invariants.

**Rationale**: Platform independence ensures portability and prevents vendor lock-in while maintaining consistent behavior across providers.

### IV. Security-First Design

All inputs (PR code, diffs, repo contents, filenames) MUST be treated as hostile and untrusted:

- Provider tokens MUST NOT be accessible to agent subprocesses
- Secrets MUST only flow through provider-native injection mechanisms
- Fork PR execution MUST be blocked by default
- Agent executions MUST NOT start HTTP servers or open inbound listeners
- Release artifacts MUST be scanned for vulnerabilities (high/critical blocks release)
- High-risk dependencies MUST be pinned and verified

**Rationale**: The untrusted input model protects against malicious code in PRs attempting to steal secrets, exfiltrate code, or manipulate review results.

### V. Deterministic Outputs

For identical inputs (diff + config + model version), outputs MUST be stable as practicable:

- Stable fingerprints for finding identity
- Stable ordering of findings (severity-based)
- Bounded and consistent truncation behavior
- Canonicalized formatting rules

Any non-determinism MUST be explicitly mitigated. Operators MUST NOT be surprised by output variations.

**Rationale**: Predictable outputs enable testing, debugging, and operator confidence in review results.

### VI. Bounded Resources

All operations MUST enforce hard limits:

- Max inline comments per PR
- Max annotations per check
- Max summary size
- Max tokens per PR
- Max USD per PR and monthly
- Max files and diff lines

When limits are exceeded, behavior MUST be explicit (skip, downgrade model, or reduce scope). Ephemeral workspace assumption applies—no reliance on persistent state between runs.

**Rationale**: Resource bounds prevent runaway costs, DoS via expensive PRs, and ensure predictable CI execution times.

### VII. Environment Discipline

CI execution MUST use pinned, reproducible environments with toolchains preinstalled. Runtime "curl | bash" installers and toolchain bootstrapping are forbidden for production. The system MUST remain compatible with OSCR constraints:

- Linux-only execution
- Non-root runtime
- Ephemeral workspaces
- Provider-native secret injection
- No fork PRs by default

**Rationale**: Pinned environments ensure reproducibility and prevent supply chain attacks through dynamic toolchain installation.

### VIII. Explicit Non-Goals (Scope Boundaries)

odd-ai-reviewers MUST NOT:

- Become a CI runner or orchestrator (runs within CI only)
- Store or manage secrets outside provider mechanisms
- Require long-running servers or daemons for core operation
- Replace CI providers (GitHub Actions, Azure Pipelines)
- Bypass fork PR restrictions without explicit opt-in
- Orchestrate runners (that's OSCR's responsibility)

**Rationale**: Clear scope boundaries prevent feature creep and maintain focus on the core AI review mission.

## Quality Gates

> Mapped from INVARIANTS.md Appendix B — enforced both locally and in CI

### Zero-Tolerance Lint Policy

- ESLint MUST run with `--max-warnings 0` in CI and pre-commit hooks
- Any lint warning (including security rules) MUST fail the pipeline
- Local enforcement via `lint-staged` MUST match CI exactly

### Security Linting

ESLint security plugin MUST be enabled with high-value rules:

- `detect-child-process`
- `detect-eval-with-expression`
- `detect-buffer-noassert`
- `detect-disable-mustache-escape`
- `detect-no-csrf-before-method-override`

Disabled for false positive reduction: `detect-object-injection`

### Dependency Architecture

- `dependency-cruiser` MUST check for circular dependencies on every push
- Circular dependencies in barrel files (index.ts) are allowed as warnings
- New circular dependencies in non-barrel files MUST be resolved before merge

### Local = CI Parity

- Pre-commit hook MUST run: `lint-staged` (format + strict lint) + `typecheck`
- Pre-push hook MUST run: `depcruise` (circular dependency check)
- Code that would fail CI MUST NOT be pushable

## Verification Requirements

> Victory gates for determining PR and release readiness

### PR Merge Criteria

A pull request MUST satisfy all of the following before merge:

1. **All CI checks pass** — lint, typecheck, tests, depcruise
2. **Invariant tests pass** — router posting monopoly, no tokens in agent env, schema validity
3. **No high/critical vulnerabilities** — security scanning gates enforced
4. **Output bounds respected** — findings count within configured limits
5. **Documentation current** — if feature changes behavior, docs updated

### Release Criteria

A release artifact MUST satisfy all of the following before publish:

1. **All PR merge criteria satisfied** — cumulative across all included PRs
2. **Vulnerability scan clean** — Trivy or equivalent, no unwaived high/critical
3. **Pinned dependencies** — no floating versions in production artifacts
4. **Contract tests pass** — schema stability verified
5. **Dedupe regression tests pass** — fingerprint stability verified

### Invariant Change Criteria

Any modification to these principles requires:

1. **Explicit architectural review** — documented decision with rationale
2. **Threat model impact assessment** — security implications analyzed
3. **Test updates** — proving new behavior is safe
4. **Migration plan** — for any breaking changes to existing behavior

## Governance

### Amendment Procedure

1. **Proposal**: Document proposed change with rationale and impact analysis
2. **Review**: Architectural review by maintainers
3. **Testing**: Update tests to enforce new/modified principles
4. **Documentation**: Update this constitution and propagate to dependent templates
5. **Version**: Increment version per semantic versioning rules below

### Versioning Policy

Constitution versions follow semantic versioning:

- **MAJOR**: Backward incompatible governance/principle removals or redefinitions
- **MINOR**: New principle/section added or materially expanded guidance
- **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements

### Compliance Review

- All PRs MUST be verified against active principles
- Complexity MUST be justified against simplicity preferences
- Violations MUST be escalated to architectural review before merge

### Runtime Guidance

For development guidance, see:

- `docs/INVARIANTS.md` — Detailed invariant specifications
- `docs/ARCHITECTURE.md` — Execution flow and component relationships
- `docs/security.md` — Trust model and threat mitigation
- `docs/SCOPE.md` — Project boundaries

**Version**: 1.0.0 | **Ratified**: 2026-01-18 | **Last Amended**: 2026-01-27
