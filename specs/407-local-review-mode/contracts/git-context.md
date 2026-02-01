# Git Context Module Contract

**Feature Branch**: `407-local-review-mode`
**Date**: 2026-02-01

---

## Module Interface

### Location

`router/src/cli/git-context.ts`

### Exports

```typescript
export interface GitContext {
  repoRoot: string;
  currentBranch: string;
  defaultBase: string;
  hasUncommitted: boolean;
  hasStaged: boolean;
}

export interface GitContextError {
  code: 'NOT_GIT_REPO' | 'GIT_NOT_FOUND' | 'INVALID_PATH';
  message: string;
  path?: string;
}

export function inferGitContext(cwd: string): Result<GitContext, GitContextError>;

export function findGitRoot(cwd: string): Result<string, GitContextError>;

export function getCurrentBranch(repoPath: string): string;

export function detectDefaultBranch(repoPath: string): string;

export function hasUncommittedChanges(repoPath: string): boolean;

export function hasStagedChanges(repoPath: string): boolean;

export function getLocalDiff(
  repoPath: string,
  baseRef: string,
  options: LocalDiffOptions
): Result<DiffSummary, GitContextError>;

export interface LocalDiffOptions {
  stagedOnly?: boolean;
  uncommitted?: boolean;
}
```

---

## Function Contracts

### findGitRoot(cwd: string)

**Purpose**: Find the root directory of a git repository.

**Algorithm**:

1. Start at `cwd`
2. Check if `.git` directory or file exists
3. If not found, move to parent directory
4. Repeat until filesystem root reached
5. Return error if no `.git` found

**Git Command**: None (filesystem traversal only)

**Returns**:

- `Ok(path)` - Absolute path to repository root
- `Err({ code: 'NOT_GIT_REPO', message, path })` - Not in a git repository

---

### getCurrentBranch(repoPath: string)

**Purpose**: Get the current branch name.

**Git Command**:

```bash
git rev-parse --abbrev-ref HEAD
```

**Returns**:

- Branch name (e.g., "main", "feature/foo")
- "HEAD" if in detached HEAD state

**Throws**: Never (returns "HEAD" on any error)

---

### detectDefaultBranch(repoPath: string)

**Purpose**: Detect the default/base branch for the repository.

**Algorithm**:

1. Try `git symbolic-ref refs/remotes/origin/HEAD` (remote default)
2. If fails, check if `main` exists locally or remotely
3. If fails, check if `master` exists locally or remotely
4. If fails, check if `develop` exists locally or remotely
5. Fall back to first branch found

**Priority Order**:

1. `origin/HEAD` target (e.g., "origin/main")
2. Local `main` branch
3. Remote `origin/main` branch
4. Local `master` branch
5. Remote `origin/master` branch
6. Local `develop` branch
7. First available branch

**Returns**: Branch name (always returns something)

---

### hasUncommittedChanges(repoPath: string)

**Purpose**: Check if working tree has uncommitted changes.

**Git Command**:

```bash
git status --porcelain
```

**Returns**:

- `true` if output is non-empty
- `false` if output is empty

**Notes**:

- Includes both staged and unstaged changes
- Excludes untracked files by default

---

### hasStagedChanges(repoPath: string)

**Purpose**: Check if index has staged changes.

**Git Command**:

```bash
git diff --cached --name-only
```

**Returns**:

- `true` if output is non-empty
- `false` if output is empty

---

### inferGitContext(cwd: string)

**Purpose**: Infer full git context for local review.

**Behavior**:

1. Call `findGitRoot(cwd)`
2. If error, return error
3. Call all other functions with repoRoot
4. Return combined `GitContext`

**Returns**:

- `Ok(GitContext)` - Full context object
- `Err(GitContextError)` - If not in git repository

---

### getLocalDiff(repoPath, baseRef, options)

**Purpose**: Generate diff for local review mode.

