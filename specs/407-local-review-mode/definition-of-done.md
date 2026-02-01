===========================
Definition of Done — Phase 407
(Local Review Mode & Terminal Reporter)
=======================================

Phase 407 is considered **DONE** when all of the following conditions are met:

Functional Completion

- `npx @oddessentials/ai-review .` runs successfully in any valid git repository with changes
- Local review produces findings that are **functionally identical** to CI review for the same diff + config
- Zero-config mode works out of the box and clearly indicates defaults are in use
- Existing CLI commands (`config init`, `validate`) work unchanged via npm and npx

CLI Behavior & Determinism

- Diff selection behavior is deterministic and documented:
  - staged, uncommitted, base/head, and range resolution behave predictably

- Stable ordering of findings (by severity → file → line)
- Exit codes are consistent and documented:
  - 0 = success
  - non-zero = actionable failure (not partial success)

- `--quiet`, `--verbose`, `--dry-run`, and `--cost-only` behave exactly as specified

Terminal Reporter

- Findings include file path, line range, severity, code context, and agent source
- Progress is shown for long-running agents
- Summary includes counts, execution time, and estimated cost
- Output is readable on macOS, Linux, and Windows terminals
- `--no-color` produces clean, readable output

Packaging & Distribution

- Package is published as `@oddessentials/ai-review`
- `ai-review` binary is available via npx and global install
- README includes:
  - quick start
  - local review examples
  - pre-commit example

- Node.js >= 22 enforced and validated

Error Handling

- Clear error messages for:
  - not a git repository
  - missing API credentials
  - invalid config

- “No changes to review” exits successfully and does not error
- Ctrl+C exits cleanly without corrupting state

Documentation & Parity

- CLI flags documented and match implementation
- No undocumented behavior paths
- No CI regressions introduced
- Documentation examples use actual parameter names (copy-paste works)

PR Lessons Learned Compliance (MANDATORY)

> Phase 407 implementation MUST comply with PR_LESSONS_LEARNED.md. Any deviation requires explicit justification in the PR description.

**Security Compliance**

- [ ] Secrets redacted in ALL output paths (terminal, JSON, SARIF, logs)
- [ ] No `shell: true` in child_process calls (or explicit justification provided)
- [ ] Path traversal prevention validated (paths stay within repo root)
- [ ] Error messages do not echo sensitive values
- [ ] Git refs sanitized before passing to commands

**Schema Compliance**

- [ ] JSON output includes `schema_version` field
- [ ] SARIF output includes `$schema` reference
- [ ] Runtime version matches package.json version
- [ ] Config schema evolution handled gracefully

**Reliability Compliance**

- [ ] No floating promises (all async operations awaited or explicitly handled)
- [ ] Derived values clamped to valid ranges
- [ ] Run summary produced even on failure
- [ ] Probe/validation failures preserve user configuration
