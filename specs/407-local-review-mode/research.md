# Research Document: Local Review Mode & Terminal Reporter

**Feature Branch**: `407-local-review-mode`
**Date**: 2026-02-01
**Status**: Complete

## Research Summary

This document consolidates research findings for implementing local review mode and terminal reporter functionality.

---

## 1. Technical Decisions

### Decision 1: CLI Framework

**Decision**: Use existing Commander.js (v14.x) patterns
**Rationale**: The codebase already uses Commander with established patterns for command registration, option parsing, and error handling. Consistency reduces cognitive load.
**Alternatives Considered**:

- Yargs: Would require migration, no clear benefit
- Building from scratch: Unnecessary complexity

### Decision 2: Diff Generation for Local Mode

**Decision**: Extend existing `diff.ts` module with working tree support
**Rationale**: The existing module handles SHA-to-SHA diffs with proper security validation. Extending it preserves security guarantees.
**Implementation Notes**:

- Add `getLocalDiff()` function for working tree comparisons
- Reuse `getDiff()` for commit range mode
- Use `git diff HEAD` for uncommitted, `git diff --cached` for staged

### Decision 3: Reporter Architecture

**Decision**: Create new `terminal.ts` reporter following existing pattern
**Rationale**: GitHub and ADO reporters follow a consistent dispatch pattern. A terminal reporter fits this model and reuses ~80% of formatting utilities.
**Key Reuse**:

- `formats.ts` (fingerprints, summaries, severity emoji)
- `base.ts` (comment formatting)
- `line-resolver.ts` (finding validation)
- `sanitize.ts` (finding sanitization)

### Decision 4: Zero-Config Defaults

**Decision**: Generate sensible defaults when `.ai-review.yml` is absent
**Rationale**: Spec requires first-review-in-60-seconds experience. Forcing config creation adds friction.
**Default Configuration**:

- Single AI review pass using detected provider (from env vars)
- No static analysis (requires tool installation)
- Conservative limits (10 findings, $0.10 budget)

### Decision 5: Git Context Inference

**Decision**: Create new `git-context.ts` module for repository detection
**Rationale**: No existing code for finding repo root, current branch, or default base branch.
**Functions Needed**:

- `findGitRoot(cwd)` - Walk up directory tree
- `getCurrentBranch(repoPath)` - `git rev-parse --abbrev-ref HEAD`
- `detectDefaultBranch(repoPath)` - Try main/master/develop
- `hasUncommittedChanges(repoPath)` - `git status --porcelain`
- `hasStagedChanges(repoPath)` - `git diff --cached --name-only`

### Decision 6: Package Publishing Strategy

**Decision**: Publish existing `@odd-ai-reviewers/router` as `@oddessentials/ai-review`
**Rationale**: Single package with all functionality, matches spec requirement.
**Changes Needed**:

- Update `package.json` name field
- Add npm publish workflow
- Update bin entry to expose `ai-review`

---

## 2. Existing Code Analysis

### CLI Structure (router/src/main.ts)

**Current Commands**:
| Command | Status | Purpose |
|---------|--------|---------|
| `ai-review review` | Exists | CI-based review (requires --repo, --base, --head) |
| `ai-review validate` | Exists | Config validation |
| `ai-review config init` | Exists | Interactive config wizard |
| `ai-review .` | **Missing** | Local review mode (to implement) |

**Key Patterns**:

```typescript
// Command registration
program
  .command('review')
  .requiredOption('--repo <path>')
  .action(async (options) => runReview(options));

// Exit handler abstraction (for testing)
type ExitHandler = (code: number) => void;

// Dependency injection
interface ReviewDependencies {
  env?: Record<string, string | undefined>;
  exitHandler?: ExitHandler;
}
```

### Diff Generation (router/src/diff.ts)

**Existing Functions** (reusable):

