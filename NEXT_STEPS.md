- Fix the broken image links in review-team.md. Carefully investigate our markdown files for other broken links to see if this is a pervasive issue.

- Add our `npm run format` automatically before commit or something so its not a pain for users.

* **Treat the ReDoS items as worth deeper work, but validate the actual threat model first.** Confirm whether these regexes are ever built from _repo-controlled_ config only (safe-ish) vs _PR-controlled_ input (dangerous), and document that boundary in the spec + code comments so Semgrep findings aren’t ambiguous and future contributors don’t accidentally widen the attack surface.

* **Make the “pattern-validator” test suite exhaustive and table-driven (and add regression cases for known-bad patterns).** Cover: empty/very long patterns, invalid syntax, nested quantifiers, catastrophic backtracking classics, and “complex features” like lookaheads/lookbehinds/backreferences—then assert both “allow/deny” outcomes _and_ the exact error codes/messages so behavior is deterministic under golden tests.

* **Don’t rely on “timeout regex” alone—add a preflight safety gate plus hard limits.** Add explicit caps like `maxPatternLength`, `maxInputLength`, and `maxEvalMs`, and enforce them before any `RegExp()` compile; then, if you _do_ compile dynamically, consider running a static checker (e.g., `recheck`) in the validation path and unit-test the checker integration against your edge-case corpus.

* **Address Semgrep’s “RegExp() called with … function argument” findings by tightening types and narrowing construction sites.** If these are false positives due to typing or wrappers, make the call sites unambiguous (e.g., accept only `string` patterns, avoid union types that include `Function`, and centralize all `new RegExp()` behind a single module); if they’re real, refactor so patterns come from trusted constants or validated config only.

* **Harden `TimeoutRegex` error handling and failure semantics so you never crash the router on regex exceptions.** Wrap compile + exec in `try/catch`, normalize the failure result (e.g., `{ ok:false, reason:"invalid_regex" | "timeout" | "runtime_error" }`), and add tests that assert you log once (not spam) and continue gracefully with a safe fallback decision.

* **Performance guardrails for cross-file mitigation tracking are worth implementing now.** Add deterministic limits: `maxCallDepth`, `maxNodesVisited`, and optionally a `timeBudgetMs` for the detector; then add micro-bench tests (or at least worst-case synthetic fixtures) to prove you can’t blow up memory/CPU with deep or cyclic graphs.

* **Logging: keep it consistent, structured, and security-auditable—but don’t overbuild monitoring yet.** Standardize event names/fields (category, ruleId, file, patternHash, durationMs, outcome) and ensure no raw patterns are logged (hash them); then add a single “security events” aggregation point so later you can wire alerting without changing log semantics.

* **Specs: make acceptance criteria _provably testable_ and link each to a concrete test file.** For both control-flow hardening and ReDoS prevention, require: (1) deterministic outputs, (2) explicit limits, (3) corpus-backed tests, and (4) “no unvalidated RegExp construction” as an invariant—so the PR can’t merge without evidence.
