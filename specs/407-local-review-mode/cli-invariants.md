===========================
CLI Invariants — odd-ai-reviewers
=================================

These invariants are **non-negotiable** and apply to all future CLI work.

Behavioral Invariants

- CLI behavior must be deterministic for identical inputs
- Defaults must be safe, explicit, and discoverable
- No silent fallbacks that change scope or cost
- No hidden interactive prompts during execution

Diff & Scope Invariants

- CLI never reviews more code than explicitly implied by flags
- If no changes are detected, the tool exits successfully with a clear message
- Range, staged, and base/head flags are mutually respected and never combined ambiguously

Output Invariants

- Findings ordering is stable
- Severity taxonomy is fixed (error, warning, info/suggestion)
- JSON and SARIF outputs are schema-stable across versions
- Pretty output is human-first but derived from structured data

Schema & Contract Invariants (PR Lessons Learned Compliance)

> Derived from PR_LESSONS_LEARNED.md — violations will cause PR rejection

- **All structured outputs must include schema version** — JSON includes `schema_version`, SARIF includes `$schema`
- **Schema changes must be backward-compatible** within major versions
- **Config schema evolution handled gracefully** — unknown fields ignored, missing optional fields defaulted
- **Runtime version must match package version** — no stale VERSION files
- **Machine-readable status always produced** — even on failure, exit code and summary are available

Exit Code Invariants

- Exit codes must be consistent and documented
- Exit code must never depend on terminal formatting
- Non-zero exit always indicates an actionable failure state

Security Invariants (PR Lessons Learned Compliance)

> Derived from PR_LESSONS_LEARNED.md — violations will cause PR rejection

- No secrets are read from config files by default
- Environment variables are the primary credential source
- Errors must never echo sensitive values
- **Redaction applies to ALL output paths** — terminal, JSON, SARIF, logs, JSONL all use the same redaction rules
- **`shell: true` is forbidden** in child_process calls without explicit security justification
- **Path traversal must be prevented** — all file paths validated to stay within repository boundaries
- **Git refs must be sanitized** before passing to git commands (no command injection via branch names)
- **No unsafe DOM methods** (innerHTML, document.write) if CLI serves any HTML content
- **Format strings must be safe** — user input never used as format specifier

Performance Invariants

- Local runs must be diff-scoped by default
- No full-repo scans unless explicitly configured
- Cost estimation must never execute agents

Extensibility Invariants

- New reporters consume normalized findings, not raw agent output
- New agents plug into the same execution and reporting pipeline
- CLI flags are additive; breaking changes require explicit major versioning
