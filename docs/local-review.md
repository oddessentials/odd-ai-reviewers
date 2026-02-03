# Local Review Mode

Local review mode allows you to run AI-powered code reviews directly on your local machine without needing CI/CD integration. This is useful for:

- Pre-commit review of your changes before pushing
- Quick feedback during development
- Testing your configuration locally
- Reviewing changes in private repositories

## Quick Start

```bash
# Review current directory (uncommitted changes)
ai-review .

# Review a specific directory
ai-review local /path/to/repo

# Review staged changes only
ai-review local --staged

# Review changes compared to main branch
ai-review local --range main...HEAD
```

## Command Aliases

The `local` command has an alias `local-review` for discoverability:

```bash
# These are equivalent
ai-review local .
ai-review local-review .
```

Both commands execute the same handler with identical behavior.

## Range Operators

When comparing commits, you can use two different range operators that behave differently:

### Three-dot (`...`) - Symmetric Difference (Default)

The three-dot operator compares against the **merge-base** of the two refs. This shows only the changes introduced on the head branch since it diverged from the base.

```bash
ai-review local --range main...HEAD
```

**Use this for**: Typical PR reviews where you want to see only your feature branch changes.

### Two-dot (`..`) - Direct Comparison

The two-dot operator does a direct comparison between the two refs. This shows all commits reachable from HEAD but not from the base.

```bash
ai-review local --range main..HEAD
```

**Use this for**: When you need to see all changes including any merged commits.

### Visual Comparison

```
      A---B---C  feature (HEAD)
     /
D---E---F---G    main

--range main...HEAD  →  Reviews commits A, B, C (feature branch changes only)
--range main..HEAD   →  Reviews commits A, B, C (may include merge effects)
```

### Default Behavior

When you specify a single ref without an operator:

```bash
ai-review local --range main
```

The default operator is `...` (three-dot), which is equivalent to `main...HEAD`.

### Range Syntax Examples

| Syntax            | Description                                     |
| ----------------- | ----------------------------------------------- |
| `main...HEAD`     | Changes since diverging from main (recommended) |
| `main..HEAD`      | Direct comparison to main                       |
| `HEAD~3...HEAD`   | Last 3 commits (merge-base comparison)          |
| `HEAD~3..`        | Last 3 commits (shorthand, defaults to HEAD)    |
| `main`            | Single ref, defaults to `main...HEAD`           |
| `abc123...def456` | Between two specific commits                    |

## Error Handling

### Malformed Range Errors

The CLI validates range syntax before making any git calls:

| Error              | Example                | Message                                                 |
| ------------------ | ---------------------- | ------------------------------------------------------- |
| Multiple operators | `main..feature..extra` | "Invalid range format: multiple operators found"        |
| Missing refs       | `..` or `...`          | "Invalid range format: requires at least one reference" |
| Empty base ref     | `..HEAD`               | "Invalid range format: empty base reference"            |

### Invalid Git Ref Errors

After syntax validation passes, the CLI validates that refs exist in git:

```bash
# This will fail with INVALID_GIT_REF error
ai-review local --range main...nonexistent-branch
```

Error message: "Git reference not found: 'nonexistent-branch'. Verify the branch or commit exists."

## Diff Modes

Local review supports three diff modes:

### 1. Uncommitted Changes (Default)

Reviews all uncommitted changes in the working tree:

```bash
ai-review local .
ai-review local --uncommitted
```

### 2. Staged Changes Only

Reviews only changes that have been staged with `git add`:

```bash
ai-review local --staged
```

### 3. Commit Range

Reviews changes between two commits:

```bash
ai-review local --range main...HEAD
ai-review local --base main --head feature
```

## See Also

- [CLI Reference](./reference/cli.md) - Full command reference
- [Configuration](./configuration/config-schema.md) - Configuration options
- [Cost Controls](./configuration/cost-controls.md) - Budget management
