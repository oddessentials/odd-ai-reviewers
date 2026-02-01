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

Exit Code Invariants

- Exit codes must be consistent and documented
- Exit code must never depend on terminal formatting
- Non-zero exit always indicates an actionable failure state

Security Invariants

- No secrets are read from config files by default
- Environment variables are the primary credential source
- Errors must never echo sensitive values

Performance Invariants

- Local runs must be diff-scoped by default
- No full-repo scans unless explicitly configured
- Cost estimation must never execute agents

Extensibility Invariants

- New reporters consume normalized findings, not raw agent output
- New agents plug into the same execution and reporting pipeline
- CLI flags are additive; breaking changes require explicit major versioning
