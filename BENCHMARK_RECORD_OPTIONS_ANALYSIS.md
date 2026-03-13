# Benchmark Record Script: Cross-Platform Options Analysis

**Context:** Current broken script on Windows: `"benchmark:record": "RECORD=true pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts"`

**Issue:** Unix shell syntax (`ENV=value cmd`) fails on Windows cmd.exe and PowerShell

---

## Option 1: cross-env devDependency

### Implementation

```json
"benchmark:record": "cross-env RECORD=true pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts"
```

### Platform Support

| Platform                | Works? | Notes                                  |
| ----------------------- | ------ | -------------------------------------- |
| Windows cmd             | ✅ Yes | cross-env handles env prefix syntax    |
| Windows PowerShell      | ✅ Yes | Same as cmd                            |
| bash/Linux              | ✅ Yes | Transparent passthrough                |
| GitHub Actions (Ubuntu) | ✅ Yes | Cross-env installed, standard approach |

### Dependencies

- **New:** `cross-env` (https://www.npmjs.com/package/cross-env) — 8.3MB, 0 dependencies
- **Installation:** `pnpm add -D cross-env@latest`
- **Current state:** Not in devDependencies; would require new install

### Maintenance Burden

- **Low-Medium:** cross-env is actively maintained (last updated 2024), 5.7M weekly downloads
- **Learning curve:** None — standard npm pattern
- **Cognitive load:** Developers must remember script uses cross-env

### Failure Modes

1. **Missing dependency:** If cross-env not installed, script fails with "command not found"
   - Mitigation: Part of standard CI setup, caught by `pnpm install`
2. **Version conflicts:** Unlikely given cross-env's simplicity
3. **Node.js process expansion:** If `RECORD=true` contains special characters, cross-env handles escaping
4. **Trailing args:** `cross-env A=B cmd arg1 arg2` — correctly passes args to cmd

### Ecosystem Precedent

- ✅ **Standard pattern:** Used by thousands of projects (React, Vue, webpack, etc.)
- ✅ **npm conventions:** Recommended by many style guides
- ✅ **CI/CD compatibility:** Native support in GitHub Actions, CircleCI, GitLab
- ✅ **Maintenance track record:** Maintained by @kentcdodds since 2014

### Strengths

- Explicit, readable, familiar to most Node.js developers
- Single-line fix, no new scripts
- Battle-tested in production codebases
- GitHub Actions runs `npm install` → cross-env available

### Weaknesses

- Adds dev dependency (small, but non-zero bloat)
- One more package to audit for supply-chain risk
- Requires `pnpm add` step before working

---

## Option 2: node -e inline

### Implementation

```json
"benchmark:record": "node -e \"process.env.RECORD='true'; require('child_process').execSync('pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts', {stdio:'inherit'})\""
```

### Platform Support

| Platform                | Works?    | Notes                                                      |
| ----------------------- | --------- | ---------------------------------------------------------- |
| Windows cmd             | ✅ Yes    | `node -e` is built-in, works with escaping                 |
| Windows PowerShell      | ⚠️ Mostly | Requires careful quoting; `\"` may need different escaping |
| bash/Linux              | ✅ Yes    | Standard approach                                          |
| GitHub Actions (Ubuntu) | ✅ Yes    | Node.js is already available                               |

### Dependencies

- **New:** None — uses Node.js built-in `child_process`
- **No install required:** Works immediately

### Maintenance Burden

- **High:** Complex quoting rules differ per shell
  - cmd.exe: `\"` for escapes, complex nesting
  - PowerShell: `\"` OR backtick escaping
  - bash: `\'` or `"..."` contexts
- **Fragile:** One shell change breaks others; hard to debug
- **Readability:** Dense one-liner, poor discoverability

### Failure Modes

1. **Quote escaping hell:** Windows cmd and PowerShell have conflicting quote rules
   - Example: `"node -e \"code with 'single' quotes\""` works in cmd but not PowerShell
   - Test required on all 3 platforms before committing
2. **Exit code loss:** If `execSync` throws, might not propagate correctly to `npm run` exit code
3. **stdio inheritance:** ✅ `{stdio:'inherit'}` correctly passes output, but requires careful setup
4. **pnpm filter arg parsing:** Complex nested command may confuse pnpm's arg parser
   - Less likely with `execSync(..., {shell: true})` but default shell handling varies

### Ecosystem Precedent

- ❌ **Not recommended:** Most Node.js guides recommend cross-env over inline node -e
- ❌ **Rare in major projects:** Few large projects use this pattern (perceived as anti-pattern)
- ⚠️ **shell compatibility:** npm/yarn docs warn about this; recommends cross-env

### Strengths

- Zero new dependencies
- Works everywhere Node.js works (eventually)
- Clever, self-contained solution

### Weaknesses

- **Debugging nightmare:** Shell escaping issues are hard to diagnose
- **Maintainability:** Future contributors may not understand the quoting
- **Platform-specific issues:** Will likely break on someone's setup
- **Not idiomatic:** Goes against npm ecosystem conventions
- **Test burden:** Must verify on Windows cmd, PowerShell, bash, and CI before merging

---

## Option 3: npx cross-env (no install)

### Implementation

```json
"benchmark:record": "npx cross-env RECORD=true pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts"
```

### Platform Support

| Platform                | Works? | Notes                                  |
| ----------------------- | ------ | -------------------------------------- |
| Windows cmd             | ✅ Yes | npx downloads/runs cross-env on demand |
| Windows PowerShell      | ✅ Yes | Same as cmd                            |
| bash/Linux              | ✅ Yes | Transparent                            |
| GitHub Actions (Ubuntu) | ✅ Yes | npx is available, but adds CI latency  |

### Dependencies

- **New:** None in package.json (but downloads cross-env at runtime)
- **Installation:** Automatic via npx (npm 5.2+)

### Maintenance Burden

- **Low-Medium:** No install step, but performance impact
- **CI latency:** npx downloads and caches cross-env on first run (~3-5s per CI run)
- **Network dependency:** Requires npm registry access; fails offline
- **Cognitive load:** "Why npx?" — less obvious than devDependency

### Failure Modes

1. **npm registry down:** If npm registry is unavailable, script fails
2. **Slow CI:** 3-5s overhead per benchmark run (not critical, but adds up)
3. **Cache inconsistency:** npx cache behavior varies across machines
4. **Dependency freshness:** cross-env version may drift if registry has updates

### Ecosystem Precedent

- ⚠️ **Mixed:** Some projects use for rarely-run scripts (e.g., release tooling)
- ⚠️ **Not standard for dev scripts:** Unusual for `npm run` scripts
- ✅ **Works well for:** One-off tools (`npx create-react-app`, `npx ts-node`)

### Strengths

- No package.json bloat
- Works immediately, no install step
- Good for "I just need this once" scenarios

### Weaknesses

- **CI overhead:** 3-5s slower per run (benchmarking is already slow)
- **Fragile:** Network dependency
- **Unconventional:** Developers expect devDeps for dev scripts
- **Less reproducible:** Version of cross-env may change unexpectedly
- **Performance:** Defeats purpose of offline/cached builds

---

## Option 4: Dedicated tsx Script

### Implementation

**package.json:**

```json
"benchmark:record": "tsx scripts/record-snapshots.ts"
```

**scripts/record-snapshots.ts:**

```typescript
import { spawn } from 'node:child_process';

process.env.RECORD = 'true';

const result = spawn(
  'pnpm',
  [
    '--filter',
    './router',
    'exec',
    'vitest',
    'run',
    'tests/integration/false-positive-benchmark.test.ts',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

result.on('close', (code) => {
  process.exit(code ?? 0);
});
```

### Platform Support

| Platform                | Works? | Notes                                              |
| ----------------------- | ------ | -------------------------------------------------- |
| Windows cmd             | ✅ Yes | tsx handles Node.js execution, shell flag added    |
| Windows PowerShell      | ✅ Yes | Same as cmd                                        |
| bash/Linux              | ✅ Yes | Standard spawn behavior                            |
| GitHub Actions (Ubuntu) | ✅ Yes | tsx is in devDeps (for sync-prompt-conventions.ts) |

### Dependencies

- **New:** None — tsx already in devDeps (used by `prompts:sync`)
- **Installation:** Already present (see package.json line 29)

### Maintenance Burden

- **Low:** Script is readable, self-documenting
- **Reusability:** Can extend script for other benchmark scenarios
- **Consistency:** Follows existing pattern (sync-prompt-conventions.ts uses tsx)
- **Testing:** Can unit test script logic if needed

### Failure Modes

1. **Exit code handling:** `spawn(...).on('close')` correctly propagates exit codes
2. **stdio inheritance:** ✅ Properly configured with `stdio: 'inherit'`
3. **pnpm args:** Explicit array args are less error-prone than shell string parsing
4. **Windows shell flag:** `shell: process.platform === 'win32'` handles Windows cmd incompatibilities

### Ecosystem Precedent

- ✅ **Aligned with project:** Exact same pattern used for prompts:sync script
- ✅ **TypeScript workflows:** Standard for Node.js + TypeScript projects
- ✅ **Maintainability:** Script can be version-controlled, tested, documented

### Strengths

- **Zero new dependencies** (tsx already installed)
- **Readable:** Clear what's happening; easier to debug
- **Reusable:** Script can be extended for other benchmark modes
- **Testable:** Can add unit tests for argument handling
- **Consistent:** Mirrors existing project pattern (sync-prompt-conventions.ts)
- **Windows-aware:** Explicit `shell: true` for Windows compatibility

### Weaknesses

- **One more file:** Adds scripts/record-snapshots.ts to maintain
- **Slightly more boilerplate:** 12 lines vs 1-line shell command
- **Discoverability:** New developers must find the script file to understand what `npm run benchmark:record` does

---

## Option 5: CI Portability Lint Script

### Implementation

**Purpose:** Parser that flags Unix-only patterns in package.json scripts

**Example flags to catch:**

- ❌ `ENV=value cmd` (Unix shell syntax)
- ❌ `cmd1 && cmd2 && cmd3` (ok, but chains should use `||` awareness)
- ❌ `./local/path/script.sh` (relative Unix paths, should use cross-platform tools)
- ❌ Commands like `sed`, `awk`, `grep`, `cat` without explicit cross-platform wrapper
- ❌ `;` as statement terminator (use `&&` for failure awareness)
- ✅ Allow: `cross-env`, `npx`, `node`, `pnpm`, `npm`, `tsx`, `vitest`, etc.

**Implementation difficulty:** Medium (2-3 hours)

```javascript
// scripts/lint-scripts.cjs
const pattern = /^\s*"[^"]+"\s*:\s*"(.*)"\s*$/gm;
// Regex checks: ENV=value, unsafe commands, Unix paths
```

### Would It Catch This Bug?

✅ **YES** — Directly matches `RECORD=true pnpm` (ENV=value pattern)

### Pattern Checklist

```
✅ ENV=value cmd                   — Unix shell syntax
✅ ./scripts/foo.sh               — Unix path
✅ sed, awk, grep, cat (bare)     — Unix-only commands
❌ cross-env ENV=value cmd        — Safe (explicitly caught)
❌ npx tsx ...                     — Safe (cross-platform)
❌ pnpm run ...                    — Safe (cross-platform)
✅ rm -rf                          — Dangerous (use rimraf)
✅ find . -name "*.ts"            — Unix-only (use glob)
```

### Platform Support

- **Where it runs:** Any CI system with Node.js
- **Hook integration:** Pre-commit, CI lint job, or `pnpm verify` step
- **Failure mode:** Exit 1 if violations found, blocks commit/merge

### Maintenance Burden

- **Initial:** 2-3 hours to write and test
- **Ongoing:** Low — rules rarely change
- **Maintenance:** Part of CI standard flow

### Ecosystem Precedent

- ⚠️ **Uncommon:** Few projects have this (most rely on devDependencies + cross-env)
- ✅ **Linting is standard:** Fits alongside eslint, prettier patterns
- ✅ **Preventive:** Catches bugs before CI

### Is It Complementary or Replacement?

**COMPLEMENTARY, not replacement:**

| Approach    | Catches             | Scope                    |
| ----------- | ------------------- | ------------------------ |
| cross-env   | ✅ Solves this bug  | Active environment setup |
| Lint script | ✅ Catches patterns | Detection + prevention   |

**Why both?**

- **Lint script** prevents _future_ bugs (new scripts written with Unix syntax)
- **cross-env** fixes _this_ bug (immediate relief)
- **Together:** Prevent regression + catch at authoring time

### Strengths

- Catches future instances (not just this one)
- Educational (helps team learn cross-platform patterns)
- Low maintenance (static rules)
- Fits project workflow (already have eslint, prettier)

### Weaknesses

- **Does nothing for existing code** (still need cross-env or Option 4)
- **Tool complexity:** Another linter to maintain
- **False positives possible:** Legitimate use cases for Unix-only scripts
- **CI overhead:** One more check in pipeline
- **Not a complete solution:** Only catches obvious patterns, not all Windows issues

---

## Comparative Summary

| Criterion               | Option 1     | Option 2 | Option 3 | Option 4 | Option 5   |
| ----------------------- | ------------ | -------- | -------- | -------- | ---------- |
| **Works on Windows**    | ✅           | ⚠️       | ✅       | ✅       | N/A        |
| **Works on CI**         | ✅           | ⚠️       | ✅       | ✅       | ✅         |
| **New dependencies**    | ✅ cross-env | None     | None     | None     | None       |
| **One-liner**           | ✅           | ✅       | ✅       | ❌       | ❌         |
| **Maintenance burden**  | Low          | High     | Low-Med  | Low      | Low-Med    |
| **Failure modes**       | Few          | Many     | Few      | Few      | Edge cases |
| **Ecosystem precedent** | ✅✅         | ❌       | ⚠️       | ✅       | ⚠️         |
| **Readability**         | ✅           | ❌       | ✅       | ✅       | ✅         |
| **Future-proof**        | ✅           | ❌       | ⚠️       | ✅       | ✅✅       |

---

## Recommendation

### Primary: **Option 4 (Dedicated tsx Script)**

**Why:**

- **Immediate:** Solves the bug now (no npm registry needed)
- **Consistent:** Exact same pattern as existing `prompts:sync` script
- **Zero new deps:** tsx already in devDeps
- **Maintainable:** Readable TypeScript, self-documenting
- **Scalable:** Can extend for `benchmark:ci`, `benchmark:check` modes
- **Proven:** Works in your CI already (prompts:sync uses this)

**Action:**

```bash
# Create scripts/record-snapshots.ts
# Update package.json: "benchmark:record": "tsx scripts/record-snapshots.ts"
```

---

### Secondary: **Option 1 (cross-env) as Fallback**

**Why:**

- If team prefers not to add a script file
- One-liner, minimal learning curve
- Standard npm ecosystem choice

**Action:**

```bash
pnpm add -D cross-env
# Update: "benchmark:record": "cross-env RECORD=true pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts"
```

---

### Complementary: **Option 5 (CI Lint Script)**

**Rationale:**

- Prevents regression for _future_ scripts
- Catches author mistakes at commit time
- Low ongoing maintenance

**Action:**

- Add to `pnpm verify` or pre-commit hook
- Check for patterns: `ENV=value`, `./scripts/*.sh`, bare `sed/awk/grep/cat`

---

## Not Recommended

### Option 2 (node -e inline)

- ❌ Quote escaping will fail on someone's Windows setup
- ❌ Not idiomatic in Node.js ecosystem
- ❌ Hard to debug when it breaks

### Option 3 (npx cross-env)

- ❌ Adds 3-5s to every benchmark run
- ❌ Network-dependent (fails offline)
- ⚠️ Unconventional for dev scripts

---

## Implementation Timeline

**Option 4 (Recommended):** 15 minutes

```bash
# Create script
touch scripts/record-snapshots.ts
# Edit package.json script line
# Run: npm run benchmark:record
```

**Option 1 (Fallback):** 5 minutes

```bash
pnpm add -D cross-env
# Edit package.json script line
# Run: npm run benchmark:record
```

**Option 5 (Complementary):** 2-3 hours

- Write lint rules (~1h)
- Test on various scripts (~1h)
- Integrate into CI (~30min)
