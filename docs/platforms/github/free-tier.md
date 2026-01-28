# GitHub Free Setup

Zero-cost AI code review using only free GitHub features and open-source tools. No API keys required.

## Features Included

| Feature                     | Description                                               | Cost                                             |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| **Semgrep Static Analysis** | Security vulnerability detection (28+ CWE/OWASP patterns) | Free                                             |
| **GitHub Actions**          | CI/CD execution environment                               | Free (2,000 min/month private, unlimited public) |
| **Check Runs**              | Annotations on PR diffs                                   | Free                                             |
| **PR Comments**             | Inline code review comments                               | Free                                             |
| **Summary Reports**         | Overview of findings per PR                               | Free                                             |

## What You Get

- Automatic security scanning on every PR
- Detection of common vulnerabilities (SQL injection, XSS, command injection, etc.)
- Inline annotations on problematic code
- Summary comment with all findings
- Check status (pass/fail) based on findings

## Setup Instructions

### Step 1: Add the Workflow File

Create `.github/workflows/ai-review.yml` in your repository:

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

jobs:
  ai-review:
    # Only run on PRs from the same repo (not forks) for security
    if: |
      github.event_name == 'push' ||
      github.event.pull_request.head.repo.full_name == github.repository

    uses: oddessentials/odd-ai-reviewers/.github/workflows/ai-review.yml@main
    with:
      target_repo: ${{ github.repository }}
      target_ref: ${{ github.sha }}
      pr_number: ${{ github.event.pull_request.number }}
    # No secrets needed for free tier!
```

### Step 2: Add the Configuration File

Create `.ai-review.yml` at your repository root:

```yaml
version: 1
trusted_only: true

passes:
  # Static analysis only - no API keys required
  - name: static
    agents: [semgrep]
    enabled: true
    required: true # Fail the check if semgrep finds issues

limits:
  max_files: 50 # Skip very large PRs
  max_diff_lines: 2000 # Truncate large diffs

reporting:
  github:
    mode: checks_and_comments # Both check annotations and PR comments
    max_inline_comments: 20 # Limit comment spam
    summary: true # Post summary comment

gating:
  enabled: false # Set to true to block merging on errors
  fail_on_severity: error # Only block on errors, not warnings
```

### Step 3: Test It

1. Create a new branch
2. Add some code (try adding a file with a potential security issue)
3. Open a Pull Request
4. Watch the "AI Review" check run

## No Secrets Required

The free tier uses:

- **GITHUB_TOKEN** - Automatically provided by GitHub Actions (no setup needed)
- **Semgrep** - Open-source, no account required, uses `--config=auto`

## Supported Languages

Semgrep provides static analysis for:

- TypeScript/JavaScript (.ts, .tsx, .js, .jsx)
- Python (.py)
- Go (.go)
- Java (.java)
- Ruby (.rb)
- PHP (.php)
- C/C++ (.c, .cpp)
- C# (.cs)
- Rust (.rs)
- Swift (.swift)
- Kotlin (.kt)
- Scala (.scala)

## Example Output

When Semgrep finds issues, you'll see:

1. **Check Run Annotations** - Inline markers on the PR diff
2. **PR Comment** - Summary of all findings:

```
## AI Review Summary

### Findings (3)

| Severity | File | Line | Message |
|----------|------|------|---------|
| error | src/api.ts | 42 | Potential SQL injection vulnerability |
| warning | src/auth.ts | 15 | Hardcoded secret detected |
| info | src/utils.ts | 88 | Unused variable |

---
*Reviewed by [odd-ai-reviewers](https://github.com/oddessentials/odd-ai-reviewers)*
```

## Upgrading to AI-Powered Review

Want deeper semantic analysis? See [GitHub Max Setup](./max-tier.md) for:

- AI-powered code review (OpenCode agent)
- Natural language explanations
- Context-aware suggestions
- Multiple LLM provider options

## Troubleshooting

### Check doesn't appear

1. Verify `.github/workflows/ai-review.yml` exists
2. Check the Actions tab for errors
3. Ensure the workflow file syntax is valid

### Fork PRs are skipped

This is intentional for security. Fork PRs don't have access to secrets and could potentially run malicious code. To enable (not recommended for public repos):

```yaml
# In .ai-review.yml
trusted_only: false
```

### No findings on my code

Semgrep uses pattern-based detection. If no patterns match:

- Your code may be following good practices
- The language might have fewer rules
- Consider upgrading to AI-powered review for semantic analysis

## Related Documentation

- [Configuration Reference](../../configuration/config-schema.md)
- [Security Model](../../architecture/security.md)
- [Architecture](../../architecture/overview.md)
