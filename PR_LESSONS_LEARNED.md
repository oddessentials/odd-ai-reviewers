# odd-ai-reviewers CLI – Non-Negotiable Lessons (Derived from ado-git-repo-insights)

- These issues caused real production churn
- They are not theoretical
- Violating them means PRs will be rejected
- This is why some design choices may feel strict or redundant

_Compiled: 2026-02-01 by odd-bot_
_Source: 124 PRs, 704 review comments, 250 issue comments_
_Reviewers: odd-ai-reviewers (Semgrep + AI semantic), ChatGPT Codex_

---

## Executive Summary

Analysis of all PR review comments from `ado-git-repo-insights` reveals **recurring patterns** that should inform CLI tool development. These lessons come from real dogfooding — odd-ai-reviewers reviewing the crown jewel that generates its own test data.

**Top Categories:**

1. **Security** (292 findings) — XSS, command injection, path traversal, secret redaction
2. **Schema/Contract Integrity** — Version drift, migration gaps, manifest validation
3. **Error Handling** — Graceful degradation, run summaries on failure
4. **CLI-Specific** — Input name consistency, version file sync, documentation accuracy

---

## 🔒 SECURITY

### 1. Never use `innerHTML` or `document.write` with user data

**Frequency:** 159 findings
**Rule:** `javascript.browser.security.insecure-document-method.insecure-document-method`

```typescript
// ❌ BAD
element.innerHTML = userInput;
document.write(data);

// ✅ GOOD
element.textContent = userInput;
// Or use DOM APIs: createElement, appendChild
// Or sanitize with DOMPurify
```

**CLI Implication:** If your CLI serves a web UI (dashboards, reports), sanitize all dynamic content.

---

### 2. Avoid `child_process` with user-controllable arguments

**Frequency:** 16 findings
**Rule:** `javascript.lang.security.detect-child-process.detect-child-process`

```typescript
// ❌ BAD
spawn(userProvidedCommand, args);
exec(`${userInput} --flag`);
spawn(cmd, args, { shell: true }); // shell: true is dangerous

// ✅ GOOD
spawn(HARDCODED_BINARY, [sanitizedArg], { shell: false });
// Validate inputs against allowlist
// Use execFile instead of exec when possible
```

**CLI Implication:** CLI tools often shell out. Always use `shell: false`, validate inputs, use allowlists for commands.

---

### 3. Validate and sanitize file paths (path traversal)

**Frequency:** 34 findings
**Rule:** `javascript.lang.security.audit.path-traversal.path-join-resolve-traversal`

```typescript
// ❌ BAD
const filePath = path.join(baseDir, userInput);
// userInput could be "../../../etc/passwd"

// ✅ GOOD
const resolved = path.resolve(baseDir, userInput);
if (!resolved.startsWith(path.resolve(baseDir))) {
  throw new Error('Path traversal detected');
}
```

**CLI Implication:** Any CLI that reads/writes files based on user input MUST validate paths stay within expected boundaries.

---

### 4. Redact secrets in ALL log paths

**Priority:** P1 (Critical)

> "When `--log-format jsonl` is selected, `JsonlHandler.emit` writes `record.getMessage()` directly, but this handler doesn't use `RedactingFormatter`. Any PAT/bearer token logged will be persisted unredacted."

**Lesson:** Every log output path (text, JSON, JSONL, structured) must apply the same redaction rules. Don't assume one formatter covers all paths.

```python
# ✅ GOOD - Apply redaction at every output point
class JsonlHandler(Handler):
    def emit(self, record):
        message = self.redactor.redact(record.getMessage())  # REDACT HERE
        self.stream.write(json.dumps({"msg": message}))
```

---

### 5. Avoid format strings with user input

**Frequency:** 23 findings
**Rule:** `javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring`

```typescript
// ❌ BAD
console.log(userInput); // If userInput contains %s, %d, etc.
util.format(userInput);

// ✅ GOOD
console.log('%s', userInput);
console.log(String(userInput));
```

---

## 📦 SCHEMA & CONTRACT INTEGRITY