- `getDiff(repoPath, baseSha, headSha)` - SHA-to-SHA comparison
- `normalizeGitRef(repoPath, ref)` - Resolve refs to SHAs
- `resolveReviewRefs(repoPath, base, head)` - Merge commit detection
- `filterFiles(files, filter)` - Path filtering
- `canonicalizeDiffFiles(files)` - Path normalization

**Missing for Local Mode**:

- Working tree diff (`git diff HEAD`)
- Staged-only diff (`git diff --cached`)
- Git root detection
- Branch detection

### Reporter System (router/src/report/)

**Existing Pattern**:

```typescript
// Each reporter exports:
export async function reportToGitHub(
  findings: Finding[],
  partialFindings: Finding[],
  context: GitHubContext,
  config: Config,
  diffFiles: DiffFile[]
): Promise<ReportResult>

// Common pipeline:
1. canonicalizeDiffFiles()
2. buildLineResolver() → normalizeFindingsForDiff()
3. deduplicateFindings()
4. sortFindings()
5. generateSummaryMarkdown()
6. Platform-specific output
```

**Reusable Utilities**:

- `getSeverityEmoji(severity)` - '🔴', '🟡', '🔵'
- `formatInlineComment(finding)` - Markdown formatting
- `getAgentIcon(agentId)` - Agent emoji mapping
- `generateSummaryMarkdown(findings)` - Summary generation
- `countBySeverity(findings)` - Counting helper

### Agent System (router/src/agents/)

**Execution Flow** (fully reusable):

```typescript
// phases/execute.ts
executeAllPasses(config, agentContext, env, budgetCheck, options)
  → { completeFindings, partialFindings, allResults, skippedAgents }
```

**No changes needed** - local mode uses identical agent execution.

---

## 3. Technical Gaps

### Gap 1: Git Context Inference

**Status**: Not implemented
**Files to Create**: `router/src/cli/git-context.ts`
**Functions**:

```typescript
interface GitContext {
  repoRoot: string;
  currentBranch: string;
  defaultBase: string;
  hasUncommitted: boolean;
  hasStaged: boolean;
}

findGitRoot(cwd: string): string
getCurrentBranch(repoPath: string): string
detectDefaultBranch(repoPath: string): string
checkUncommittedChanges(repoPath: string): boolean
checkStagedChanges(repoPath: string): boolean
inferGitContext(cwd: string): GitContext
```

### Gap 2: Working Tree Diff

**Status**: Not implemented
**File to Modify**: `router/src/diff.ts`
**New Function**:

```typescript
getLocalDiff(
  repoPath: string,
  baseRef: string,
  options: { stagedOnly?: boolean; uncommitted?: boolean }
): DiffSummary
```

**Implementation Note**: `DiffSummary.source` field already exists with value `'local-git'`. For working tree diffs, consider whether to:

- Keep `'local-git'` (simpler, existing consumers unaffected)
- Add `'working-tree'` variant (more precise, requires auditing existing usages)

Recommendation: Keep `'local-git'` for v1 to minimize breaking changes. The distinction can be inferred from the diff generation context.

### Gap 3: Terminal Reporter

**Status**: Not implemented
**File to Create**: `router/src/report/terminal.ts`
**Interface**:

```typescript
interface TerminalContext {
  colored: boolean;
  verbose: boolean;
  quiet: boolean;
  format: 'pretty' | 'json' | 'sarif';
}

reportToTerminal(
  findings: Finding[],
  partialFindings: Finding[],
  context: TerminalContext,
  config: Config,
  diffFiles: DiffFile[]
): Promise<ReportResult>
```

### Gap 4: Zero-Config Defaults

**Status**: Not implemented
**File to Create**: `router/src/config/defaults.ts`
**Function**:

```typescript
generateZeroConfigDefaults(env: Record<string, string | undefined>): Config
```

### Gap 5: Local Review Command

**Status**: Not implemented
**File to Modify**: `router/src/main.ts`
**New Command**:

