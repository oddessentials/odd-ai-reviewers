# Feature Specification: Dogfood-Driven Quality Release (v1.12.0)

## Overview

A comprehensive quality release addressing all issues discovered during dogfood testing of the CLI tool, covering 5 open GitHub issues (#171-#175), 5 new issues found during live CLI testing, plus documentation gaps and developer experience improvements. This release ships with zero deferrals.

**Branch**: `417-dogfood-quality-release`
**Spec Number**: 417
**GitHub Issues**: #171, #172, #173, #174, #175
**Constitution Version**: 1.0.0

---

## Problem Statement

During dogfood testing (running odd-ai-reviewers against its own codebase), critical usability failures were discovered that prevent users from running the tool in common scenarios. The `--pass` and `--agent` CLI flags are accepted but completely non-functional — they are parsed, stored, and silently ignored. Documentation has drifted significantly from the actual application state, with missing command references, incomplete configuration guides, and 40+ environment variables scattered across 5 separate documents. Two suppressor bugs cause security findings to be incorrectly silenced, and architectural debt in the finding validation pipeline creates maintenance risk.

### User Impact

1. **Blocked workflows**: Users cannot run `--pass cloud-ai` when semgrep is unavailable, even though cloud-ai agents don't use semgrep
2. **Misleading output**: `--dry-run` shows all agents regardless of `--pass` selection
3. **Silent failures**: Invalid `--pass` or `--agent` values produce no error
4. **Security gaps**: Real XSS vulnerabilities can be incorrectly suppressed; security-related cautionary advice is silently dropped
5. **Onboarding friction**: Users cannot discover valid agent IDs, pass names, Ollama tuning variables, or benchmark commands from documentation alone
6. **Developer friction**: Pre-push hooks run full test suite with no early exit on failure

---

## User Scenarios & Testing

### Scenario 1: Selective Pass Execution (Phase 1)

**Actor**: Developer with partial tool installation (has API keys but not semgrep)

**Flow**:

1. Developer runs `ai-review local . --pass cloud-ai`
2. System validates that "cloud-ai" exists in the configuration
3. System checks dependencies ONLY for the cloud-ai pass
4. Since cloud-ai agents don't require semgrep, the review runs successfully
5. Only cloud-ai agents (opencode, pr_agent) execute; static agents are skipped

**Acceptance Criteria**:

- Dependency check is scoped to the selected pass only
- Unknown pass names produce a clear error listing available passes
- `--dry-run` shows only agents from the selected pass
- `--cost-only` estimates cost for the selected pass only

### Scenario 2: Selective Agent Execution (Phase 1)

**Actor**: Developer wanting to run only the built-in vulnerability scanner

**Flow**:

1. Developer runs `ai-review local . --agent control_flow`
2. System validates "control_flow" against known agent IDs
3. System identifies which passes contain the control_flow agent
4. Only the control_flow agent runs; other agents in matching passes are skipped
5. Invalid agent IDs produce a clear error listing valid IDs

**Acceptance Criteria**:

- Agent filtering works independently of pass filtering
- When both `--pass` and `--agent` are specified, `--pass` narrows first, then `--agent` filters within
- Agents not in any configured pass produce a clear "not configured" error

### Scenario 3: New User Onboarding (Phase 2)

**Actor**: First-time user setting up odd-ai-reviewers

**Flow**:

1. User reads README and finds installation instructions
2. User runs `ai-review config init` for guided setup
3. User checks `ai-review check` to verify dependencies
4. User consults CLI reference for available commands including benchmark
5. User finds comprehensive environment variable reference for their provider
6. User discovers valid agent IDs and pass names from documentation

**Acceptance Criteria**:

- All CLI commands are documented with options, examples, and exit codes
- Agent ID reference table is available in CLI docs
- Pass name discovery is explained (user-defined in .ai-review.yml)
- Environment variables for all providers are documented in a single reference
- Configuration examples match the actual schema

### Scenario 4: Security Finding Accuracy (Phase 3)

**Actor**: Security reviewer evaluating XSS findings

**Flow**:

1. Code review contains `catch(err) { const html = '<p>' + err.message + '</p>'; res.send(html); }`
2. The error-object-xss matcher correctly identifies this as a real XSS risk
3. The finding is NOT suppressed because HTML composition in a variable is detected
4. A separate finding mentioning "Ensure inputs are sanitized" is NOT dropped as cautionary advice because "sanitized" correctly triggers the security blocklist

**Acceptance Criteria**:

- Variable-backed HTML detection works for template literals and string concatenation
- Plain-text `res.send(msg)` (no HTML) is still correctly suppressed
- All 6 prefix security terms match their inflected forms (sanitize, escaped, authentication, authorization, deserialization, vulnerability, etc.)

### Scenario 5: Matcher Maintainability (Phase 3)

**Actor**: Developer adding or modifying a framework convention matcher

**Flow**:

1. Developer opens framework-pattern-filter.ts to modify a matcher
2. Shared helpers reduce boilerplate: `extractNearbyContext()` replaces 4-line pattern in 8 matchers
3. `boundedVarPattern()` eliminates 13 inline `new RegExp` constructions
4. Response sink constant replaces 4 duplicate regex patterns

**Acceptance Criteria**:

- Helper extraction is a pure refactor with zero behavioral change
- Existing test suite passes without modification
- Code reduction of approximately 50-60 lines

### Scenario 6: Resilient Review Pipeline (Phase 4)

**Actor**: CI pipeline running a 3-pass review where one agent crashes

**Flow**:

1. Pass 1 (semgrep) completes successfully with 15 findings
2. Pass 2 (control_flow) completes successfully with 3 findings
3. Pass 3 (ai_semantic_review) crashes due to API timeout
4. Instead of discarding all 18 findings, the system reports them as partial results
5. The check run is marked as "neutral" (not "failure") with a clear "incomplete" indicator
6. Partial findings are NOT used for gating decisions

**Acceptance Criteria**:

- Previously-completed agent findings survive a subsequent agent crash
- Partial results are clearly labeled as incomplete
- Gating only uses complete findings (no change to existing FR-008 behavior)

### Scenario 7: User-Configurable Suppressions (Phase 4)

**Actor**: Project maintainer wanting to suppress project-specific false positives

**Flow**:

1. Maintainer adds a `suppressions:` section to `.ai-review.yml`
2. Rules specify which findings to suppress (by rule ID, message pattern, file glob, or severity)
3. Each rule includes a mandatory `reason` field for auditability
4. Suppressions are logged for transparency
5. Maintainer can also disable specific built-in matchers via `disable_matchers`

**Acceptance Criteria**:

- Suppressions require at least one of rule/message/file (not just severity, which would be too broad)
- All suppressions are logged with rule details
- Disabling a built-in matcher is an explicit opt-in with logging
- Default behavior (no suppressions configured) is unchanged

### Scenario 8: Developer Push Experience (Phase 5)

**Actor**: Developer pushing code with a test failure

**Flow**:

1. Developer runs `git push`
2. Pre-push hook runs dependency check, build, and tests
3. First test failure triggers immediate exit (`--bail=1`)
4. Developer sees the failure quickly (~10-20s) instead of waiting for full suite (~90s)

**Acceptance Criteria**:

- Pre-push test command exits on first failure
- Successful pushes are unaffected (full suite still runs to completion)

---

## Functional Requirements

### FR-001 through FR-007: Canonical Execution Plan Pipeline

Pass and agent filtering MUST be implemented as a deterministic pipeline that produces a single `ExecutionPlan` object consumed by ALL downstream code paths. No downstream code (dry-run, cost-only, dependency check, or execution) may read raw CLI flags directly — they MUST operate exclusively on the resolved execution plan.

**Pipeline stages** (strict ordering):

1. **Parse**: Extract raw `--pass` and `--agent` from CLI arguments
2. **Validate**: Check `--pass` against `config.passes[].name`; check `--agent` against the canonical agent registry. Exit with clear error on mismatch, listing available options.
3. **Build Execution Plan**: Produce a frozen plan object containing: filtered passes (each with its filtered agents list), the selected execution mode (full/dry-run/cost-only), and the resolved config. This is the single source of truth for what will execute.
4. **Dependency Check**: Run `checkDependenciesForPasses()` against ONLY the plan's passes
5. **Execute/Dry-Run/Cost-Only**: Consume the plan object — never re-read CLI flags

**Plan immutability and observability**: The execution plan object MUST be deeply immutable after construction (no mutation by any downstream consumer). A canonical plan serializer MUST produce a deterministic, **redacted** JSON representation of the plan that is:

- Emitted to stderr in `--verbose` mode for debugging
- Included in `--dry-run` output so users see the exact plan that would execute
- Covered by golden snapshot tests that compare the serialized plan across dry-run, cost-only, and execute modes for the same input — ensuring future refactors cannot reintroduce divergence between what is displayed and what is executed

**Redaction contract**: The plan serializer MUST use an explicit safe-field allowlist. Only the following fields may appear in serialized output: pass names, agent IDs, execution mode, provider name, model name, limits (as configured, not computed). The following MUST be redacted or excluded: API keys, tokens, endpoint URLs, internal file paths, environment variables, PR descriptions, diff content. Raw config objects MUST NOT be stringified in any mode — only the redacted plan view is permitted in logs and output.

**Canonicalization contract**: The serialized plan MUST be deterministic across environments and modes:

- Fields MUST be emitted in a fixed alphabetical key order (not insertion order)
- Limit values MUST be the resolved configured values, not defaults-merged-at-runtime (so the same config always produces the same plan regardless of environment defaults)
- Nondeterministic or mode-derived counters (file count, estimated tokens, estimated cost) MUST be excluded from the canonical serialized form — they are computed after plan construction and vary between dry-run and execute. They may appear in dry-run display output but MUST NOT be part of the snapshot-testable plan representation
- Golden snapshot tests compare the canonical plan JSON only — display-layer additions (counters, formatting) are tested separately

**Pass filtering** (FR-001): When `--pass` is specified, the plan contains only the named pass. Dependencies are checked only for that pass's agents.

**Agent filtering** (FR-005): When `--agent` is specified, the plan includes all passes containing that agent, with each pass narrowed to only that agent.

**Combined** (FR-007): `--pass` narrows first, then `--agent` filters within. If the agent is not in the selected pass, exit with error: "Agent '{id}' is not configured in pass '{name}'. It is available in: {other_passes}".

**Dry-run** (FR-002): MUST show only agents from the execution plan.

**Cost-only** (FR-003): MUST estimate cost using only the execution plan's agents.

**Validation errors** (FR-004, FR-006): Unknown pass names MUST list available passes. Unknown agent IDs MUST list valid IDs. Exit code MUST be non-zero.

### FR-008: Benchmark Command Documentation

The CLI reference documentation MUST include the `ai-review benchmark` command with all options (--fixtures, --output, --verbose), exit codes, and release gate descriptions.

### FR-009: Agent ID Reference Documentation (Single Registry)

The CLI reference MUST include a table of all valid agent IDs with their descriptions and requirements (external tool vs API key vs built-in).

**Single source of truth**: A canonical agent registry MUST be the sole authority for agent identity. Schema validation, CLI help text, documentation tables, and error messages MUST all derive from this registry. Adding a new agent without updating the registry MUST be impossible (the registry drives the schema enum). This prevents divergence between code, docs, CLI help, and validation.

**Config-time pass composition validation**: During config loading (before execution planning), every pass MUST be validated against the agent registry:

- Unknown agent IDs in any pass MUST produce a config error listing the invalid ID and valid alternatives
- Duplicate agent IDs within a single pass MUST produce a config error
- Provider-incompatible agents (e.g., `pr_agent` configured with `provider: ollama`) MUST produce a config error (exit code `2`) at validation time, not a runtime crash. Exception: if the incompatible agent's pass is marked `required: false`, the agent is automatically excluded from the execution plan with a visible notice ("Agent 'pr_agent' excluded: incompatible with provider 'ollama'").
- **Empty-pass rule**: If agent exclusion leaves a pass with zero runnable agents, the behavior depends on the pass's `required` flag:
  - `required: true` with zero agents → config error, exit code `2`: "Required pass '{name}' has no runnable agents after provider compatibility filtering"
  - `required: false` with zero agents → pass is removed from the execution plan and reported in all output modes (pretty, JSON, SARIF) as a skipped pass with reason: "Pass '{name}' skipped: no agents compatible with provider '{provider}'"
  - The execution plan MUST NOT contain any pass with an empty agents list. This is a structural invariant enforced at plan construction time.
- This validation runs as part of config normalization, before the execution plan is built, ensuring invalid pass composition never reaches dependency check or runtime

### FR-010: Pass Name Discovery Documentation

The CLI reference MUST explain that pass names are user-defined in `.ai-review.yml` and show how to discover available passes.

### FR-011: Configuration Example Accuracy

The `router/README.md` configuration examples MUST match the current schema, including the `version` field, correct default pass names, and the `required` field on passes.

### FR-012: Complete Config Schema Documentation

The `config-schema.md` reference MUST document all top-level properties: `provider`, `models`, `control_flow`, `suppressions`. The `reporting` section MUST document both GitHub and ADO sub-objects. The `gating` section MUST document `drift_gate`.

### FR-013: Comprehensive Environment Variable Reference

The CLI reference MUST include a complete environment variable reference covering all providers (Anthropic, OpenAI, Azure OpenAI, Ollama), platform tokens, Local LLM tuning variables, telemetry variables, and utility variables.

### FR-014: Root Version Sync

The release process MUST keep the root `package.json` version synchronized with the router `package.json` version.

### FR-015: Variable-Backed HTML Detection (GitHub #171)

The error-object-xss matcher MUST detect HTML-containing variable assignments within the evidence window when the variable is subsequently passed to `res.send/write/end()`. Plain-text variables MUST still be correctly suppressed.

### FR-016: Security Blocklist Prefix Matching (GitHub #174)

The SECURITY_BLOCKLIST regex MUST correctly match inflected forms of all prefix terms: "sanitize/d/ation/ing", "escape/d/ing", "authenticate/d/ion/ing", "authorize/d/ation/ing", "deserialize/d/ation/ing", "vulnerable/ity/ities".

**Verified bug**: The trailing `\b` in the regex group prevents ALL 6 prefix terms from matching inflected forms. Tested: `SECURITY_BLOCKLIST.test("sanitize")` returns `false`, `SECURITY_BLOCKLIST.test("authentication")` returns `false`, etc. The `\w*` suffix fix resolves all 10 tested cases while preserving existing whole-word term matching (sql, xss, jwt, token, redirect all still match).

### FR-017: Matcher Composability Helpers (GitHub #173)

Common patterns across framework convention matchers MUST be extracted into shared helper functions to reduce code duplication, without changing any matcher behavior.

### FR-018: Finding Validation Deduplication

The finding validation pipeline MUST eliminate duplicate self-contradiction and cautionary-advice detection passes between Stage 1 (semantic validation) and Stage 2 (diff-bound validation).

### FR-019: ProcessedFindings Naming Accuracy

The `ProcessedFindings.deduplicated` field MUST be renamed to accurately reflect its contents (sanitized/filtered findings).

### FR-020: Cache Orphan Cleanup

The cache cleanup process MUST identify and remove cache files from previous schema versions that are no longer accessible to the current system.

### FR-021: Partial Results Preservation

When a required agent fails, findings from previously-completed agents MUST be preserved and available for degraded reporting. The execution error MUST carry accumulated partial results.

**Implementation contract**: The fatal execution error type MUST include an optional `partialResults` field containing: complete findings, partial findings, all agent results, and skipped agent metadata accumulated before the failure. Both the CI path and CLI path error handlers MUST check for this field and, when present, report findings in a degraded mode with clear "incomplete" labeling. Partial results MUST NOT be used for gating decisions (consistent with existing FR-008).

**Exit code and output semantics**:

- **CI mode**: Check run conclusion MUST be `neutral` (not `failure`) when partial results are reported. The check run summary MUST state which agents succeeded and which failed.
- **CLI interactive (pretty, TTY)**: Exit code MUST be `3` (new dedicated code for incomplete). The output MUST include a clear "Incomplete review" header listing succeeded/failed agents before the findings.
- **CLI non-interactive (JSON/SARIF, or non-TTY)**: Exit code MUST be `3` (same dedicated code). The machine-readable output MUST include a top-level `"status": "incomplete"` field (vs `"complete"` for full runs). Exit code `0` is NEVER emitted for incomplete runs in any mode — automation wrappers that key off exit codes MUST see a non-zero result.
- **Exit code table** (canonical, all modes):
  - `0` — complete review, all agents succeeded, gating passed (or gating disabled)
  - `1` — complete review, gating failure (findings exceeded threshold)
  - `2` — fatal error (config invalid, no passes runnable, suppression config error)
  - `3` — incomplete review (partial results available, some agents failed)
- **Machine-readable status taxonomy**: All JSON and SARIF output MUST include a top-level `"status"` field from a canonical enum. The exit code and status enum have a strict 1:1 mapping:
  - Exit `0` → `"status": "complete"` — review finished, gating passed or disabled
  - Exit `1` → `"status": "gating_failed"` — review finished, findings exceeded threshold
  - Exit `2` → `"status": "config_error"` — fatal configuration or validation failure (no findings produced)
  - Exit `3` → `"status": "incomplete"` — partial results, some agents failed
    Downstream tooling MUST key off the `status` field for semantic decisions, not exit codes alone. The status enum is the contract — exit codes are a convenience for shell scripts.
- **Precedence rule**: Exit code `3` / status `incomplete` ALWAYS takes precedence over `1` / `gating_failed`. A run that is both incomplete AND has findings above the gating threshold MUST return `3` with `"status": "incomplete"`, not `1`, because gating evaluation on incomplete data is unreliable. Gating MUST be suppressed entirely when the run status is incomplete — it is never evaluated, never logged as passed or failed, and cannot produce exit code `1`.
- **Invariant**: Exit code `1` / `gating_failed` is reserved exclusively for complete runs whose gating rules fail. No other condition may produce exit code `1`. This is testable: any test that asserts exit code `1` MUST also assert `"status": "gating_failed"` in the output, and any test asserting `"status": "gating_failed"` MUST co-assert that all agents completed successfully.

### FR-022: User-Configurable Suppressions

The configuration schema MUST support user-defined suppression rules with mandatory `reason` fields. Rules MUST require at least one of rule/message/file criteria. Built-in matcher disabling MUST be supported via explicit configuration. All suppressions MUST be logged.

**Security constraint**: In CI mode (GitHub/ADO), suppression rules MUST be loaded from the BASE branch configuration only, never from the PR branch. This prevents attackers from smuggling suppressions into fork PRs to hide vulnerabilities. In local review mode, the working tree config is used (developer's own config is trusted).

**Visibility constraint**: Suppressed finding counts MUST be visible in the review summary output (e.g., "12 findings (3 user-suppressed)"), not just in debug logs. This ensures reviewers are aware when suppressions are active.

**Deterministic suppression constraints** (anti-blanket-silencing):

- Message patterns MUST be anchored (no bare `.*` or empty patterns) — reject patterns that match every possible string at config validation time
- Rule ID patterns support glob syntax only (no arbitrary regex) — e.g., `semantic/*` is valid, `.*` is not
- A maximum of 50 suppression rules per configuration (enforced at config validation, not runtime)
- First matching rule wins (rules are evaluated in config order; no multi-rule accumulation)

**Hard CI breadth enforcement**:

- If a single suppression rule matches more than 20 findings in one CI review, the review MUST fail with exit code `2` (config error) and a message: "Suppression rule '{reason}' matched {N} findings (limit: 20). Add `breadth_override: true` to this rule to allow broad suppression."
- A breadth override on a suppression rule requires three fields: `breadth_override: true`, `breadth_override_reason: "<justification>"`, and `approved_by: "<person or team>"`. When all three are present, the 20-finding limit is raised to 200 and a visible summary entry is emitted in CI output: "Broad suppression override: '{reason}' approved by {approved_by} — matched {N} findings". Missing `breadth_override_reason` or `approved_by` when `breadth_override: true` is set MUST produce a config validation error.
- Breadth overrides MUST NOT apply to findings with `error` severity unless the specific rule is named in a top-level `security_override_allowlist` array under the `suppressions` section. This allowlist contains rule `reason` strings (exact match) that are explicitly authorized to suppress error-severity findings. Example: `security_override_allowlist: ["legacy auth module - tracked in JIRA-1234"]`. Any breadth-override rule matching an `error`-severity finding whose `reason` is NOT in the allowlist MUST fail with: "Breadth override on rule '{reason}' cannot suppress error-severity findings — add to security_override_allowlist to authorize". This bounds the blast radius to individually named and auditable rules rather than a blanket flag.
- In local review mode (CLI), broad matches emit warnings only (developer's own codebase is trusted).
- Suppression rule match counts MUST be included in machine-readable output (`"suppressions": [{"reason": "...", "matched": N}]`) so CI pipelines can enforce custom thresholds.
- Suppression fixtures (test data for suppression rules) MUST include match-count assertions to catch overly broad patterns before merge.

### FR-023: Pre-Push Early Exit

The pre-push hook test command MUST exit on first test failure to provide faster feedback to developers.

### FR-024: Example Configuration File

An annotated example configuration file (`.ai-review.yml.example`) MUST be committed to the repository for onboarding reference.

### FR-025: Complete Environment File

The `.env.example` file MUST include all supported provider and platform environment variables with descriptions.

### FR-026: Coverage Threshold Visibility

A script or mechanism MUST exist for developers to verify their code against CI-level coverage thresholds locally before pushing.

### FR-027: Issue #172 Disposition

Scanner false-positive noise (ReDoS, path traversal, phantom files) MUST be closed as documented/won't-fix with rationale preserved in the issue.

### FR-028: CLAUDE.md Regeneration

CLAUDE.md is currently tracked in git (has commit history) despite being listed in `.gitignore`. It MUST first be untracked (`git rm --cached`) before regeneration. A manual-run generation script MUST be created to prevent future drift. The script MUST be deterministic and MUST NOT be wired into pre-commit or CI hooks. The Manual Additions section MUST be preserved.

---

## Success Criteria

1. **Pass filtering functional**: Users can run `--pass cloud-ai` without semgrep installed, and the review executes successfully using only cloud-ai agents
2. **Agent filtering functional**: Users can run `--agent control_flow` and only the control_flow agent executes
3. **Validation complete**: Invalid `--pass` or `--agent` values produce clear error messages with available options listed
4. **Documentation complete**: All CLI commands, agent IDs, pass name discovery, environment variables, and configuration options are documented in a single reference
5. **Suppressor accuracy**: Variable-backed HTML XSS findings are no longer incorrectly suppressed; all 6 prefix security terms match their inflected forms
6. **Pipeline resilience**: When one of three agents crashes, findings from the other two are preserved and reported
7. **User suppressions work**: Project maintainers can suppress findings by rule, message pattern, or file glob with mandatory audit reasons
8. **Developer velocity**: Pre-push hook exits immediately on first test failure
9. **Onboarding**: New users find a complete example config and env file in the repository
10. **Zero regressions**: Existing test suite passes; benchmark scores do not degrade

---

## Key Entities

### Pass

A named group of agents configured in `.ai-review.yml`. Has properties: name, agents list, enabled flag, required flag.

### Agent

An individual review engine identified by a canonical ID. Types: external tool (semgrep, reviewdog), cloud AI (opencode, pr_agent, ai_semantic_review), local AI (local_llm), built-in (control_flow).

### Finding

A normalized review result with severity, location, message, fingerprint, and provenance (complete vs partial).

### Suppression Rule

A user-defined rule in `.ai-review.yml` that silences specific findings based on rule ID pattern, message pattern, file glob, or severity, with a mandatory reason field.

### Framework Matcher

A closed-set pattern in the framework convention filter that identifies known false-positive patterns in code diffs.

---

## Scope Boundaries

### In Scope

- CLI pass/agent filtering, validation, and error messages
- Documentation for all existing commands, options, and environment variables
- Suppressor bug fixes (error-object-xss, SECURITY_BLOCKLIST)
- Matcher composability refactor (pure extraction, no new matchers)
- Finding validation pipeline deduplication
- Cache orphan cleanup
- Partial results preservation on agent failure
- User-configurable suppression rules in config schema
- Pre-push hook optimization
- Example configuration and environment files
- CLAUDE.md regeneration with generation script
- Issue #172 closure

### Out of Scope

- Adding new framework convention matchers (requires spec amendment per constitution)
- Destructuring taint loss fix (tracked separately as Issue #164)
- ADO pagination for 250+ findings (separate enhancement)
- Cache migration hooks for cross-version result conversion
- New CLI commands or subcommands
- Breaking changes to existing configuration format

---

## Assumptions

1. The execution plan pipeline (parse → validate → buildExecutionPlan → dependencyCheck → execute) can be implemented as a pre-processing step in `local-review.ts` without restructuring the function's core loop
2. A canonical agent registry can be extracted from the existing `AgentSchema` enum in `schemas.ts:12-20` to serve as the single source of truth for agent identity across schema, CLI, docs, and error messages
3. The 6 prefix terms in the SECURITY_BLOCKLIST are the only terms affected by the `\b` anchoring bug
4. Helper extraction from framework-pattern-filter.ts can be done as a pure refactor without changing any matcher behavior
5. The `ProcessedFindings.deduplicated` rename is an internal-only change with no external API impact
6. Adding `partialResults` to `FatalExecutionError` is additive and backward-compatible
7. The `suppressions` config section is optional with empty defaults, causing zero breaking changes
8. CLAUDE.md is currently tracked in git despite `.gitignore` listing — it MUST be untracked (`git rm --cached`) before regeneration, then `.gitignore` will apply going forward

---

## Dependencies

### Internal Dependencies (ordering constraints)

- FR-015, FR-016 (suppressor bug fixes) MUST be completed before FR-022 (user suppressions) — suppressions interact with the security blocklist and must be tested against the corrected behavior
- FR-017 (matcher composability) MUST be completed before FR-022 — `disable_matchers` operates on matcher IDs from the refactored code
- FR-018 (validation dedup) SHOULD be completed before FR-022 — cleaner to add new pipeline stage after consolidation
- FR-001 through FR-007 (pass/agent filtering) are independent of all other phases
- FR-020 (cache cleanup) and FR-021 (partial results) are independent of each other
- FR-024, FR-025 (example files) SHOULD be the last items — must reflect final schema including `suppressions`

### External Dependencies

- None — all changes are internal to the odd-ai-reviewers codebase

---

## Risks

| Risk                                                | Likelihood | Impact   | Mitigation                                                                                                             |
| --------------------------------------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Pass filtering breaks CI review command             | Low        | High     | CI `review` command uses different code path (main.ts, not local-review.ts); verify no shared state                    |
| Blocklist regex change introduces false negatives   | Low        | Medium   | `\w*` suffix is additive (matches more, not fewer); existing tests validate current terms still match                  |
| Matcher helper extraction introduces regressions    | Low        | Medium   | Pure extraction; existing test suite covers all 9 matchers; run full benchmark                                         |
| User suppressions used to hide real vulnerabilities | Medium     | High     | Base-branch-only loading in CI; mandatory `reason` field; suppressed counts in summary; at least one criteria required |
| Suppression rules smuggled via fork PR              | Low        | Critical | FR-022 security constraint: CI mode loads suppressions from BASE branch only, never from PR branch                     |
| Partial results displayed as complete               | Low        | High     | Clear "incomplete" labeling; partials excluded from gating (FR-008 existing)                                           |
| ProcessedFindings rename breaks external consumers  | Very Low   | Medium   | Field is internal to router; grep for all references before rename                                                     |

---

## Constitution Compliance

| Principle                        | Status                   | Notes                                                                                                                                                                            |
| -------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | Compliant                | No changes to posting logic                                                                                                                                                      |
| II. Structured Findings Contract | Compliant                | Finding schema unchanged; new `provenance` usage is additive                                                                                                                     |
| III. Provider-Neutral Core       | Compliant                | No provider-specific changes in core logic                                                                                                                                       |
| IV. Security-First Design        | Strengthened / Mitigated | Blocklist fix and XSS matcher fix improve security detection (FR-015, FR-016). FR-022 introduces new attack surface mitigated by base-branch-only suppression loading in CI mode |
| V. Deterministic Outputs         | Compliant                | No changes to fingerprinting or ordering                                                                                                                                         |
| VI. Bounded Resources            | Compliant                | No changes to resource limits                                                                                                                                                    |
| VII. Environment Discipline      | Compliant                | No changes to CI environment                                                                                                                                                     |
| VIII. Explicit Non-Goals         | Compliant                | No scope expansion                                                                                                                                                               |
