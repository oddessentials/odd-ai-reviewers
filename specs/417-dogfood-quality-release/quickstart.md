# Quickstart: 417 Dogfood Quality Release

## Prerequisites

```bash
node --version   # >= 22.0.0
pnpm --version   # >= 10.0.0
```

## Setup

```bash
git checkout 417-dogfood-quality-release
pnpm install
pnpm build
```

## Verify Current State

```bash
# Run existing tests (should all pass — baseline)
pnpm --filter ./router test

# Confirm the --pass bug reproduces
node router/dist/main.js local . --pass cloud-ai --range "HEAD~1..HEAD"
# Expected: "Missing required dependencies" (semgrep blocks cloud-ai)

# Confirm blocklist bug
node -e "console.log(/\b(?:sanitiz)\b/i.test('sanitize'))"
# Expected: false (the bug)
```

## Phase-by-Phase Verification

### After Phase 1 (CLI Filtering)

```bash
# --pass should now work
node router/dist/main.js local . --pass cloud-ai --dry-run --range "HEAD~1..HEAD"
# Expected: Only shows opencode, pr_agent (not semgrep, reviewdog)

# Invalid pass should error
node router/dist/main.js local . --pass nonexistent --dry-run
# Expected: "Unknown pass 'nonexistent'. Available: static, cloud-ai"

# Invalid agent should error
node router/dist/main.js local . --agent fake --dry-run
# Expected: "Unknown agent 'fake'. Valid: semgrep, reviewdog, ..."

# Run plan serialization golden tests
pnpm --filter ./router test -- --grep "execution-plan"
```

### After Phase 3 (Suppressor Fixes)

```bash
# Blocklist fix verified
node -e "
const FIXED = /\b(?:sanitiz\w*|escap\w*|authenti\w*|authoriz\w*|deseria\w*|vulnerab\w*)\b/i;
console.log(FIXED.test('sanitize'));       // true
console.log(FIXED.test('authentication')); // true
console.log(FIXED.test('vulnerability'));  // true
"

# Run suppressor tests
pnpm --filter ./router test -- --grep "framework-pattern-filter|finding-validator"
```

### After Phase 4 (Architecture)

```bash
# Run full test suite
pnpm --filter ./router test

# Run benchmark regression
pnpm --filter ./router test -- --grep "benchmark"
```

### After Phase 5 (DX)

```bash
# Pre-push bail test
echo "test('fail', () => { expect(1).toBe(2) })" > /tmp/test-bail.ts
# (manual: verify git push exits fast on failure)

# Coverage CI thresholds
pnpm --filter ./router run test:ci-thresholds
```

## Full Verification

```bash
pnpm --filter ./router test
pnpm lint
pnpm typecheck
pnpm run build
```