**Behavior by Options**:

| options                                   | Git Command                          |
| ----------------------------------------- | ------------------------------------ |
| `{ stagedOnly: true }`                    | `git diff --cached {baseRef}`        |
| `{ uncommitted: true }`                   | `git diff {baseRef}`                 |
| `{ stagedOnly: true, uncommitted: true }` | `git diff {baseRef}` (includes both) |
| `{}`                                      | `git diff {baseRef}`                 |

**Returns**:

- `Ok(DiffSummary)` - Diff between baseRef and working tree
- `Err(GitContextError)` - If git command fails

**Notes**:

- Uses same parsing logic as existing `getDiff()`
- Applies same file limits (5000 files, 50MB)
- Applies same path filtering

---

## Error Handling

### Error Codes

| Code            | Meaning                             | Resolution                     |
| --------------- | ----------------------------------- | ------------------------------ |
| `NOT_GIT_REPO`  | Path is not within a git repository | cd to git repo or specify path |
| `GIT_NOT_FOUND` | git executable not in PATH          | Install git                    |
| `INVALID_PATH`  | Path does not exist                 | Check path argument            |

### Error Messages

```
NOT_GIT_REPO:
  "Not a git repository (or any parent up to mount point {root})"

GIT_NOT_FOUND:
  "git command not found. Please install git and ensure it's in your PATH."

INVALID_PATH:
  "Path does not exist: {path}"
```

---

## Security Considerations

### Input Validation

All inputs validated before passing to git commands:

```typescript
// Path validation (from existing assertSafePath)
assertSafePath(cwd);
assertSafePath(repoPath);

// Ref validation (from existing assertSafeGitRef)
assertSafeGitRef(baseRef);
```

### Execution Safety

- Use `execFileSync` with `shell: false`
- Set `cwd` to validated repo path
- Timeout: 30 seconds for all commands

---

## Example Usage

```typescript
import { inferGitContext, getLocalDiff } from './git-context.js';
import { isOk } from '../types/result.js';

// Infer context
const contextResult = inferGitContext(process.cwd());
if (!isOk(contextResult)) {
  console.error(contextResult.error.message);
  process.exit(2);
}

const context = contextResult.value;
console.log(`Repository: ${context.repoRoot}`);
console.log(`Branch: ${context.currentBranch}`);
console.log(`Base: ${context.defaultBase}`);
console.log(`Uncommitted: ${context.hasUncommitted}`);
console.log(`Staged: ${context.hasStaged}`);

// Get diff
const diffResult = getLocalDiff(context.repoRoot, context.defaultBase, { uncommitted: true });

if (isOk(diffResult)) {
  console.log(`Files changed: ${diffResult.value.files.length}`);
}
```

---

## Test Cases

### findGitRoot

1. ✓ Returns repo root when in root directory
2. ✓ Returns repo root when in subdirectory
3. ✓ Returns error when not in git repository
4. ✓ Handles paths with spaces
5. ✓ Handles Windows paths (backslashes)

### getCurrentBranch

1. ✓ Returns branch name on normal branch
2. ✓ Returns "HEAD" in detached HEAD state
3. ✓ Works with branch names containing slashes

### detectDefaultBranch

1. ✓ Detects `main` when available
2. ✓ Falls back to `master` when no `main`
3. ✓ Uses remote default when available
4. ✓ Handles repos with no remote

### hasUncommittedChanges

1. ✓ Returns true when files modified
2. ✓ Returns false when clean
3. ✓ Ignores untracked files

### hasStagedChanges

1. ✓ Returns true when files staged
2. ✓ Returns false when nothing staged
3. ✓ Distinguishes staged from unstaged

### getLocalDiff

1. ✓ Generates diff for uncommitted changes
2. ✓ Generates diff for staged-only changes
3. ✓ Handles no changes (empty diff)
4. ✓ Respects file limits
5. ✓ Applies path filters