### 6. Always version your output schemas

**Priority:** P2

> "The updated dataset contract requires `predictions_schema_version` and `insights_schema_version` in the manifest, but `DatasetManifest` still only carries the manifest/dataset/aggregates versions."

**Lesson:** When your CLI produces structured output (JSON, SQLite, manifests), include schema versions. Consumers need to validate compatibility.

```json
{
  "manifest_version": "1.0.0",
  "schema_version": "2.1.0",
  "predictions_schema_version": "1.0.0",
  "generated_at": "2026-02-01T12:00:00Z"
}
```

---

### 7. Guard against schema evolution / missing tables

**Priority:** P1 (Critical)

> "The new dimensions query unconditionally selects from `teams`/`team_members`. On existing databases created before this change, those tables don't exist, so it will raise `OperationalError: no such table`."

**Lesson:** When adding new database tables/columns:

1. Add migration logic OR
2. Make queries conditional (check table exists) OR
3. Require explicit schema version in config

```python
# ✅ GOOD - Check before querying new tables
if self._table_exists('teams'):
    teams_df = pd.read_sql_query("SELECT * FROM teams", conn)
else:
    teams_df = pd.DataFrame()  # Graceful fallback
```

---

### 8. Handle foreign key constraints gracefully

**Priority:** P2

> "The `team_members` table enforces a foreign key to `users`. Team membership often includes users who have never appeared in PR data, so inserting those members will fail with a FK constraint error."

**Lesson:** When designing schemas with FKs, consider:

- Data may arrive out of order
- Related entities may not exist yet
- Upsert referenced records first, or use deferred FK checks

---

### 9. Keep VERSION files synchronized with releases

**Priority:** P2

> "The release prepare step only runs `stamp-extension-version.js`, which updates manifests but no longer writes the root `VERSION` file. The runtime summary reads that VERSION file, so it will become stale."

**Lesson:** If your CLI reads version from a file at runtime, ensure your release process updates ALL version sources (package.json, VERSION, manifests, etc.).

```json
// .releaserc.json - stamp ALL version files
{
  "prepare": [
    {
      "path": "@semantic-release/exec",
      "cmd": "scripts/stamp-all-versions.sh ${nextRelease.version}"
    }
  ]
}
```

---

## ⚠️ ERROR HANDLING & RELIABILITY

### 10. Always write run summaries, even on failure

**Priority:** P2

> "`cmd_extract` catches errors and returns `1` without writing a run summary. A misconfig or DB failure leaves `run_summary.json` missing even though the pipeline publishes `run_artifacts`."

**Lesson:** CLI tools should produce machine-readable status output regardless of success/failure. Downstream automation depends on it.

```python
# ✅ GOOD - Always write summary
try:
    result = run_extraction()
    write_summary(status="success", result=result)
except Exception as e:
    write_summary(status="error", error=str(e))  # STILL WRITE IT
    raise
```

---

### 11. Handle probe failures gracefully (don't lose context)

**Priority:** P2

> "When the HEAD probe can't find the manifest, `resolveDatasetRoot` sets `effectiveBaseUrl` to empty string, which makes `resolvePath` ignore the caller-supplied `baseUrl`."

**Lesson:** When a preliminary check (probe, ping, validation) fails, don't discard the original configuration. Fall back to the user's explicit settings.

```typescript
// ❌ BAD
if (!probeSucceeded) {
  this.baseUrl = ''; // Lost the original!
}

// ✅ GOOD
if (!probeSucceeded) {
  this.baseUrl = this.originalBaseUrl; // Keep user's config
  console.warn('Probe failed, using configured baseUrl');
}
```

---

### 12. Handle edge cases in statistical calculations

**Priority:** P2

> "For small datasets (2–9 PRs), the P90 calculation uses floor-based rank which resolves to offset 0, returning the minimum value instead of the 90th percentile."

**Lesson:** Statistical/ML features need edge case handling:

- Small N (use ceil or interpolation)
- Zero values (avoid division by zero)
- Negative predictions (clamp to valid ranges)

