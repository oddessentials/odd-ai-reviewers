# Security Model

This document describes the security architecture and best practices for odd-ai-reviewers.

---

## Trust Model

odd-ai-reviewers operates with a clear trust boundary:

- **odd-ai-reviewers executes in CI jobs** and must be treated as untrusted by the host
- **Agent processes do not receive GitHub / ADO tokens** unless explicitly required
- **Only the router/reporting layer** interacts with provider APIs
- **Fork PRs are not supported by default** on self-hosted runners
- **Secrets use provider-native injection only** — no custom secret management

```
┌─────────────────────────────────────────────────────────┐
│ CI Runtime (GitHub Actions / Azure Pipelines / OSCR)    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Router (has GITHUB_TOKEN / SYSTEM_ACCESSTOKEN)  │   │
│  │  ├── Posts findings to PR                       │   │
│  │  └── Creates check runs                         │   │
│  └─────────────────────────────────────────────────┘   │
│       │                                                 │
│       ▼ (stripped tokens)                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Agents (semgrep, opencode, local_llm, etc.)     │   │
│  │  └── No access to posting credentials           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Threat Model

### Untrusted Code Execution

**Risk**: Malicious code in a fork PR could attempt to:

- Steal secrets via environment variables
- Exfiltrate source code
- Manipulate review results

**Mitigation**:

- Fork PRs are blocked by default (`trusted_only: true`)
- Review runs in isolated containers
- Secrets are injected only for specific agents

### Secret Exposure

**Risk**: API keys or tokens could be leaked through:

- Log output
- Error messages
- Network requests

**Mitigation**:

- Secrets are never logged
- Container runs with minimal permissions
- Network egress limited to known endpoints

### Denial of Service

**Risk**: Malicious PRs could:

- Trigger expensive LLM calls
- Overwhelm the review system
- Exhaust monthly budgets

**Mitigation**:

- Per-PR limits on files, lines, tokens, cost
- Monthly budget caps
- Static analysis runs first (free)

## Security Controls

### 1. Fork PR Blocking

By default, PRs from forks do not trigger AI review:

```yaml
# Default behavior
trusted_only: true
```

This prevents:

- Untrusted code from accessing secrets
- Attackers from probing your review configuration
- Budget exhaustion via external PRs

### 2. Minimal Permissions

The GitHub workflow requests only necessary permissions:

```yaml
permissions:
  contents: read # Read repository content
  pull-requests: write # Post comments
  checks: write # Create check runs
```

### 3. Secret Handling

Secrets are:

- Stored in GitHub's encrypted secret store
- Injected only when needed
- Never printed to logs
- Never included in artifacts

### 4. Container Isolation

The review router runs in an isolated container:

- Non-root user
- Read-only filesystem where possible
- No persistent storage
- Fresh workspace per run

### 5. Input Validation

All inputs are validated:

- Configuration schema enforcement (Zod)
- Path traversal prevention
- Command injection protection

## Best Practices

### For Repository Owners

1. **Keep `trusted_only: true`** for public repositories
2. **Use organization secrets** for shared API keys
3. **Set conservative budgets** to limit exposure
4. **Review the configuration** before enabling

### For Organization Admins

1. **Audit secret access** regularly
2. **Monitor monthly spending** via budget reports
3. **Restrict workflow permissions** at org level

### For Contributors

1. **Never commit secrets** to the repository
2. **Don't modify workflow files** without review
3. **Report security issues** via responsible disclosure

## Incident Response

If you suspect a security breach:

1. **Rotate all API keys** immediately
2. **Review workflow run logs** for anomalies
3. **Check secret access logs** in GitHub
4. **Disable the workflow** temporarily if needed

## Reporting Vulnerabilities

Please report security vulnerabilities via:

- GitHub Security Advisories
- Email: security@oddessentials.com

Do not open public issues for security vulnerabilities.
