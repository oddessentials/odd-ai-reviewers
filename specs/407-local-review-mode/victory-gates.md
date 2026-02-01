===========================
Victory Gates — Phase 407
(Local Review Mode & Terminal Reporter)
=======================================

All Victory Gates must pass before Phase 407 is merged.

Gate 1 — Local Parity Gate

- Same diff + same config → same findings locally and in CI
- Verified across at least:
  - one semgrep finding
  - one AI agent finding

- No additional or missing findings locally

Gate 2 — Zero-Config Gate

- Fresh repo with no `.ai-review.yml`
- `npx @oddessentials/ai-review .` runs successfully
- Output explicitly indicates zero-config/default mode
- No prompts or interactive blocking

Gate 3 — Performance Gate

- Typical local diff (<1k lines):
  - completes in under 10 seconds

- Pre-commit mode (`--staged --quiet`):
  - completes within acceptable git hook limits

- No obvious quadratic or repo-wide scans

Gate 4 — Determinism Gate

- Multiple runs on same inputs produce:
  - identical findings
  - identical ordering
  - identical JSON/SARIF output

- No time-dependent or non-stable behavior

Gate 5 — UX Clarity Gate

- First-time user can:
  - install via npx
  - run local review
  - understand results
  - identify next steps

- No requirement to read documentation to interpret output

Gate 6 — Cross-Platform Gate

- Verified on:
  - macOS
  - Linux
  - Windows

- No shell-specific or path separator issues

Gate 7 — Regression Gate

- Existing CI workflows remain unaffected
- No breaking changes to config schema
- No breaking changes to agent execution