```python
# ✅ GOOD - Use ceil for small datasets
import math
rank = math.ceil(count * 0.9) - 1
rank = max(0, min(rank, count - 1))  # Clamp to valid range
```

---

### 13. Clamp predictions to valid ranges

**Priority:** P2

> "The forecast value is clamped to zero, but the upper bound uses the unclamped value. If regression extrapolates below zero, `upper_bound` can become negative."

**Lesson:** When producing predictions/forecasts:

- Clamp ALL derived values (not just the primary)
- Ensure confidence intervals remain valid (lower ≤ value ≤ upper)
- Handle edge cases where math produces impossible values

---

## 📝 CLI-SPECIFIC LESSONS

### 14. Match documentation to actual input names

**Priority:** P2

> "The extension task declares the input as `database`, but the README example uses `databasePath`. When someone copies this YAML, the custom path is ignored."

**Lesson:** Documentation examples MUST use actual parameter names. Test your docs by copy-pasting them.

```yaml
# ❌ BAD (docs say databasePath, code expects database)
- task: ExtractPRs@1
  inputs:
    databasePath: $(Build.ArtifactStagingDirectory)/pr.db

# ✅ GOOD (matches task.json exactly)
- task: ExtractPRs@1
  inputs:
    database: $(Build.ArtifactStagingDirectory)/pr.db
```

---

### 15. Don't overclaim test coverage

**Priority:** P2

> "This sentence overstates test coverage: the appendix only cites tests for redaction/logging, while claims about RBAC/secret handling have no corresponding tests."

**Lesson:** In compliance/security documentation:

- Only claim what's actually tested
- Link claims to specific test files
- Distinguish "tested by automation" vs "verified by design"

---

### 16. Await all promises (no floating promises)

**Frequency:** 4 findings
**Rule:** `typescript/no-floating-promises`

```typescript
// ❌ BAD
someAsyncFunction(); // Fire and forget - errors silently lost

// ✅ GOOD
await someAsyncFunction();
// Or explicitly handle
someAsyncFunction().catch(handleError);
```

---

## 📊 SUMMARY: TOP 10 RULES FOR CLI DEVELOPMENT

| #   | Rule                                  | Category    | Why It Matters                           |
| --- | ------------------------------------- | ----------- | ---------------------------------------- |
| 1   | **Redact secrets in ALL log paths**   | Security    | Tokens leak in unexpected formats        |
| 2   | **Validate file paths**               | Security    | Path traversal = arbitrary file access   |
| 3   | **No `shell: true` in child_process** | Security    | Command injection vector                 |
| 4   | **Version all output schemas**        | Contracts   | Consumers need compatibility checks      |
| 5   | **Guard new schema features**         | Contracts   | Existing DBs break on upgrade            |
| 6   | **Write run summaries on failure**    | Reliability | Automation needs machine-readable status |
| 7   | **Match docs to actual input names**  | CLI UX      | Copy-paste must work                     |
| 8   | **Keep VERSION files in sync**        | CLI UX      | Runtime version reporting drifts         |
| 9   | **Clamp all derived values**          | Reliability | Math produces impossible values          |
| 10  | **Await all promises**                | Reliability | Silent failures are debugging nightmares |

---

## Application to odd-ai-reviewers CLI

When building the local review mode (`ai-review .`), apply these lessons:

1. **Security**
   - Sanitize repo paths before passing to git commands
   - Redact API keys in all output formats (terminal, JSON, SARIF)
   - Use `shell: false` when spawning agents

2. **Schema/Contracts**
   - Version the terminal output format
   - Version the JSON/SARIF output schemas
   - Handle config file schema evolution gracefully

3. **Error Handling**
   - Always produce machine-readable exit status
   - Write partial results even on failure
   - Graceful degradation when agents fail

4. **CLI UX**
   - Test docs by copy-pasting examples
   - Keep `--help` output synchronized with README
   - Match parameter names exactly between CLI and config file

---

_This document should be updated as we continue dogfooding and learning from our own reviews._