```typescript
program
  .command('<path>')
  .option('--base <ref>')
  .option('--head <ref>')
  .option('--range <range>')
  .option('--staged')
  .option('--format <fmt>')
  .option('--no-color')
  .option('--quiet')
  .option('--verbose')
  .option('--dry-run')
  .option('--cost-only')
  .option('-c, --config <path>')
  .action(runLocalReview);
```

---

## 4. Security Considerations

### Inherited from Existing Code

- **Input validation**: All git refs validated via `assertSafeGitRef()`
- **Path validation**: All paths validated via `assertSafePath()`
- **No shell execution**: Uses `execFileSync` with `shell: false`
- **Token isolation**: Provider tokens not passed to agent subprocesses

### New Considerations

- **Working tree access**: Safe - uses same validation as SHA mode
- **Zero-config mode**: Must warn users about API key usage
- **Cost estimation**: Must not execute agents

---

## 5. Performance Considerations

### Existing Limits (enforced)

- Max 5000 files per diff
- Max 50MB diff output
- Token budget per PR
- USD budget per PR/month

### Local Mode Additions

- Large diff warning threshold: 10,000 lines
- Pre-commit timeout: Configurable, suggest 30s default
- Cost estimation: Skip agent execution entirely

---

## 6. Constitution Compliance

### Principle I: Router Owns All Posting

**Status**: ✅ Compliant
**Rationale**: Terminal reporter outputs to stdout, not to external APIs. No posting to GitHub/ADO in local mode.

### Principle II: Structured Findings Contract

**Status**: ✅ Compliant
**Rationale**: Uses existing Finding schema, deduplication, sorting. Terminal reporter consumes normalized findings.

### Principle III: Provider-Neutral Core

**Status**: ✅ Compliant
**Rationale**: Terminal reporter is just another output target, no provider-specific logic in core.

### Principle IV: Security-First Design

**Status**: ✅ Compliant
**Rationale**: Reuses existing input validation. No new credential handling.

### Principle V: Deterministic Outputs

**Status**: ✅ Compliant
**Rationale**: Same sorting and deduplication as CI mode. Identical findings for same inputs.

### Principle VI: Bounded Resources

**Status**: ✅ Compliant
**Rationale**: Existing limits enforced. Adds large-diff warning.

### Principle VII: Environment Discipline

**Status**: ⚠️ Partial
**Rationale**: Local mode runs outside CI environment. Documented as developer tool, not CI replacement.

### Principle VIII: Explicit Non-Goals

**Status**: ✅ Compliant
**Rationale**: Local mode complements CI, doesn't replace it.

---

## 7. Dependencies

### Existing (no changes)

- commander: CLI framework
- minimatch: Glob patterns
- zod: Schema validation
- yaml: Config parsing
- @anthropic-ai/sdk, openai: LLM clients

### New (optional)

- chalk: Terminal colors (consider - provides cross-platform ANSI)
- ora: Spinners for progress (consider - already has progress in spec)

**Recommendation**: Avoid new dependencies. Use raw ANSI codes with `--no-color` fallback.

---

## 8. Testing Strategy

### Unit Tests

- `git-context.ts` - Mock `execFileSync`, test git command outputs
- `terminal.ts` - Test finding formatting, color codes, summary generation
- `defaults.ts` - Test config generation for various env combinations

### Integration Tests

- Local review command end-to-end
- Staged-only mode
- Range mode
- Zero-config mode

### Parity Tests (Victory Gate)

- Same diff + same config → same findings (local vs CI)
- Verified across multiple agent types

---

## References

- Spec: `specs/407-local-review-mode/spec.md`
- Definition of Done: `specs/407-local-review-mode/definition-of-done.md`
- Victory Gates: `specs/407-local-review-mode/victory-gates.md`
- CLI Invariants: `specs/407-local-review-mode/cli-invariants.md`
- Constitution: `.specify/memory/constitution.md`
