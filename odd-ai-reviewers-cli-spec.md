# 📋 SPEC: odd-ai-reviewers CLI & Local Review Mode

_Compiled: 2026-02-01 | Status: Draft_

---

## Executive Summary

Extend odd-ai-reviewers from a CI-only tool to a complete developer workflow by:

1. Publishing the existing CLI to npm
2. Adding local review mode (`ai-review .`)
3. Creating a rich terminal reporter

This transforms the user journey from "set up CI to see anything" to "try it locally in 30 seconds."

---

## Problem Statement

**Current state:**

- Excellent multi-pass AI review system for CI (GitHub Actions, Azure DevOps)
- CLI exists internally (`ai-review config init`, `validate`) but is NOT published
- Users must configure CI pipelines before seeing any results
- No way to test config or preview reviews locally

**Pain points:**

- High barrier to entry (CI setup required)
- Slow feedback loop (push → wait → check PR)
- Config iteration requires commits
- Hard to debug unexpected review results

---

## Proposed Solution

### Phase 1.2: Local Review Mode

New command that reviews code locally and prints results to terminal:

```bash
ai-review .                      # Review uncommitted + staged changes
ai-review . --base main          # Compare current branch to main
ai-review . --range HEAD~3..     # Specific commit range
ai-review . --staged             # Only staged changes (pre-commit hook friendly)
```

### Phase 1.3: Publish to npm

Package: `@oddessentials/ai-review`

```bash
# Users can then run:
npx @oddessentials/ai-review init
npx @oddessentials/ai-review validate
npx @oddessentials/ai-review .
```

### Phase 1.4: Terminal Reporter

Rich CLI output with colors, code snippets, and clear formatting.

---

## User Journey (After)

```
1. npx @oddessentials/ai-review init        # Generate .ai-review.yml (interactive wizard)
2. npx @oddessentials/ai-review validate    # Validate config
3. npx @oddessentials/ai-review .           # Run review locally, see results NOW
4. Tweak config, re-run instantly
5. Happy? Set up CI for automation on PRs
```

**Time to first review: ~60 seconds** (vs. 15+ minutes with CI setup)

---

## Technical Architecture

### Components to Build

| Component             | Status      | Description                                         |
| --------------------- | ----------- | --------------------------------------------------- |
| Git context inference | 🆕 New      | Auto-detect repo root, current branch, default base |
| Local diff generator  | ✅ Exists   | Reuse existing `diff.ts` logic                      |
| Config loader         | ✅ Exists   | Loads `.ai-review.yml`                              |
| Agent executor        | ✅ Exists   | Semgrep, OpenCode, PR-Agent, etc.                   |
| Budget/limits         | ✅ Exists   | Cost controls work as-is                            |
| **Terminal reporter** | 🆕 New      | Rich CLI output module                              |
| Reporter interface    | 🔧 Refactor | Abstract GitHub/ADO reporters, add Terminal         |

### Git Context Inference Logic

```typescript
// Pseudocode
function inferGitContext(cwd: string): GitContext {
  const repoRoot = findGitRoot(cwd);
  const currentBranch = getCurrentBranch(repoRoot);
  const defaultBase = detectDefaultBranch(repoRoot); // main, master, develop
  const hasUncommitted = checkUncommittedChanges(repoRoot);
  const hasStaged = checkStagedChanges(repoRoot);

  return { repoRoot, currentBranch, defaultBase, hasUncommitted, hasStaged };
}
```

### Reporter Interface

```typescript
interface ReviewReporter {
  start(context: ReviewContext): Promise<void>;
  reportFinding(finding: Finding): Promise<void>;
  reportPassComplete(pass: PassResult): Promise<void>;
  finish(summary: ReviewSummary): Promise<void>;
}

// Implementations:
// - GitHubReporter (existing - PR comments, checks)
// - ADOReporter (existing - threads, status)
// - TerminalReporter (NEW - rich CLI output)
```

---

## Output Vision (Terminal Reporter)

```
$ ai-review .

🔍 odd-ai-reviewers v1.2.0
   Analyzing 12 files (847 lines changed)
   Config: .ai-review.yml ✓
   Base: main (auto-detected)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 PASS 1: Static Analysis (semgrep)

┌─ src/auth.ts:42 ─────────────────────────── warning ─┐
│ Hardcoded secret detected (CWE-798)                  │
│                                                      │
│   40 │ // Configuration                              │
│   41 │ const config = {                              │
│ ▸ 42 │   apiKey: "sk-1234567890abcdef",              │
│   43 │ };                                            │
│                                                      │
│ 💡 Use environment variables for secrets             │
└──────────────────────────────────────────────────────┘

┌─ src/db.ts:15 ───────────────────────────── error ───┐
│ SQL injection vulnerability (CWE-89)                 │
│                                                      │
│   14 │ function getUser(id: string) {                │
│ ▸ 15 │   return db.query(`SELECT * WHERE id=${id}`); │
│   16 │ }                                             │
│                                                      │
│ 💡 Use parameterized queries                         │
└──────────────────────────────────────────────────────┘

✓ Static pass complete: 1 error, 1 warning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 PASS 2: AI Review (opencode)

┌─ src/utils.ts:15-28 ────────────────── suggestion ───┐
│ Consider extracting repeated validation logic        │
│                                                      │
│ This pattern appears 3 times. A shared validator     │
│ would reduce duplication and centralize the rules.   │
│                                                      │
│ 📄 See: src/utils.ts:15, src/api.ts:42, src/cli.ts:8 │
└──────────────────────────────────────────────────────┘

✓ AI pass complete: 2 suggestions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 SUMMARY

   Errors:      1
   Warnings:    1
   Suggestions: 2

   Files:    12 analyzed
   Cost:     $0.03 (estimated)
   Time:     4.2s

   Run with --fix to see auto-fix suggestions
```

---

## CLI Options (Proposed)

```
ai-review <path> [options]

Arguments:
  path                      Directory to review (default: ".")

Options:
  --base <ref>              Base reference for diff (default: auto-detect main/master)
  --head <ref>              Head reference (default: HEAD)
  --range <range>           Git range (e.g., HEAD~3.., main..feature)
  --staged                  Only review staged changes
  --uncommitted             Include uncommitted changes (default: true)

  --pass <name>             Run specific pass only (e.g., --pass static)
  --agent <id>              Run specific agent only (e.g., --agent semgrep)

  --format <fmt>            Output format: pretty (default), json, sarif
  --no-color                Disable colored output
  --quiet                   Minimal output (errors only)
  --verbose                 Show debug information

  --dry-run                 Show what would be reviewed without running agents
  --cost-only               Estimate cost without running review

  -c, --config <path>       Config file path (default: .ai-review.yml)
  -h, --help                Show help
  -v, --version             Show version
```

### Exit Codes & Signals

| Code | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| 0    | Success - no findings above threshold and execution succeeded             |
| 1    | Failure - findings exceed `fail_on_severity` threshold or execution error |
| 2    | Invalid arguments or configuration error                                  |
| 130  | Interrupted by Ctrl+C (SIGINT)                                            |
| 143  | Terminated by SIGTERM                                                     |

**Cancellation behavior:** Ctrl+C cancels immediately and may print partial results showing which agents completed before interruption. A second Ctrl+C force-quits without cleanup.

---

## Pre-commit Hook Integration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: ai-review
        name: AI Code Review
        entry: npx @oddessentials/ai-review . --staged --quiet
        language: system
        pass_filenames: false
```

---

## Strategic Value

**Market Positioning:**

- "Try before you buy" — No CI setup required to evaluate
- "Developer-first" — Fits in local workflow, not just CI
- "Debugging tool" — When CI results are unexpected, run locally
- Differentiator vs. competitors (most are CI-only)

**Future Opportunities (unlocked by local mode):**

- VS Code extension (run on current file/selection)
- Git hook integration (pre-commit, pre-push)
- Editor inline annotations
- Watch mode (`ai-review . --watch`)
- IDE plugins (JetBrains, etc.)

---

## Implementation Phases

### Phase 1.2: Local Review Mode (Est: 2-3 days)

- [ ] Git context inference module
- [ ] Terminal reporter (basic)
- [ ] Wire up `ai-review .` command
- [ ] Handle --base, --staged, --range flags
- [ ] Error handling for missing config, no changes, etc.

### Phase 1.3: Publish to npm (Est: 1 day)

- [ ] Create `@oddessentials/ai-review` package
- [ ] Set up npm publish workflow
- [ ] Update README with CLI docs
- [ ] Add npx examples to quick start

### Phase 1.4: Polish Terminal Reporter (Est: 1-2 days)

- [ ] Rich formatting (boxes, colors, code snippets)
- [ ] JSON and SARIF output formats
- [ ] Progress indicators for long-running agents
- [ ] Cost estimation display

---

## Open Questions

1. Should `ai-review .` require a config file, or have sensible zero-config defaults?
2. How to handle API keys for local runs? (env vars, config file, prompt?)
3. Include `--fix` flag for auto-fixable issues? (scope creep risk)
4. Support `--watch` mode in v1.2 or defer?

---

_End of spec. Ready for review and prioritization._ 🌀
